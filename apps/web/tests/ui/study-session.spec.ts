import { expect, test, type Page } from '@playwright/test'

/**
 * Rendered check of the study session page. The API is mocked in the browser,
 * so these screenshots show the real client UI over FIXTURE data, not a live
 * collection. Selection logic is covered by core, API and e2e tests.
 */

const assumptions = [
  "Estimated recall is the model's estimate as of 2026-12-01 from the default FSRS-6 forgetting curve and each card's stored stability and last review. No custom weights were found for these cards, and it is not a validated prediction.",
  'New cards and cards with no stored stability or last review have no recall estimate.',
  'Suspended and buried cards are left out because the review queue refuses them.',
  'The list is a snapshot. Start opens exactly these cards. If one changed since this preview, the review queue refuses the list and you can preview again.',
  'Picking cards does not schedule or review anything. You answer each card yourself in the normal queue, and it counts as a real review.',
]

function makeCards(offset = 0, n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    id: 500 + offset + i,
    deckId: 1,
    deck: i % 2 ? 'Anatomy' : 'Biochemistry with a rather long deck name to test wrapping',
    label:
      i === 0
        ? 'What is the rate-limiting enzyme of glycolysis and what regulates it allosterically?'
        : `Card ${i}`,
    state: 2,
    lapses: 9 - Math.floor(i / 4), // all >= 3 so the rows agree with the minLapses=3 filter shown
    due: '2026-11-20T00:00:00.000Z',
    dueInDays: -11 + i * 0.5,
    recall: i === 19 ? null : 0.4 + i * 0.015,
    tags: i % 3 === 0 ? ['bio', 'chapter-3'] : ['bio'],
  }))
}

function session(cardList = makeCards(), over: Record<string, unknown> = {}) {
  return {
    ok: true,
    asOf: '2026-12-01T09:30:00.000Z',
    scanned: 9000,
    excluded: { suspended: 14, buried: 3, unreadableDue: 0 },
    funnel: [
      { key: 'eligible', label: 'Studyable cards', count: 8983 },
      { key: 'tags', label: 'With every chosen tag', count: 412 },
      { key: 'states', label: 'In the chosen states', count: 390 },
      { key: 'lapses', label: 'Within the lapse range', count: 57 },
    ],
    matched: 57,
    selected: cardList.length,
    truncated: true,
    noRecallEstimate: 0,
    fingerprint: 'a1b2c3d4',
    cards: cardList,
    startHref: '/review?cardIds=' + cardList.map((c) => c.id).join(','),
    assumptions,
    note: 'Nothing here is scheduled or reviewed for you. Start opens the review queue on exactly these cards. You answer each one yourself and it counts as a real review.',
    ...over,
  }
}

async function mock(page: Page, respond: () => unknown = () => session()) {
  const seen: string[] = []
  await page.route('**/api/study-session/preview**', (route) => {
    seen.push(new URL(route.request().url()).search)
    return route.fulfill({ json: respond() })
  })
  await page.route('**/api/decks', (route) =>
    route.fulfill({
      json: {
        decks: [
          { id: 1, name: 'Anatomy' },
          { id: 2, name: 'Biochemistry' },
        ],
      },
    }),
  )
  await page.route('**/review?cardIds=*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>review queue</body></html>' }),
  )
  return seen
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

async function expectLastControlClearsBottomNav(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const nav = page.getByRole('navigation', { name: 'Primary' })
  if (!(await nav.isVisible())) return
  const navTop = (await nav.boundingBox())!.y
  const last = await page.evaluate(() => {
    const all = [
      ...document.querySelectorAll('main button, main input, main a, main select'),
    ].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const el = all.at(-1)!
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { bottom: r.bottom, hit: hit === el || el.contains(hit) || !!hit?.contains(el) }
  })
  expect(last.bottom).toBeLessThanOrEqual(navTop)
  expect(last.hit).toBe(true)
}

async function expectNoOcclusion(page: Page) {
  const covered = await page
    .getByTestId('study-session-studio')
    .locator('button, input, select')
    .evaluateAll((els) =>
      els
        .map((el) => {
          el.scrollIntoView({ block: 'center' })
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return null
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return top && (top === el || el.contains(top) || top.contains(el))
            ? null
            : (el.getAttribute('data-testid') ?? el.tagName)
        })
        .filter(Boolean),
    )
  expect(covered).toEqual([])
}

for (const view of [
  { name: 'desktop', width: 1280, height: 900, reduced: false },
  { name: 'narrow', width: 390, height: 844, reduced: false },
  { name: 'reduced-motion', width: 1024, height: 800, reduced: true },
]) {
  test(`study session renders cleanly (${view.name})`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height })
    if (view.reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    const seen = await mock(page)

    await page.goto('/study-session')
    await expect(page.getByTestId('study-session-studio')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Choose what to study')).toBeVisible()
    expect(seen).toHaveLength(0)

    await page.getByTestId('session-tags').fill('bio')
    await page.getByTestId('session-lapses').fill('3')
    await page.getByTestId('session-state-2').check()
    await page.getByTestId('session-sort').selectOption('most-lapses')
    await page.getByTestId('session-preview').click()

    const headline = page.getByTestId('session-headline')
    await expect(headline).toBeVisible()
    await expect(headline).toContainText('20 cards picked from 57 that match, out of 9000 scanned')
    await expect(page.getByTestId('session-truncated')).toContainText(
      '37 more cards match but a session holds at most 20',
    )
    await expect(page.getByTestId('session-funnel')).toContainText('With every chosen tag')
    await expect(page.getByTestId('session-card')).toHaveCount(20)
    await expect(page.getByTestId('session-summary')).toContainText('14 suspended, 3 buried')
    await expect(page.getByTestId('session-assumptions')).toContainText(
      'not a validated prediction',
    )
    await expect(page.getByTestId('session-card').last()).toContainText('no estimate')
    await expect(page.getByTestId('study-session-studio')).not.toContainText(
      /guarantee|will pass|confidence interval|better learning|optimal/i,
    )
    const q = seen.at(-1)!
    for (const part of ['tags=bio', 'minLapses=3', 'states=2', 'sort=most-lapses', 'limit=20'])
      expect(q).toContain(part)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    await expectNoOcclusion(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `ui-screenshots/study-session-${view.name}-top.png` })
    await expectLastControlClearsBottomNav(page)
    await page.screenshot({ path: `ui-screenshots/study-session-${view.name}-bottom.png` })
    await page.screenshot({
      path: `ui-screenshots/study-session-${view.name}-page.png`,
      fullPage: true,
    })

    // Start opens exactly the previewed ids, in order.
    await page.getByTestId('session-start').scrollIntoViewIfNeeded()
    await page.getByTestId('session-start').click()
    await page.waitForURL(/\/review\?cardIds=/)
    expect(page.url()).toContain(
      'cardIds=' +
        makeCards()
          .map((c) => c.id)
          .join(','),
    )
  })
}

test('study session refuses an out-of-range size instead of clamping it', async ({ page }) => {
  const seen = await mock(page)
  await page.goto('/study-session')
  await page.getByTestId('session-limit').fill('101')
  await page.getByTestId('session-preview').click()
  await expect(page.getByTestId('session-form-error')).toContainText(
    'Cards per session must be 1 to 100',
  )
  expect(seen).toHaveLength(0)
  await page.getByTestId('session-limit').fill('100')
  await page.getByTestId('session-recall').fill('100')
  await page.getByTestId('session-preview').click()
  await expect(page.getByTestId('session-form-error')).toContainText('1 to 99 percent')
  expect(seen).toHaveLength(0)
})

test('study session does not start a different set than the one previewed', async ({ page }) => {
  let changed = false
  // Once a card changes, every later request returns the new set.
  await mock(page, () => (changed ? session(makeCards(1), { fingerprint: 'ffffffff' }) : session()))
  await page.goto('/study-session')
  await page.getByTestId('session-preview').click()
  await expect(page.getByTestId('session-card')).toHaveCount(20)
  changed = true
  await page.getByTestId('session-start').click()
  await expect(page.getByText('Your cards changed since the last preview')).toBeVisible()
  expect(page.url()).toContain('/study-session')
  // The list now shows the new set, and a second Start opens exactly that set.
  await expect(page.getByTestId('session-card').first()).toBeVisible()
  await page.getByTestId('session-start').click()
  await page.waitForURL(/\/review\?cardIds=/)
  expect(page.url()).toContain(
    'cardIds=' +
      makeCards(1)
        .map((c) => c.id)
        .join(','),
  )
})

for (const view of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
]) {
  test(`study session says which filter emptied the list (${view.name})`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height })
    await mock(page, () =>
      session([], {
        matched: 0,
        selected: 0,
        truncated: false,
        startHref: '',
        funnel: [
          { key: 'eligible', label: 'Studyable cards', count: 8983 },
          { key: 'tags', label: 'With every chosen tag', count: 412 },
          { key: 'lapses', label: 'Within the lapse range', count: 0 },
        ],
      }),
    )
    await page.goto('/study-session')
    await page.getByTestId('session-preview').click()
    await expect(page.getByTestId('session-summary')).toContainText(
      'The list emptied at "Within the lapse range"',
    )
    await expect(page.getByTestId('session-start')).toHaveCount(0)
    await page.getByTestId('session-summary').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `ui-screenshots/study-session-empty-${view.name}.png` })
  })
}

import { expect, test, type Page } from '@playwright/test'

/**
 * Rendered check of the exam readiness page. The API is mocked in the
 * browser, so these screenshots show the real client UI over FIXTURE data,
 * not a live forecast. The forecast maths is covered by core and API tests.
 */

const group = (
  key: string,
  label: string,
  cards: number,
  unseen: number,
  b: number,
  p: number,
) => ({
  key,
  label,
  cards,
  unseen,
  baselineRecall: b,
  plannedRecall: p,
  atTarget: p > 0.85 ? 0.9 : 0.4,
})

const assumptions = [
  'Recall is estimated with the FSRS model from your review history. It is an estimate, not a measured result.',
  'New cards you have not studied are not counted as forgotten.',
  'The review scenario assumes every planned review happens and succeeds.',
]

const report = {
  ok: true,
  report: {
    target: { title: 'Exam', date: '2026-12-20' },
    daysLeft: 25,
    expired: false,
    targetRecall: 0.85,
    plan: { kind: 'on-schedule' },
    overall: group('all', 'All cards', 120, 10, 0.62, 0.88),
    decks: [
      group('1', 'Biochemistry with a rather long deck name to test wrapping', 70, 4, 0.55, 0.82),
      group('2', 'Anatomy', 50, 6, 0.71, 0.93),
    ],
    skills: [],
    confidence: { level: 'moderate', reason: 'Based on 110 studied cards.', seenCards: 110 },
    assumptions,
  },
  review: {
    budget: 20,
    meanRecallBefore: 0.62,
    meanRecallAfter: 0.7,
    reviewsNeededForTarget: 64,
    assumptions,
    top: Array.from({ length: 10 }, (_, i) => ({
      cardId: 100 + i,
      deckId: 1,
      baseline: 0.4 + i * 0.01,
      afterReview: 0.9,
      gain: 0.5 - i * 0.01,
    })),
  },
}

async function mock(page: Page) {
  const seen: string[] = []
  await page.route('**/api/readiness**', (route) => {
    const url = new URL(route.request().url())
    seen.push(url.search)
    if (!url.searchParams.has('examId') && !url.searchParams.has('date')) {
      return route.fulfill({
        json: { ok: true, exams: [{ id: 7, title: 'Finals', date: '2026-12-20', courseId: null }] },
      })
    }
    return route.fulfill({ json: report })
  })
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
      ...document.querySelectorAll('main button, main input, main a, main select, main summary'),
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
    .getByTestId('readiness-studio')
    .locator('button, input, select, summary')
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
  test(`exam readiness renders cleanly (${view.name})`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height })
    if (view.reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    const seen = await mock(page)

    await page.goto('/readiness')
    await expect(page.getByTestId('readiness-studio')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Pick an exam date')).toBeVisible()

    await page.getByTestId('readiness-exam').selectOption('7')
    await expect(page.getByTestId('readiness-gauge')).toBeVisible()
    await expect(page.getByTestId('readiness-baseline')).toHaveText('62%')
    await expect(page.getByTestId('readiness-planned')).toHaveText('88%')
    await expect(page.getByTestId('readiness-assumptions')).toContainText('not a measured result')
    await expect(page.getByTestId('readiness-decks-row')).toHaveCount(2)
    await expect(page.getByTestId('readiness-gain-row')).toHaveCount(10)
    await expect(page.getByTestId('readiness-gain-summary')).toContainText('64 reviews')
    // Never promise an outcome.
    await expect(page.getByTestId('readiness-studio')).not.toContainText(
      /guarantee|will pass|confidence interval/i,
    )
    expect(seen.some((s) => s.includes('examId=7') && s.includes('plan=on-schedule'))).toBe(true)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    await page.getByTestId('readiness-plan').selectOption('capacity')
    await expect(page.getByTestId('readiness-perday')).toBeVisible()
    await page.getByTestId('readiness-perday').fill('5')
    await expect
      .poll(() => seen.some((s) => s.includes('plan=capacity') && s.includes('perDay=5')))
      .toBe(true)

    await expectNoOcclusion(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `ui-screenshots/readiness-${view.name}-top.png` })
    await expectLastControlClearsBottomNav(page)
    await page.screenshot({ path: `ui-screenshots/readiness-${view.name}-bottom.png` })
    await page.screenshot({
      path: `ui-screenshots/readiness-${view.name}-page.png`,
      fullPage: true,
    })
  })
}

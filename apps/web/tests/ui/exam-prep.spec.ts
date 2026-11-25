import { expect, test, type Page } from '@playwright/test'

/**
 * Rendered check of the exam prep page. The API is mocked in the browser, so
 * these screenshots show the real client UI over FIXTURE data, not a live
 * schedule. The planning maths is covered by core, API and e2e tests.
 */

const assumptions = [
  'Recall figures are estimates from the FSRS memory model applied to your review history. They are not validated exam scores.',
  'Each day is filled greedily. This is a heuristic and not an optimal schedule.',
  'Following the plan means doing real reviews. Nothing in this plan is applied for you.',
]

// The running mean only moves on study days: a rest day carries the previous day's figure.
let running = 0.62
const days = Array.from({ length: 14 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10)
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay()
  const rest = wd === 0 || wd === 6
  const n = rest ? 0 : i === 0 ? 8 : 3
  if (!rest) running += 0.02
  return {
    date,
    rest,
    meanExamRecallAfter: Math.round(running * 1000) / 1000,
    reviews: Array.from({ length: n }, (_, k) => ({
      cardId: 100 + i * 10 + k,
      deckId: 1,
      deck: k % 2 ? 'Anatomy' : 'Biochemistry with a rather long deck name to test wrapping',
      label:
        k === 0
          ? 'What is the rate-limiting enzyme of glycolysis and what regulates it allosterically?'
          : `Card ${k}`,
      recallBefore: 0.5 + k * 0.02,
      examRecallAfter: 0.9,
      gain: 0.4 - k * 0.01,
      nth: k === 1 ? 2 : 1,
    })),
  }
})

const plan = {
  ok: true,
  title: 'Finals',
  note: 'This is a read-only model scenario. Nothing is scheduled or reviewed for you. Open a day in the review queue and answer the cards yourself.',
  plan: {
    exam: '2026-12-15T23:59:59.000Z',
    from: '2026-12-01',
    targetRecall: 0.85,
    days,
    summary: {
      studyDays: 10,
      restDays: 4,
      plannedReviews: 35,
      distinctCards: 30,
      baseline: 0.62,
      planned: 0.88,
      belowTarget: 12,
      seenCards: 110,
      unseenCards: 10,
      capacityBound: true,
      truncated: false,
      consideredCards: 110,
    },
    confidence: { level: 'moderate', reason: 'Based on 110 studied cards.' },
    options: { perDay: 30, minGain: 0.01, maxReviewsPerCard: 3, restWeekdays: [0, 6] },
    expired: false,
    assumptions,
  },
}

async function mock(page: Page) {
  const seen: string[] = []
  await page.route('**/api/exam-prep**', (route) => {
    seen.push(new URL(route.request().url()).search)
    return route.fulfill({ json: plan })
  })
  await page.route('**/api/readiness**', (route) =>
    route.fulfill({
      json: { ok: true, exams: [{ id: 7, title: 'Finals', date: '2026-12-15', courseId: null }] },
    }),
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
    .getByTestId('exam-prep-studio')
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
  test(`exam prep renders cleanly (${view.name})`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height })
    if (view.reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
    const seen = await mock(page)

    await page.goto('/exam-prep')
    await expect(page.getByTestId('exam-prep-studio')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Pick an exam date')).toBeVisible()

    await page.getByTestId('prep-exam').selectOption('7')
    await expect(page.getByTestId('prep-headline')).toBeVisible()
    await expect(page.getByTestId('prep-baseline')).toHaveText('62%')
    await expect(page.getByTestId('prep-planned')).toHaveText('88%')
    // The qualifier, the as-of date, the exam date and the baseline are inside the sentence.
    const headline = page.getByTestId('prep-headline')
    await expect(headline).toContainText('The model estimates, as of 2026-12-01')
    await expect(headline).toContainText('2026-12-15')
    await expect(headline).toContainText('if you review nothing more')
    await expect(headline).toContainText(
      'if you make all 35 planned reviews and remember each card',
    )
    await expect(page.getByTestId('readiness-assumptions')).toContainText(
      'not validated exam scores',
    )
    await expect(page.getByTestId('prep-day')).toHaveCount(14)
    await expect(page.getByTestId('exam-prep-studio')).not.toContainText(
      /guarantee|will pass|confidence interval|better learning/i,
    )
    expect(seen.some((s) => s.includes('examId=7') && s.includes('perDay=30'))).toBe(true)

    // Open the first day: the cards, and a link that opens exactly those cards.
    await page.getByTestId('prep-day').first().locator('summary').click()
    await expect(page.getByTestId('prep-day').first().getByTestId('prep-review')).toHaveCount(8)
    const href = await page.getByTestId('prep-study-link').first().getAttribute('href')
    expect(href).toBe('/review?cardIds=' + days[0]!.reviews.map((r) => r.cardId).join(','))
    await expect(page.getByTestId('prep-day').first()).toContainText('You answer each one yourself')
    // A rest day shows the same figure as the day before it (the mean only moves on study days).
    for (let i = 1; i < days.length; i++)
      if (days[i]!.rest) expect(days[i]!.meanExamRecallAfter).toBe(days[i - 1]!.meanExamRecallAfter)
    // Rest days offer no study link.
    await expect(page.getByTestId('prep-day').nth(5)).toContainText('Rest day')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    await page.getByTestId('prep-rest-0').check()
    await page.getByTestId('prep-rest-6').check()
    await expect.poll(() => seen.some((s) => s.includes('rest=0%2C6'))).toBe(true)

    await expectNoOcclusion(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `ui-screenshots/exam-prep-${view.name}-top.png` })
    await page.getByTestId('prep-day').last().locator('summary').click()
    await expectLastControlClearsBottomNav(page)
    await page.screenshot({ path: `ui-screenshots/exam-prep-${view.name}-bottom.png` })
    await page.screenshot({
      path: `ui-screenshots/exam-prep-${view.name}-page.png`,
      fullPage: true,
    })
  })
}

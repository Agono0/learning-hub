import { expect, test, type Page } from '@playwright/test'

/**
 * Rendered check of /review?cardIds=... (an exam-prep day). The API is mocked
 * in the browser: this shows the real client page over FIXTURE data. It checks
 * that the explicit list auto-starts, that the request carries the list, that
 * early (not due) cards are labelled, and that nothing is answered by loading.
 */

const day = 86_400_000
const card = (id: number, front: string, dueDays: number) => ({
  id,
  deckId: 1,
  type: 'basic',
  content: { basic: { front, back: `Answer ${id}` } },
  tags: [],
  state: 2,
  reps: 3,
  stability: 10,
  due: new Date(Date.now() + dueDays * day).toISOString(),
  previews: { 1: '1m', 2: '2d', 3: '5d', 4: '9d' },
  blind: false,
})

async function mock(page: Page) {
  const gets: string[] = []
  const posts: string[] = []
  await page.route('**/api/review**', (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      posts.push(req.url())
      return route.fulfill({ status: 500, json: { ok: false } })
    }
    gets.push(new URL(req.url()).search)
    return route.fulfill({
      json: {
        ok: true,
        explicit: true,
        earlyCount: 2,
        cards: [card(11, 'First planned card', 9), card(12, 'Second planned card', 4)],
        mode: 'normal',
        course: null,
        retention: 0.9,
        corrections: [],
      },
    })
  })
  await page.route('**/api/decks**', (route) =>
    route.fulfill({ json: { decks: [{ id: 1, name: 'Anatomy', emoji: null, due: 0, total: 2 }] } }),
  )
  return { gets, posts }
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

for (const view of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
]) {
  test(`review explicit list shows the early-review label (${view.name})`, async ({ page }) => {
    await page.setViewportSize({ width: view.width, height: view.height })
    const seen = await mock(page)
    await page.goto('/review?cardIds=11,12')
    await expect(page.getByText('Your chosen cards, in the planned order.')).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText('2 of them are not due yet.')).toBeVisible()
    await expect(page.getByText('changes their schedule like any review')).toBeVisible()
    await expect(page.getByText('First planned card')).toBeVisible()
    expect(seen.gets.some((s) => s.includes('cardIds=11%2C12'))).toBe(true)
    // Loading and auto-start never answer anything.
    expect(seen.posts).toEqual([])
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `ui-screenshots/review-explicit-${view.name}.png` })
  })
}

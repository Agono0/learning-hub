import { expect, test } from '@playwright/test'

/**
 * Regression: GET /api/hud/quick-review rows are keyed `id`; the Today widget used to read
 * `cardId`, so every grade posted cardId=undefined and /api/review answered 400. Runs against
 * the seeded fixture DB with the real handlers (no mocks, no external network).
 */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test('Today quick-review widget grades the shown card through /api/review', async ({ page }) => {
  await page.goto('/')
  const widget = page.getByTestId('quick-review-widget')
  // Which card is shown first depends on what other specs left due in the shared database, so
  // assert a real front text (not the "Card #" fallback) instead of a specific fixture name.
  await expect(widget.getByRole('button', { name: /Try recall, then reveal/ })).toBeVisible({
    timeout: 60_000,
  })
  await expect(widget).not.toContainText(/Card #/)
  // The label must be the real front text, never the "Card #undefined" fallback.
  await expect(widget).not.toContainText('undefined')

  await widget.getByRole('button', { name: /Try recall, then reveal/ }).click()
  const posted = page.waitForResponse(
    (r) => r.url().includes('/api/review') && r.request().method() === 'POST',
  )
  await widget.getByRole('button', { name: /Recalled/ }).click()
  const res = await posted
  const body = res.request().postDataJSON() as { cardId: unknown; grade: number }
  expect(typeof body.cardId).toBe('number')
  expect(Number.isInteger(body.cardId)).toBe(true)
  expect(res.status()).toBe(200)

  // State advanced, not just the label: the widget counts the grade and the card index moved on.
  await expect(widget.getByText('1 graded')).toBeVisible()
  await expect(widget).toContainText(/card 2 of/)
})

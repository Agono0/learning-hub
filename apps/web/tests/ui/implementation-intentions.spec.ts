import { expect, test } from '@playwright/test'

/**
 * Implementation Intentions & Habit Formation Studio browser coverage:
 * build an if-then plan, evaluate its quality, and project automaticity.
 * Runs against `next dev` on the isolated DB clone via the shared
 * playwright.config (single worker).
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test('studio renders the three tabs', async ({ page }) => {
  await page.goto('/implementation-intentions')
  await expect(
    page.getByRole('heading', { name: 'Implementation Intentions', level: 1 }),
  ).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('tab', { name: 'Plan builder' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Automaticity' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Deck' })).toBeVisible()
})

test('plan builder evaluates a written if-then plan', async ({ page }) => {
  await page.goto('/implementation-intentions')
  await expect(page.getByRole('tab', { name: 'Plan builder' })).toBeVisible({ timeout: 60_000 })

  await page.getByRole('textbox', { name: 'Your goal' }).fill('Review flashcards every day')
  await page
    .getByRole('textbox', { name: /IF \(critical situation\)/ })
    .fill('I sit down with my morning coffee')
  await page
    .getByRole('textbox', { name: /THEN \(concrete first action\)/ })
    .fill('I open the review queue before any news')

  const evaluate = page.getByRole('button', { name: /Evaluate plan/ })
  await expect(evaluate).toBeEnabled()
  await evaluate.click()

  await expect(page.getByText('Plan Quality Index')).toBeVisible()
})

test('automaticity tab projects days to habit strength', async ({ page }) => {
  await page.goto('/implementation-intentions')
  await page.getByRole('tab', { name: 'Automaticity' }).click()

  await page.getByRole('spinbutton', { name: 'Days practiced so far' }).fill('21')
  await page.getByRole('spinbutton', { name: 'Adherence (%)' }).fill('80')
  await page.getByRole('button', { name: /Project automaticity/ }).click()

  await expect(page.getByText('Days to ~95%')).toBeVisible()
})

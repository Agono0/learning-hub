import { expect, test } from '@playwright/test'

/**
 * Embodied Learning & Gesture Studio browser coverage: scenario library
 * loads, a scenario opens into the studio phases, and the mismatch analyzer
 * scores pasted said|showed pairs. Runs against `next dev` on the isolated
 * DB clone via the shared playwright.config (single worker).
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test('studio lists the canonical scenarios', async ({ page }) => {
  await page.goto('/embodied-learning')
  await expect(
    page.getByRole('heading', { name: 'Embodied Learning & Gesture Studio', level: 1 }),
  ).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Why dividing by a fraction multiplies')).toBeVisible()
  await expect(page.getByText('Bayes with a crowd: base rates in your hands')).toBeVisible()
})

test('opening a scenario reveals the studio phases and gesture plan', async ({ page }) => {
  await page.goto('/embodied-learning')
  await page.getByRole('button', { name: 'Open' }).first().click()

  // Ground phase shows the embodiment rationale and the tracing exercise.
  await expect(page.getByRole('tab', { name: 'Ground' })).toBeVisible()
  await expect(page.getByText('Tracing exercise')).toBeVisible()

  // Gesture phase shows the plan with channel badges.
  await page.getByRole('tab', { name: 'Gesture' }).click()
  await expect(page.getByRole('button', { name: 'Evaluate plan coverage' })).toBeVisible()
})

test('mismatch analyzer scores said|showed pairs', async ({ page }) => {
  await page.goto('/embodied-learning')
  await page.getByRole('button', { name: 'Open' }).first().click()
  await page.getByRole('tab', { name: 'Mismatch' }).click()

  await page
    .getByRole('textbox', { name: /Explanation samples/ })
    .fill('the slope is positive | hand tilts down\nsix eighths fit | six eighths fit')
  await page.getByRole('button', { name: 'Analyze mismatch' }).click()

  await expect(page.getByText('Mismatch rate')).toBeVisible()
  await expect(page.getByText('50%')).toBeVisible()
})

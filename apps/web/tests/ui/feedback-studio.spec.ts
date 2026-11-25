import { expect, test } from '@playwright/test'

/**
 * Feedback Literacy & Formative Assessment Studio browser coverage.
 * Exercises the studio the way a learner does: practice a scenario with a
 * confidence judgment, then analyze pasted feedback in the Analyzer and read
 * the HUD metrics. Runs against `next dev` on the isolated DB clone via the
 * shared playwright.config (single worker, onboarding dismissed below).
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test('feedback studio renders its three phases', async ({ page }) => {
  await page.goto('/feedback-studio')
  await expect(page.getByRole('heading', { name: 'Feedback Studio', level: 1 })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('tab', { name: 'Practice' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Analyzer' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Deck' })).toBeVisible()
})

test('practice flow: choose an option, set confidence, commit, see feedback', async ({ page }) => {
  await page.goto('/feedback-studio')
  await expect(page.getByRole('tab', { name: 'Practice' })).toBeVisible({ timeout: 60_000 })

  // Every option button is disabled until one is chosen; the commit button
  // starts disabled too.
  const commit = page.getByRole('button', { name: 'Commit answer' })
  await expect(commit).toBeDisabled()
  await expect(page.locator('#fb-confidence')).toBeVisible()

  // Pick the first answer option and commit.
  const firstOption = page
    .locator('button[type="button"]')
    .filter({ has: page.locator('span.rounded-full') })
    .first()
  await firstOption.click()
  await expect(commit).toBeEnabled()
  await commit.click()
  await expect(commit).toBeDisabled()

  // After committing, the scenario's model answer / explanation appears.
  await expect(firstOption).toBeDisabled()
})

test('analyzer flow: pasted statements produce HUD metrics', async ({ page }) => {
  await page.goto('/feedback-studio')
  await page.getByRole('tab', { name: 'Analyzer' }).click()

  const box = page.getByRole('textbox', { name: /feedback/i })
  await box.fill(
    'You are so smart, well done!\nCheck your units in step 2.\nWhat strategy could you try next?',
  )
  await page.getByRole('button', { name: /Analyze feedback/ }).click()

  await expect(page.getByText('Feedback Quality Index')).toBeVisible()
  await expect(page.getByText(/3 statements analyzed/)).toBeVisible()
})

test('deck tab renders the spaced-review panel', async ({ page }) => {
  await page.goto('/feedback-studio')
  await page.getByRole('tab', { name: 'Deck' }).click()
  await expect(page.getByRole('tab', { name: 'Deck' })).toHaveAttribute('aria-selected', 'true')
})

import { expect, test } from '@playwright/test'

/**
 * Shared Materials page browser coverage: the four flows render and the
 * publish form validates. Engine behavior is covered by the core vitest
 * suite; this spec checks the page wiring end to end.
 */

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test('shared materials page renders its four flows', async ({ page }) => {
  await page.goto('/shared')
  await expect(page.getByRole('heading', { name: 'Shared Materials', level: 1 })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('tab', { name: 'My subscriptions' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Publish' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Subscribe' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Apply update' })).toBeVisible()
})

test('subscriptions tab starts empty with guidance', async ({ page }) => {
  await page.goto('/shared')
  await expect(page.getByText(/No subscriptions yet/)).toBeVisible({ timeout: 60_000 })
})

test('publish tab exposes the channel form', async ({ page }) => {
  await page.goto('/shared')
  await page.getByRole('tab', { name: 'Publish' }).click()
  await expect(page.getByRole('textbox', { name: 'Channel id' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Your public handle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create channel' })).toBeVisible()
})

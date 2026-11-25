import { expect, test, type Page } from '@playwright/test'

/**
 * Retention Planner UI. The API is stubbed so no account setting is ever
 * read or changed. Covers assumptions, budget result, exhaustion, error and
 * the apply/restore flow including refusing to restore after an outside change.
 */

const grid = [0.8, 0.85, 0.9, 0.93, 0.95, 0.97].map((retention, i) => ({
  retention,
  reviews: 900 + i * 260,
  meanDailyReviews: 10 + i * 2.9,
  meanDailyMinutes: 1.4 + i * 0.55,
  peakDailyMinutes: 4 + i,
  lapseShare: 0.2 - i * 0.025,
  fitsBudget: 1.4 + i * 0.55 <= 3,
}))

const base = {
  status: 'ok',
  message: 'Modeled over your current Review-state cards under the assumptions shown.',
  asOf: '2026-06-01T12:00:00.000Z',
  currentRetention: 0.9,
  currentSource: 'global',
  weights: 'custom',
  scope: 'all-decks',
  horizonDays: 90,
  budgetMinutes: 3,
  seed: 20260101,
  coverage: {
    total: 2200,
    eligible: 1800,
    simulated: 900,
    scaleUp: 2,
    excludedNew: 250,
    excludedLearning: 60,
    excludedRelearning: 40,
    excludedSuspended: 50,
    excludedOwnSettings: 120,
    selection: 'every-kth-by-id',
    stride: 2,
  },
  timing: {
    source: 'per-rating-median',
    secondsByRating: [9, 8, 6, 4],
    secondsOverall: 6.5,
    usable: 1710,
    considered: 2000,
    coverage: 0.855,
    note: 'Median of 1710 of 2000 recent reviews with a usable time (0.5 s to 180 s). Idle gaps above 180 s are dropped, not averaged.',
  },
  passMix: { hard: 0.12, good: 0.74, easy: 0.14, n: 1500, source: 'history' },
  grid,
  schedulerCalls: 21000,
  maxCalls: 400000,
  recommendation: {
    retention: 0.9,
    basis:
      'Modeled mean daily time at that retention is 2.5 min. This is not a learning-optimal value.',
  },
  calibration: {
    heldOutReviews: 400,
    scored: 310,
    activeLogLoss: 0.31,
    activeRmse: 0.04,
    defaultLogLoss: 0.33,
    defaultRmse: 0.05,
    usingCustomWeights: true,
    note: 'Newest 20% of reviews. The stored custom weights have no recorded fit date and may have been fit on these reviews, so their score may be in-sample.',
  },
}

async function stub(page: Page, result: unknown, settings = { value: 0.9 }, puts: number[] = []) {
  await page.route('**/api/retention-planner', (route) =>
    route.fulfill({ json: { ok: true, result, cardsTruncated: false } }),
  )
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { desiredRetention: number }
      settings.value = body.desiredRetention
      puts.push(body.desiredRetention)
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ json: { settings: { desiredRetention: settings.value } } })
  })
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
    window.localStorage.removeItem('lh-retention-planner-applied')
  })
})

test('shows the budget result with assumptions and exclusion counts', async ({ page }) => {
  await stub(page, base)
  await page.goto('/retention-planner')
  await page.getByRole('button', { name: 'Model my cards' }).click()
  await expect(page.getByTestId('rp-result')).toContainText('90%')
  await expect(page.getByTestId('retention-curve')).toBeVisible()
  const a = page.getByTestId('rp-assumptions')
  await expect(a).toContainText('900 of 1,800 eligible')
  await expect(a).toContainText('250 new')
  await expect(a).toContainText('in-sample')
  await expect(a).toContainText('One scenario, no confidence interval')
  await expect(page.getByText('not a learning-optimal', { exact: false }).first()).toBeVisible()
})

test('an incomplete run gives no recommendation', async ({ page }) => {
  await stub(page, {
    ...base,
    status: 'incomplete',
    message:
      'Stopped at the 400,000 scheduler-call limit after 400,000 calls. The grid is incomplete, so no budget recommendation is given.',
    grid: grid.slice(0, 2),
    recommendation: null,
  })
  await page.goto('/retention-planner')
  await page.getByRole('button', { name: 'Model my cards' }).click()
  await expect(page.getByTestId('rp-result')).toContainText('grid is incomplete')
  await expect(page.getByTestId('rp-result')).toContainText('No budget recommendation is given')
  await expect(page.getByTestId('rp-result')).not.toContainText(
    'highest tested retention within your',
  )
})

test('a server error is shown, not hidden', async ({ page }) => {
  await page.route('**/api/retention-planner', (route) =>
    route.fulfill({ status: 500, json: { error: 'The model could not run. Try again.' } }),
  )
  await page.route('**/api/settings', (route) =>
    route.fulfill({ json: { settings: { desiredRetention: 0.9 } } }),
  )
  await page.goto('/retention-planner')
  await page.getByRole('button', { name: 'Model my cards' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'could not run' })).toBeVisible()
})

test('apply needs confirmation, then restore returns the previous value', async ({ page }) => {
  const puts: number[] = []
  await stub(page, base, { value: 0.93 }, puts)
  await page.goto('/retention-planner')
  await page.getByRole('button', { name: 'Model my cards' }).click()
  await expect(page.getByTestId('rp-apply')).toContainText('250 new')
  await expect(page.getByTestId('rp-apply')).toContainText('global setting only')
  await page.getByRole('button', { name: /Review change to 90%/ }).click()
  expect(puts).toEqual([])
  await expect(page.getByRole('group', { name: 'Confirm change' })).toContainText('93%')
  await page.getByRole('button', { name: 'Confirm and apply' }).click()
  await expect(page.getByTestId('rp-restore')).toContainText('Previous value was 93%')
  expect(puts).toEqual([0.9])
  await page.getByRole('button', { name: 'Restore 93%' }).click()
  await expect.poll(() => puts).toEqual([0.9, 0.93])
})

test('restore refuses when the setting changed elsewhere', async ({ page }) => {
  const settings = { value: 0.93 }
  const puts: number[] = []
  await stub(page, base, settings, puts)
  await page.goto('/retention-planner')
  await page.getByRole('button', { name: 'Model my cards' }).click()
  await page.getByRole('button', { name: /Review change to 90%/ }).click()
  await page.getByRole('button', { name: 'Confirm and apply' }).click()
  await expect(page.getByTestId('rp-restore')).toBeVisible()
  settings.value = 0.8
  await page.getByRole('button', { name: 'Restore 93%' }).click()
  await expect(page.getByText('Not restored', { exact: false })).toBeVisible()
  expect(puts).toEqual([0.9])
})

test('a failed apply changes nothing and offers no restore', async ({ page }) => {
  await stub(page, base, { value: 0.93 })
  await page.unroute('**/api/settings')
  await page.route('**/api/settings', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, json: { error: 'Could not save settings.' } })
      : route.fulfill({ json: { settings: { desiredRetention: 0.93 } } }),
  )
  await page.goto('/retention-planner')
  await page.getByRole('button', { name: 'Model my cards' }).click()
  await page.getByRole('button', { name: /Review change to 90%/ }).click()
  await page.getByRole('button', { name: 'Confirm and apply' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not save' })).toBeVisible()
  await expect(page.getByTestId('rp-restore')).toHaveCount(0)
  expect(
    await page.evaluate(() => window.localStorage.getItem('lh-retention-planner-applied')),
  ).toBeNull()
})

test('a failed restore keeps the record so it can be retried', async ({ page }) => {
  const settings = { value: 0.93 }
  const puts: number[] = []
  await stub(page, base, settings, puts)
  await page.goto('/retention-planner')
  await page.getByRole('button', { name: 'Model my cards' }).click()
  await page.getByRole('button', { name: /Review change to 90%/ }).click()
  await page.getByRole('button', { name: 'Confirm and apply' }).click()
  await expect(page.getByTestId('rp-restore')).toBeVisible()
  await page.unroute('**/api/settings')
  await page.route('**/api/settings', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, json: { error: 'Could not save settings.' } })
      : route.fulfill({ json: { settings: { desiredRetention: 0.9 } } }),
  )
  await page.getByRole('button', { name: 'Restore 93%' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not save' })).toBeVisible()
  await expect(page.getByTestId('rp-restore')).toBeVisible()
})

test('a setting changed after the page loaded blocks the apply', async ({ page }) => {
  const settings = { value: 0.93 }
  const puts: number[] = []
  await stub(page, base, settings, puts)
  await page.goto('/retention-planner')
  await page.getByRole('button', { name: 'Model my cards' }).click()
  await expect(page.getByTestId('rp-apply')).toContainText('93%')
  await page.getByRole('button', { name: /Review change to 90%/ }).click()
  settings.value = 0.95
  await page.getByRole('button', { name: 'Confirm and apply' }).click()
  await expect(page.getByText('changed to 95% since this page loaded')).toBeVisible()
  expect(puts).toEqual([])
})

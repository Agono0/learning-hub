import { expect, test } from '@playwright/test'

/**
 * Competitive leagues e2e (lh-leagues/v1): drives the /leagues UI through a
 * full season lifecycle — create, join, log points, close a round
 * (promotion), duel to a decision, and seed a tournament bracket. Setup goes
 * through the UI forms (not API seeding) so the forms themselves are under
 * test; selectors are data-testid / A roles per the repo convention.
 *
 * Runs against `next dev` on an isolated DB (tests/ui/setup/with-test-server.mjs).
 */

const LEAGUE = 'spring-e2e'

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test.describe('leagues season lifecycle', () => {
  test.describe.configure({ mode: 'serial' })

  test('create a league and join two players', async ({ page }) => {
    await page.goto('/leagues')
    await expect(page.getByRole('heading', { name: 'Leagues', level: 1 })).toBeVisible({
      timeout: 60_000,
    })

    await page.getByTestId('create-league-slug').fill(LEAGUE)
    await page.getByTestId('create-league-title').fill('Spring E2E Cup')
    await page.getByTestId('create-league-days').fill('7')
    await page.getByTestId('create-league-submit').click()
    await expect(page.getByText(`League ${LEAGUE} created.`)).toBeVisible()

    for (const handle of ['amr', 'sara']) {
      await page.getByTestId('join-league-slug').fill(LEAGUE)
      await page.getByTestId('join-league-handle').fill(handle)
      await page.getByTestId('join-league-submit').click()
      await expect(page.getByText(`${handle} joined ${LEAGUE} in bronze.`)).toBeVisible()
    }
  })

  test('log points, then close the round and promote the top scorer', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()

    // card click selects the league and lands on the standings tab
    await expect(page.getByTestId('standings-bronze')).toBeVisible({ timeout: 60_000 })

    for (const [handle, reviews] of [
      ['amr', '100'],
      ['sara', '10'],
    ] as const) {
      await page.getByTestId('points-handle').fill(handle)
      await page.getByTestId('points-reviews').fill(reviews)
      await page.getByTestId('points-submit').click()
      await expect(page.getByText(`Points logged for ${handle}.`)).toBeVisible()
    }

    const bronze = page.getByTestId('standings-bronze')
    await expect(bronze.getByText('1. amr')).toBeVisible()
    await expect(bronze.getByText('2. sara')).toBeVisible()
    await expect(page.getByTestId('champion-badge')).toContainText('amr')

    await page.getByTestId('close-round').click()
    await expect(page.getByText(`Round closed for ${LEAGUE}.`)).toBeVisible()

    // must-score-to-advance: both scorers promote (2 players, 3 slots)
    await expect(page.getByTestId('standings-silver').getByText('amr')).toBeVisible()
    await expect(page.getByTestId('standings-silver').getByText('sara')).toBeVisible()
    await expect(page.getByTestId('round-history')).toContainText('Round 0')
  })

  test('duel decides on accuracy, then speed', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await page.getByRole('tab', { name: 'Duels' }).click()
    await expect(page.getByText(`Duels in ${LEAGUE}`)).toBeVisible({ timeout: 60_000 })

    await page.getByTestId('duel-slug').fill('duel-1')
    await page.getByTestId('duel-player-a').fill('amr')
    await page.getByTestId('duel-player-b').fill('sara')
    await page.getByTestId('duel-prompts').fill('p1::2+2?::4\np2::Capital of France?::Paris')
    await page.getByTestId('duel-create').click()
    await expect(page.getByText('Duel duel-1 created.')).toBeVisible()
    await expect(page.getByText('Waiting: duel-1')).toBeVisible()

    // side A: both correct and fast
    await page.getByTestId('answer-duel-slug').fill('duel-1')
    await page.getByTestId('answer-text').fill('p1::4::1200\np2::Paris::1500')
    await page.getByTestId('answer-submit').click()
    await expect(page.getByText('Answers submitted for duel-1.')).toBeVisible()

    // side B: one wrong — accuracy decides, speed never gets a say
    await page.getByTestId('answer-side').getByRole('button', { name: 'Side B' }).click()
    await page.getByTestId('answer-duel-slug').fill('duel-1')
    await page.getByTestId('answer-text').fill('p1::4::800\np2::Lyon::700')
    await page.getByTestId('answer-submit').click()

    await expect(page.getByTestId('duel-list').getByText('won by amr')).toBeVisible()
  })

  test('player profile shows duel record and Elo trajectory', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await expect(page.getByTestId('standings-bronze')).toBeVisible({ timeout: 60_000 })

    // duel-1 was decided in the previous test: amr beat sara
    await page.getByTestId('standings-row-amr').click()
    await expect(page.getByTestId('player-profile')).toBeVisible()
    await expect(page.getByTestId('profile-record')).toContainText('1W · 0D · 0L')
    await expect(page.getByTestId('profile-elo-sparkline')).toBeVisible()
    await expect(page.getByTestId('profile-duels')).toContainText('duel-1')

    // clicking the row again collapses the panel
    await page.getByTestId('standings-row-amr').click()
    await expect(page.getByTestId('player-profile')).toHaveCount(0)
  })

  test('seed a tournament bracket', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await page.getByRole('tab', { name: 'Tournaments' }).click()

    await page.getByTestId('tournament-slug').fill('cup-1')
    await page.getByTestId('tournament-title').fill('Spring Cup')
    await page.getByTestId('tournament-seeds').fill('amr,sara,khaled,omar')
    await page.getByTestId('tournament-create').click()

    await expect(page.getByTestId('tournament-list').getByText('Spring Cup')).toBeVisible({
      timeout: 60_000,
    })
  })
})

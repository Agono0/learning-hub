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

  test('profile shows earned achievement badges', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await expect(page.getByTestId('standings-bronze')).toBeVisible({ timeout: 60_000 })

    // amr won duel-1 and the round: first-blood (auto-banked on duel
    // completion) and more badges show on his profile
    await page.getByTestId('standings-row-amr').click()
    await expect(page.getByTestId('player-profile')).toBeVisible()
    await expect(page.getByTestId('profile-achievements')).toBeVisible()
    await expect(page.getByTestId('achievement-first-blood')).toBeVisible()

    // sara lost the duel and never scored: no badges
    await page.getByTestId('standings-row-amr').click()
    await page.getByTestId('standings-row-sara').click()
    await expect(page.getByTestId('player-profile')).toBeVisible()
    await expect(page.getByTestId('profile-achievements')).toHaveCount(0)
  })

  test('division drill-down shows standings, winners and movement', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await expect(page.getByTestId('standings-bronze')).toBeVisible({ timeout: 60_000 })

    // amr was promoted to silver in the earlier round close
    await page.getByTestId('division-open-silver').click()
    await expect(page.getByTestId('division-detail')).toBeVisible()
    await expect(page.getByTestId('division-standings')).toContainText('amr')
    await expect(page.getByTestId('division-movements')).toContainText('amr promoted in')

    // bronze named amr its winner before he promoted out
    await page.getByTestId('division-open-silver').click()
    await page.getByTestId('division-open-bronze').click()
    await expect(page.getByTestId('division-history')).toContainText('amr')

    // clicking the header again collapses the panel
    await page.getByTestId('division-open-bronze').click()
    await expect(page.getByTestId('division-detail')).toHaveCount(0)
  })

  test('head-to-head panel compares the two duelists', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await expect(page.getByTestId('standings-bronze')).toBeVisible({ timeout: 60_000 })

    await page.getByTestId('h2h-a').fill('amr')
    await page.getByTestId('h2h-b').fill('sara')
    await page.getByTestId('h2h-submit').click()

    await expect(page.getByTestId('h2h-result')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('h2h-result')).toContainText('1 duel')
    await expect(page.getByTestId('h2h-result')).toContainText('amr leads by 1')
    await expect(page.getByTestId('h2h-side-A')).toContainText('1 wins')
    await expect(page.getByTestId('h2h-side-B')).toContainText('0 wins')
  })

  test('export panel produces a transfer envelope', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()

    await page.getByRole('tab', { name: 'Overview' }).click()
    await page.getByTestId('export-league-submit').click()
    await expect(page.getByTestId('export-league-json')).toHaveValue(/lh-leagues-transfer\/v1/, {
      timeout: 60_000,
    })
    await expect(page.getByTestId('export-league-json')).toHaveValue(/Spring E2E Cup/)

    // importing the same envelope is rejected: the slug already exists
    await page
      .getByTestId('import-league-json')
      .fill(await page.getByTestId('export-league-json').inputValue())
    await page.getByTestId('import-league-submit').click()
    await expect(page.getByText(/already exists/)).toBeVisible()
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

  test('record tournament results through the bracket to a champion', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await page.getByRole('tab', { name: 'Tournaments' }).click()
    const bracket = page.getByTestId('bracket-cup-1')
    await expect(bracket).toBeVisible({ timeout: 60_000 })

    // two semifinals: pick the first player's button in each undecided match
    const winButtons = () => bracket.getByRole('button', { name: /wins$/ })
    await expect(winButtons()).toHaveCount(4) // 2 matches x 2 players
    await winButtons().nth(0).click()
    await expect(winButtons()).toHaveCount(2, { timeout: 60_000 })
    await winButtons().nth(0).click()

    // the final appears once both semifinals are decided
    await expect(winButtons()).toHaveCount(2, { timeout: 60_000 })
    await winButtons().nth(0).click()

    await expect(page.getByTestId('tournament-list').getByText(/champion:/)).toBeVisible({
      timeout: 60_000,
    })
    await expect(winButtons()).toHaveCount(0)
  })

  test('auto-seed a tournament from standings through the UI', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await page.getByRole('tab', { name: 'Tournaments' }).click()

    await page.getByTestId('tournament-slug').fill('auto-cup')
    await page.getByTestId('tournament-title').fill('Auto Cup')
    // no manual seeds: the button ranks the league by division then season points
    await page.getByTestId('tournament-seed').click()

    await expect(page.getByTestId('tournament-list').getByText('Auto Cup')).toBeVisible({
      timeout: 60_000,
    })
    const bracket = page.getByTestId('bracket-auto-cup')
    await expect(bracket).toBeVisible()
    // amr leads on season points (round-0 winner) so amr is the top seed
    const firstLine = await bracket.locator('span').first().textContent()
    expect(firstLine).toContain('amr')
  })

  test('weekly digest panel recaps the league on the overview tab', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    const digest = page.getByTestId('league-digest')
    await expect(digest).toBeVisible({ timeout: 60_000 })
    await expect(digest.getByText('Weekly digest')).toBeVisible()
    // duel-1 completed earlier in the lifecycle, so amr gained Elo this week
    await expect(page.getByTestId('digest-elo-movers').getByText(/amr \+/)).toBeVisible()
    await expect(page.getByTestId('digest-elo-movers').getByText(/sara -/)).toBeVisible()
    // the calendar strip shows the current round window and the next rounds
    const strip = page.getByTestId('digest-schedule')
    await expect(strip).toBeVisible()
    await expect(strip).toContainText(/Round \d+ of \d+/)
    await expect(strip).toContainText('next:')
  })

  test('duel stats table tracks the lifecycle duel record', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await page.getByRole('tab', { name: 'Duels' }).click()
    const table = page.getByTestId('duel-stats')
    await expect(table).toBeVisible({ timeout: 60_000 })
    // amr won duel-1 earlier in the lifecycle
    const amrRow = table.locator('tr', { hasText: 'amr' })
    await expect(amrRow).toBeVisible()
    await expect(amrRow).toContainText(/[1-9]\d*-\d+-\d+/)
    await expect(amrRow).toContainText('100%')
  })

  test('league cards flag a round past its calendar end as due', async ({ page }) => {
    await page.goto('/leagues')
    // spring's season start is in the past and its round was never closed on
    // the calendar, so the engine math marks the current round due
    await expect(page.getByTestId(`league-due-${LEAGUE}`)).toBeVisible({ timeout: 60_000 })
  })

  test('rematch a completed duel from the duel list', async ({ page }) => {
    await page.goto('/leagues')
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    await page.getByRole('tab', { name: 'Duels' }).click()
    await expect(page.getByTestId('duel-list')).toBeVisible({ timeout: 60_000 })

    // duel-1 was decided earlier in the lifecycle
    await page.getByTestId('duel-rematch-duel-1').click()
    await expect(page.getByText(/Rematch duel-1-r2 created/)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('duel-list').getByText('duel-1-r2')).toBeVisible()
    // the rematch is open, with swapped seating
    await expect(page.getByTestId('duel-list').getByText('duel-1-r2 — sara vs amr')).toBeVisible()
  })
})

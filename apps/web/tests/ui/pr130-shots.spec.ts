import { expect, test } from '@playwright/test'

/**
 * TEMPORARY PR #130 visual-verification spec (chore branch only, never merged):
 * seeds a league with players, a completed duel and a live tournament via the
 * real API, then screenshots every /leagues surface for review evidence.
 */

const LEAGUE = 'shots-league'

test.beforeAll(async ({ request }) => {
  const post = (data: unknown) => request.post('/api/leagues', { data })
  expect(
    (
      await post({
        action: 'create',
        slug: LEAGUE,
        title: 'Shots League',
        seasonStart: '2026-03-01',
      })
    ).ok(),
  ).toBeTruthy()
  for (const h of ['amr', 'sara', 'khaled', 'omar']) {
    expect((await post({ action: 'join', slug: LEAGUE, handle: h })).ok()).toBeTruthy()
  }
  expect(
    (await post({ action: 'points', slug: LEAGUE, handle: 'amr', reviews: 8 })).ok(),
  ).toBeTruthy()
  expect(
    (await post({ action: 'points', slug: LEAGUE, handle: 'sara', reviews: 3 })).ok(),
  ).toBeTruthy()

  const prompts = [
    { id: 'q1', question: 'What organelle produces ATP?', answers: ['Mitochondria'] },
    { id: 'q2', question: 'Capital of France?', answers: ['Paris'] },
  ]
  expect(
    (
      await post({
        action: 'duel-create',
        slug: 'shots-duel',
        leagueSlug: LEAGUE,
        playerA: 'amr',
        playerB: 'sara',
        prompts,
      })
    ).ok(),
  ).toBeTruthy()
  expect(
    (
      await post({
        action: 'duel-answer',
        slug: 'shots-duel',
        side: 'A',
        answers: [
          { promptId: 'q1', answer: 'Mitochondria', elapsedMs: 900 },
          { promptId: 'q2', answer: 'Paris', elapsedMs: 1100 },
        ],
      })
    ).ok(),
  ).toBeTruthy()
  expect(
    (
      await post({
        action: 'duel-answer',
        slug: 'shots-duel',
        side: 'B',
        answers: [
          { promptId: 'q1', answer: 'Mitochondria', elapsedMs: 1500 },
          { promptId: 'q2', answer: 'London', elapsedMs: 800 },
        ],
      })
    ).ok(),
  ).toBeTruthy()

  expect(
    (
      await post({
        action: 'duel-create',
        slug: 'shots-duel-open',
        leagueSlug: LEAGUE,
        playerA: 'khaled',
        playerB: 'omar',
        prompts: [
          { id: 'p1', question: 'What is 2+2?', answers: ['4'] },
          { id: 'p2', question: 'Largest planet?', answers: ['Jupiter'] },
        ],
      })
    ).ok(),
  ).toBeTruthy()

  expect(
    (
      await post({
        action: 'tournament-create',
        slug: 'shots-cup',
        leagueSlug: LEAGUE,
        title: 'Shots Cup',
        seeds: ['amr', 'sara', 'khaled', 'omar'],
      })
    ).ok(),
  ).toBeTruthy()
})

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

test('capture all /leagues surfaces', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/leagues')
  await expect(page.getByTestId(`league-card-${LEAGUE}`)).toBeVisible({ timeout: 60_000 })
  await page.getByTestId(`league-card-${LEAGUE}`).click()
  // card click selects + jumps to Standings; the digest lives on Overview
  await page.getByRole('tab', { name: 'Overview' }).click()
  // digest panel with schedule strip, Elo movers and recent results
  await expect(page.getByTestId('league-digest')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('digest-elo-movers').getByText(/amr \+/)).toBeVisible()
  await page.screenshot({ path: 'shots/pr130-leagues-overview.png', fullPage: true })

  await page.getByRole('tab', { name: 'Standings' }).click()
  await expect(page.getByText('amr').first()).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: 'shots/pr130-leagues-standings.png', fullPage: true })

  await page.getByRole('tab', { name: 'Duels' }).click()
  await expect(page.getByTestId('duel-stats')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('duel-list').getByText('shots-duel')).toBeVisible()
  await page.screenshot({ path: 'shots/pr130-leagues-duels.png', fullPage: true })

  // guided question-by-question play on the open duel
  await page.getByTestId('duel-play-shots-duel-open').click()
  await expect(page.getByTestId('guided-progress')).toHaveText('Question 1 of 2')
  await expect(page.getByTestId('guided-question')).toHaveText('What is 2+2?')
  await page.screenshot({ path: 'shots/pr130-duels-guided-q1.png', fullPage: true })
  await page.getByTestId('guided-answer-input').fill('4')
  await page.getByTestId('guided-answer-next').click()
  await expect(page.getByTestId('guided-progress')).toHaveText('Question 2 of 2')
  await page.screenshot({ path: 'shots/pr130-duels-guided-q2.png', fullPage: true })
  await page.getByTestId('guided-answer-input').fill('Jupiter')
  await page.getByTestId('guided-answer-next').click()
  await expect(page.getByText('Answers submitted for shots-duel-open.')).toBeVisible()

  await page.getByRole('tab', { name: 'Tournaments' }).click()
  await expect(page.getByTestId('bracket-shots-cup')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: 'shots/pr130-leagues-tournaments.png', fullPage: true })
})

test('tab pill alignment after fonts settle, at two widths', async ({ page }) => {
  test.setTimeout(120_000)
  for (const width of [1280, 760]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/leagues')
    await expect(page.getByTestId(`league-card-${LEAGUE}`)).toBeVisible({ timeout: 60_000 })
    await page.getByTestId(`league-card-${LEAGUE}`).click()
    for (const name of ['Standings', 'Duels', 'Tournaments', 'Overview']) {
      await page.getByRole('tab', { name }).click()
      // the pill re-measures on font swap; wait for fonts before shooting
      await page.evaluate(() => document.fonts.ready)
      const tablist = page.getByRole('tablist')
      await expect(tablist).toBeVisible()
      await tablist.screenshot({
        path: `shots/pr130-tabs-${name.toLowerCase()}-${width}.png`,
      })
    }
  }
})

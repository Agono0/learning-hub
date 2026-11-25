import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * /arena-3d browser spec. Runs against `next dev` on the isolated DB clone
 * (tests/ui/setup/with-test-server.mjs), single-worker like the smoke spec.
 *
 * Covers the arena's three promises:
 *  1. The session is real review: the queue comes from /api/arena over due
 *     cards, and grading in the arena reschedules cards via executeReview.
 *  2. The 3D stage mounts (canvas present) without blocking the DOM loop.
 *  3. Settlement lands: the results screen shows the server's summary, and
 *     the seeded cards end up rescheduled into the future.
 */

const DECK_NAME = 'Arena Spec Deck'
let deckSeq = 0
const uniqueDeckName = (base: string): string => `${base} ${Date.now()}-${++deckSeq}`
const CARD_COUNT = 6

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
})

/** Records every settlement POST so a failing run reports what the server said. */
function trackSettlements(page: Page): { lastReport: () => string } {
  const seen: string[] = []
  page.on('response', (r) => {
    if (r.url().endsWith('/api/arena') && r.request().method() === 'POST') {
      void r.text().then((t) => seen.push(`${r.status()} ${t.slice(0, 80)} ... ${t.slice(-160)}`))
    }
  })
  page.on('pageerror', (e) => seen.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('console', (m) => {
    if (m.type() === 'error') seen.push(`console: ${m.text().slice(0, 200)}`)
  })
  return { lastReport: () => (seen.length ? seen.join(' | ') : 'no settlement POST seen') }
}

async function expectSettled(page: Page, track: { lastReport: () => string }): Promise<void> {
  await expect(page.getByTestId('arena-results')).toBeVisible({ timeout: 30_000 })
  try {
    await expect(page.getByTestId('arena-result-badge')).toBeVisible({ timeout: 30_000 })
  } catch {
    throw new Error(`settlement did not complete: ${track.lastReport()}`)
  }
}

async function seedArenaDeck(request: APIRequestContext, count = CARD_COUNT): Promise<number> {
  const deckRes = await request.post('/api/decks', {
    data: { name: uniqueDeckName(DECK_NAME), description: 'Playwright arena spec', emoji: '⚔️' },
  })
  expect(deckRes.ok(), `deck create: ${deckRes.status()} ${await deckRes.text()}`).toBeTruthy()
  const deck = await deckRes.json()
  const deckId = deck.deck.id as number

  // Cards are created already backdated (POST /api/cards accepts `due`), so
  // every one of them is due the moment the arena asks for its queue.
  const past = new Date(Date.now() - 86_400_000).toISOString()
  for (let i = 0; i < count; i++) {
    const cardRes = await request.post('/api/cards', {
      data: {
        deckId,
        type: 'basic',
        content: { basic: { front: `Arena Spec Q${i + 1}`, back: `Arena Spec A${i + 1}` } },
        due: past,
      },
    })
    expect(cardRes.ok(), `card create: ${cardRes.status()} ${await cardRes.text()}`).toBeTruthy()
  }
  return deckId
}

test('arena session: setup → duel → settlement reschedules the deck', async ({ page, request }) => {
  const deckId = await seedArenaDeck(request)
  const track = trackSettlements(page)

  await page.goto('/arena-3d')
  await expect(page.getByRole('heading', { name: 'Review Arena', level: 1 })).toBeVisible({
    timeout: 60_000,
  })

  // Setup: pick the seeded deck, keep the 10-challenge default, enter.
  await page.getByTestId(`arena-deck-${deckId}`).click()
  await page.getByTestId('arena-start').click()

  // The session mounts: HUD up, first card showing, 3D stage present.
  await expect(page.getByTestId('arena-session')).toBeVisible()
  await expect(page.getByTestId('arena-hud')).toBeVisible()
  await expect(page.getByTestId('arena-hp')).toContainText('60/60')
  await expect(page.getByTestId('arena-stage')).toBeVisible()
  await expect(page.getByTestId('arena-canvas')).toBeVisible()
  await expect(page.getByTestId('guardian-progress-label')).toContainText('Round 1 of 6')

  // Fight the whole run: reveal → Sure → Good for each card.
  for (let round = 0; round < CARD_COUNT; round++) {
    await page.getByTestId('arena-reveal').click()
    await expect(page.getByTestId('arena-card-back')).toBeVisible()
    await page.getByRole('radio', { name: 'Sure', exact: true }).click()
    await page.getByTestId('arena-grade-3').click()
  }

  // Settlement: victory results from the server summary.
  await expectSettled(page, track)
  await expect(page.getByTestId('arena-result-badge')).toHaveText('Victory')
  await expect(page.getByTestId('results-score')).toBeVisible()
  await expect(page.getByTestId('results-xp')).toContainText('XP')
  await expect(page.getByTestId('results-coins')).toContainText('+')

  // Real review happened: all six cards rescheduled into the future.
  const cardsRes = await request.get(`/api/cards?deckId=${deckId}`)
  const cardsBody = await cardsRes.json()
  expect(cardsBody.cards.length).toBe(CARD_COUNT)
  for (const card of cardsBody.cards) {
    expect(new Date(card.due).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(card.reps).toBe(1)
  }
})

test('arena defeat: grading Again until HP runs out ends the run early', async ({
  page,
  request,
}) => {
  // Nine cards: defeat must land BEFORE the queue empties, or the engine's
  // victory precedence (queue cleared) would win the final exchange instead.
  // Again counter is 12; the first hit is shielded (11 taken), so HP 60
  // reaches 0 on the 6th Again with 3 cards still in the queue.
  const deckId = await seedArenaDeck(request, CARD_COUNT + 3)

  await page.goto('/arena-3d')
  await expect(page.getByRole('heading', { name: 'Review Arena', level: 1 })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByTestId(`arena-deck-${deckId}`).click()
  await page.getByTestId('arena-start').click()
  await expect(page.getByTestId('arena-session')).toBeVisible()

  const track = trackSettlements(page)
  for (let round = 0; round < 6; round++) {
    if (await page.getByTestId('arena-results').isVisible()) break
    await page.getByTestId('arena-reveal').click()
    await page.getByTestId('arena-grade-1').click()
  }

  await expectSettled(page, track)
  await expect(page.getByTestId('arena-result-badge')).toHaveText('Defeat')
})

test('reduced motion: the canvas never mounts and the DOM loop still completes', async ({
  page,
  request,
  context,
}) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('lh-onboarding-dismissed', '1')
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const deckId = await seedArenaDeck(request)

  await page.goto('/arena-3d')
  await expect(page.getByRole('heading', { name: 'Review Arena', level: 1 })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByTestId(`arena-deck-${deckId}`).click()
  await page.getByTestId('arena-start').click()

  await expect(page.getByTestId('arena-session')).toBeVisible()
  await expect(page.getByTestId('arena-stage')).toHaveCount(0)

  // One exchange through the DOM-only loop proves the session is playable.
  await page.getByTestId('arena-reveal').click()
  await page.getByTestId('arena-grade-4').click()
  await expect(page.getByTestId('guardian-progress-label')).toContainText('Round 2 of 6')
})

test('empty selection shows a recoverable notice instead of a broken session', async ({
  page,
  request,
}) => {
  // A deck whose cards are all scheduled in the future → nothing due.
  const deckRes = await request.post('/api/decks', {
    data: { name: uniqueDeckName('Arena Empty Deck'), description: 'Nothing due' },
  })
  const deck = await deckRes.json()
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const cardRes = await request.post('/api/cards', {
    data: {
      deckId: deck.deck.id,
      type: 'basic',
      content: { basic: { front: 'Future Q', back: 'Future A' } },
      due: future,
    },
  })
  expect(cardRes.ok()).toBeTruthy()

  await page.goto('/arena-3d')
  await expect(page.getByRole('heading', { name: 'Review Arena', level: 1 })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByTestId(`arena-deck-${deck.deck.id}`).click()
  await page.getByTestId('arena-start').click()

  await expect(page.getByTestId('arena-load-error')).toBeVisible()
  await expect(page.getByTestId('arena-session')).toHaveCount(0)
})

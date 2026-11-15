import { describe, it, expect, beforeAll } from 'vitest'
import { callRoute } from '../helpers/api-client'
import type { CardRow, DeckRow } from '../helpers/rows'

/** POST /api/review — the fields this suite asserts on. */
interface ReviewResult {
  ok: boolean
  card: CardRow
  preReview: { state: number }
  revlogId: number
  intervalDays: number
  due: string
  xp: number
  streak: unknown
}
import * as decksRoute from '../../../apps/web/app/api/decks/route'
import * as cardsRoute from '../../../apps/web/app/api/cards/route'
import * as reviewRoute from '../../../apps/web/app/api/review/route'
import * as statsRoute from '../../../apps/web/app/api/review/stats/route'

describe('Tier 1: Review Pipeline & FSRS Scheduling', () => {
  let deckId: number
  let cardId: number

  beforeAll(async () => {
    // Create dedicated deck and card
    const deckRes = await callRoute<{ deck: DeckRow }>(decksRoute.POST, {
      method: 'POST',
      body: { name: 'E2E Review Track Deck' },
    })
    deckId = deckRes.data.deck.id

    const cardRes = await callRoute<{ card: CardRow }>(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId,
        type: 'basic',
        content: { front: 'What is FSRS?', back: 'Free Spaced Repetition Scheduler' },
        due: new Date(Date.now() - 60000).toISOString(), // due in the past
      },
    })
    cardId = cardRes.data.card.id
  })

  it('builds a review session via GET /api/review', async () => {
    const res = await callRoute<{ ok: boolean; cards: CardRow[]; mode: string; retention: number }>(
      reviewRoute.GET,
      {
        query: { deckId, mode: 'normal' },
      },
    )

    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(Array.isArray(res.data.cards)).toBe(true)
    const cardFound = res.data.cards.find((c) => c.id === cardId)
    expect(cardFound).toBeDefined()
    expect(res.data.mode).toBe('normal')
    expect(typeof res.data.retention).toBe('number')
  })

  it('applies a review grade via POST /api/review (Grade 3: Good, Confident)', async () => {
    const res = await callRoute<ReviewResult>(reviewRoute.POST, {
      method: 'POST',
      body: {
        cardId,
        grade: 3, // Good
        confidence: 1, // High confidence
        timeMs: 4200,
      },
    })

    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(res.data.card.id).toBe(cardId)
    expect(res.data.preReview).toBeDefined()
    expect(res.data.preReview.state).toBe(0) // Was new
    expect(res.data.revlogId).toBeDefined()
    expect(res.data.intervalDays).toBeGreaterThanOrEqual(0)
    expect(res.data.due).toBeDefined()
    expect(res.data.xp).toBeGreaterThan(0) // Should have review XP + confidence bonus
    expect(res.data.streak).toBeDefined()
  })

  it('retrieves updated retention and due forecast via GET /api/review/stats', async () => {
    const res = await callRoute<{
      trueRetention: unknown
      today: { reviews: number }
      forecast: unknown[]
    }>(statsRoute.GET)

    expect(res.status).toBe(200)
    expect(res.data.trueRetention).toBeDefined()
    expect(res.data.today).toBeDefined()
    expect(res.data.today.reviews).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(res.data.forecast)).toBe(true)
    expect(res.data.forecast.length).toBe(30)
  })

  it('builds an interleaved multi-deck session via GET /api/review?deckIds=...', async () => {
    const deck2Res = await callRoute<{ deck: DeckRow }>(decksRoute.POST, {
      method: 'POST',
      body: { name: 'E2E Review Interleaved Deck 2' },
    })
    const deck2Id = deck2Res.data.deck.id

    await callRoute<{ card: CardRow }>(cardsRoute.POST, {
      method: 'POST',
      body: {
        deckId: deck2Id,
        type: 'basic',
        content: { front: 'Deck 2 Question', back: 'Deck 2 Answer' },
        due: new Date(Date.now() - 60000).toISOString(),
      },
    })

    const res = await callRoute<{ ok: boolean; cards: CardRow[]; mode: string }>(reviewRoute.GET, {
      query: { deckIds: `${deckId},${deck2Id}`, mode: 'normal' },
    })

    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    const returnedDeckIds = new Set(res.data.cards.map((c) => c.deckId))
    expect(returnedDeckIds.has(deck2Id)).toBe(true)
  })
})

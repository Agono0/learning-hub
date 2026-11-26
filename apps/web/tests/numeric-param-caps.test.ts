/**
 * GET /api/review?limit and GET /api/games?maxPairs: the caps (100 cards, 12 pairs) must hold
 * for every input. A negative value used to be taken as a slice offset and returned nearly
 * everything, and NaN silently returned an empty result instead of the default.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-num-caps-')), 'n.db')

type Mods = {
  review: typeof import('../src/server/handlers/review/route')
  games: typeof import('../src/server/handlers/games/route')
}
let M: Mods
let deckId = 0

beforeAll(async () => {
  const db = await import('@learning-hub/db')
  M = {
    review: await import('../src/server/handlers/review/route'),
    games: await import('../src/server/handlers/games/route'),
  }
  const [deck] = db.db.insert(db.decks).values({ name: 'Caps' }).returning().all()
  deckId = deck!.id
  for (let i = 0; i < 130; i++) {
    db.db
      .insert(db.cards)
      .values({
        deckId,
        type: 'basic',
        content: { basic: { front: `front ${i}`, back: `back ${i}` } } as never,
        due: new Date(Date.now() - 60_000 - i * 1000).toISOString(),
      } as never)
      .run()
  }
})

async function reviewCount(limit: string | null) {
  const qs = limit === null ? '' : `&limit=${encodeURIComponent(limit)}`
  const res = await M.review.GET(new Request(`http://localhost/api/review?deckId=${deckId}${qs}`))
  expect(res.status).toBe(200)
  return ((await res.json()) as { cards: unknown[] }).cards.length
}

async function pairCount(maxPairs: string | null) {
  const qs = maxPairs === null ? '' : `&maxPairs=${encodeURIComponent(maxPairs)}`
  const res = await M.games.GET(new Request(`http://localhost/api/games?deckId=${deckId}${qs}`))
  expect(res.status).toBe(200)
  return ((await res.json()) as { pairs: unknown[] }).pairs.length
}

describe('GET /api/review limit', () => {
  it('uses the default of 20 when absent, negative or not a number', async () => {
    expect(await reviewCount(null)).toBe(20)
    expect(await reviewCount('-1')).toBe(20)
    expect(await reviewCount('-50')).toBe(20)
    expect(await reviewCount('abc')).toBe(20)
    expect(await reviewCount('Infinity')).toBe(20)
  })

  it('honors valid values and keeps the cap of 100', async () => {
    expect(await reviewCount('5')).toBe(5)
    expect(await reviewCount('1.9')).toBe(1)
    expect(await reviewCount('0')).toBe(0)
    expect(await reviewCount('100')).toBe(100)
    expect(await reviewCount('1000000')).toBe(100)
  })
})

describe('GET /api/games maxPairs', () => {
  it('uses the default of 8 when absent, negative or not a number', async () => {
    expect(await pairCount(null)).toBe(8)
    expect(await pairCount('-1')).toBe(8)
    expect(await pairCount('-3')).toBe(8)
    expect(await pairCount('abc')).toBe(8)
  })

  it('honors valid values and keeps the cap of 12', async () => {
    expect(await pairCount('3')).toBe(3)
    expect(await pairCount('0')).toBe(0)
    expect(await pairCount('12')).toBe(12)
    expect(await pairCount('1000000')).toBe(12)
  })
})

/**
 * GET /api/cards — the `limit` query param is capped at 500 and cannot be
 * widened by a negative or non-numeric value (SQLite treats LIMIT -1 as unlimited).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-cards-limit-')), 'c.db')

let GET: typeof import('../src/server/handlers/cards/route').GET

beforeAll(async () => {
  const D = await import('@learning-hub/db')
  ;({ GET } = await import('../src/server/handlers/cards/route'))
  const [deck] = D.db.insert(D.decks).values({ name: 'Limit Test' }).returning().all()
  D.db.transaction((tx) => {
    for (let i = 0; i < 520; i++) {
      tx.insert(D.cards)
        .values({
          deckId: deck!.id,
          type: 'basic',
          content: { basic: { front: `q${i}`, back: 'a' } },
          due: '2026-01-01T00:00:00.000Z',
        })
        .run()
    }
  })
})

async function count(query: string): Promise<number> {
  const res = await GET(new Request(`http://localhost/api/cards${query}`))
  expect(res.status).toBe(200)
  return ((await res.json()) as { cards: unknown[] }).cards.length
}

describe('GET /api/cards limit', () => {
  it('defaults to 200', async () => expect(await count('')).toBe(200))
  it('honours a valid limit and floors fractions', async () => {
    expect(await count('?limit=7')).toBe(7)
    expect(await count('?limit=7.9')).toBe(7)
    expect(await count('?limit=0')).toBe(0)
  })
  it('caps at 500', async () => expect(await count('?limit=5000')).toBe(500))
  it('does not let a negative limit disable the cap', async () =>
    expect(await count('?limit=-1')).toBe(200))
  it('does not let a non-numeric limit disable the cap', async () => {
    expect(await count('?limit=abc')).toBe(200)
    expect(await count('?limit=Infinity')).toBe(200)
  })
})

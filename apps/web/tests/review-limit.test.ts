/**
 * GET /api/review: `limit` was `Math.min(Number(raw), 100)`. A negative value
 * made the session builder drop cards from the end instead of capping, and a
 * non-numeric value became NaN. Synthetic cards only.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-review-limit-')), 'r.db')

let GET: typeof import('../src/server/handlers/review/route').GET

beforeAll(async () => {
  const D = await import('@learning-hub/db')
  ;({ GET } = await import('../src/server/handlers/review/route'))
  const [deck] = D.db.insert(D.decks).values({ name: 'Review Limit' }).returning().all()
  D.db.transaction((tx) => {
    for (let i = 0; i < 130; i++) {
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
  const res = await GET(new Request(`http://localhost/api/review${query}`))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { cards?: unknown[]; queue?: unknown[] }
  return (body.cards ?? body.queue ?? []).length
}

describe('GET /api/review limit', () => {
  it('defaults to 20 and caps at 100', async () => {
    expect(await count('')).toBe(20)
    expect(await count('?limit=5000')).toBe(100)
    expect(await count('?limit=7')).toBe(7)
  })
  it('does not let a negative or non-numeric limit change the cap', async () => {
    expect(await count('?limit=-1')).toBe(1)
    for (const bad of ['abc', 'NaN', 'Infinity']) expect(await count(`?limit=${bad}`), bad).toBe(20)
  })
})

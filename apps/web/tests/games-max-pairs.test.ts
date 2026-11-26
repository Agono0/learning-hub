/** Games `maxPairs`: NaN produced an empty game and a negative value dropped cards from the end. Synthetic data only. */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-query-num-')), 'n.db')

type Handler = (req: Request) => Promise<Response>
const h: Record<string, Handler> = {}
let deckId = 0

beforeAll(async () => {
  const D = await import('@learning-hub/db')
  h.games = (await import('../src/server/handlers/games/route')).GET as Handler
  const [deck] = D.db.insert(D.decks).values({ name: 'Games' }).returning().all()
  deckId = deck!.id
  D.db.transaction((tx) => {
    for (let i = 0; i < 40; i++) {
      tx.insert(D.cards)
        .values({
          deckId,
          type: 'basic',
          content: { basic: { front: `q${i}`, back: `a${i}` } },
          due: '2026-01-01T00:00:00.000Z',
        })
        .run()
    }
  })
})

const get = (name: string, q: string) => h[name]!(new Request(`http://localhost/api/x${q}`))

describe('games maxPairs', () => {
  const pairs = async (q: string) => {
    const res = await get('games', `?deckId=${deckId}${q}`)
    expect(res.status).toBe(200)
    return ((await res.json()) as { pairs: unknown[] }).pairs.length
  }
  it('defaults to 8 and caps at 12', async () => {
    expect(await pairs('')).toBe(8)
    expect(await pairs('&maxPairs=500')).toBe(12)
  })
  it('falls back to 8 for non-numeric and clamps negatives to 1', async () => {
    expect(await pairs('&maxPairs=abc')).toBe(8)
    expect(await pairs('&maxPairs=-3')).toBe(1)
  })
})

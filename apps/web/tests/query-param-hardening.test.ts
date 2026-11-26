/**
 * Route-level checks for strict query parsing: a negative / NaN / fractional `limit` must not
 * widen a page (SQLite LIMIT -1 is unlimited), and ids must be positive integers.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-qp-')), 'q.db')

type Handler = (req: Request) => Promise<Response> | Response
let review: Handler
let digest: Handler
let dependenciesDel: Handler
let attemptImage: Handler
let readingDel: Handler
let captureDel: Handler
let friendDel: Handler
let glossary: Handler
let sq3r: Handler
let games: Handler
const u = (p: string) => `http://localhost${p}`

beforeAll(async () => {
  const D = await import('@learning-hub/db')
  review = (await import('../src/server/handlers/review/route')).GET as Handler
  digest = (await import('../src/server/handlers/audio/digest/route')).GET as Handler
  dependenciesDel = (await import('../src/server/handlers/curriculum/graph/dependencies/route'))
    .DELETE as Handler
  attemptImage = (await import('../src/server/handlers/review/attempt-image/route')).GET as Handler
  readingDel = (await import('../src/server/handlers/reading/route')).DELETE as Handler
  captureDel = (await import('../src/server/handlers/hud/capture/route')).DELETE as Handler
  friendDel = (await import('../src/server/handlers/social/leaderboard/route')).DELETE as Handler
  glossary = (await import('../src/server/handlers/curriculum/glossary/route')).GET as Handler
  sq3r = (await import('../src/server/handlers/reading/sq3r/route')).GET as Handler
  games = (await import('../src/server/handlers/games/route')).GET as Handler
  const [deck] = D.db.insert(D.decks).values({ name: 'QP' }).returning().all()
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

async function reviewCount(qs: string): Promise<number> {
  const res = await review(new Request(u(`/api/review${qs}`)))
  expect(res.status).toBe(200)
  return ((await res.json()) as { cards: unknown[] }).cards.length
}

describe('GET /api/review limit', () => {
  it('defaults to 20', async () => expect(await reviewCount('')).toBeLessThanOrEqual(20))
  it('caps at 100', async () => expect(await reviewCount('?limit=5000')).toBeLessThanOrEqual(100))
  it.each(['-1', '-100', 'abc', 'NaN', 'Infinity', '', '1.5'])(
    'limit=%j never exceeds the default page',
    async (v) => expect(await reviewCount(`?limit=${v}`)).toBeLessThanOrEqual(20),
  )
})

describe('GET /api/audio/digest', () => {
  it.each(['-1', 'abc', 'Infinity'])('limit=%s does not 500', async (v) => {
    const res = await digest(new Request(u(`/api/audio/digest?limit=${v}&minutes=${v}`)))
    expect(res.status).toBe(200)
  })
})

describe('id params must be positive integers', () => {
  const bad = ['0', '-1', '1.5', 'abc', 'Infinity', '']
  it.each(bad)('DELETE dependencies id=%j -> 400', async (v) => {
    const res = await dependenciesDel(new Request(u(`/api/x?id=${v}`), { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })
  it.each(bad)('DELETE reading id=%j -> 400', async (v) => {
    const res = await readingDel(new Request(u(`/api/x?id=${v}`), { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })
  it.each(bad)('DELETE hud capture id=%j -> 400', async (v) => {
    const res = await captureDel(new Request(u(`/api/x?id=${v}`), { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })
  it.each(bad)('DELETE friend id=%j -> 400', async (v) => {
    const res = await friendDel(new Request(u(`/api/x?id=${v}`), { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })
  it.each(bad)('GET attempt-image cardId=%j -> 400', async (v) => {
    const res = await attemptImage(new Request(u(`/api/x?cardId=${v}`)))
    expect(res.status).toBe(400)
  })
  it.each(bad)('GET glossary courseId=%j -> 400', async (v) => {
    const res = await glossary(new Request(u(`/api/x?courseId=${v}`)))
    expect(res.status).toBe(400)
  })
  it.each(bad)('GET sq3r sourceId=%j -> 400', async (v) => {
    const res = await sq3r(new Request(u(`/api/x?sourceId=${v}`)))
    expect(res.status).toBe(400)
  })
  it.each(bad)('GET games deckId=%j -> 400', async (v) => {
    const res = await games(new Request(u(`/api/x?deckId=${v}`)))
    expect(res.status).toBe(400)
  })
})

/**
 * GET /api/review?cardIds=...: an explicit card list (used by exam prep days).
 * The default queue is unchanged. Eligibility is not bypassed: unknown,
 * suspended, buried and out-of-scope cards reject the whole request, and the
 * list is validated and capped. Reading never writes.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-review-ids-')), 'r.db')

type Mods = {
  route: typeof import('../src/server/handlers/review/route')
  ids: typeof import('../src/server/handlers/review/card-ids')
  db: typeof import('@learning-hub/db')
}
let M: Mods
const day = 86_400_000
const iso = (d: number) => new Date(Date.now() + d * day).toISOString()
const idsOf: Record<string, number> = {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(qs: string): Promise<{ status: number; body: any }> {
  const res = await M.route.GET(new Request(`http://localhost/api/review${qs}`))
  return { status: res.status, body: await res.json() }
}

beforeAll(async () => {
  const db = await import('@learning-hub/db')
  const route = await import('../src/server/handlers/review/route')
  const ids = await import('../src/server/handlers/review/card-ids')
  M = { route, ids, db }
  const [d1] = db.db.insert(db.decks).values({ name: 'A' }).returning().all()
  const [d2] = db.db.insert(db.decks).values({ name: 'B' }).returning().all()
  const mk = (key: string, deckId: number, over: Record<string, unknown> = {}) => {
    const [c] = db.db
      .insert(db.cards)
      .values({
        deckId,
        type: 'basic',
        content: { basic: { front: key, back: 'x' } } as never,
        state: 2,
        stability: 10,
        difficulty: 5,
        reps: 3,
        scheduledDays: 10,
        lastReview: iso(-3),
        due: iso(20), // far in the future: not in the ordinary queue
        ...over,
      })
      .returning()
      .all()
    idsOf[key] = c!.id
  }
  mk('far1', d1!.id)
  mk('far2', d1!.id)
  mk('due', d1!.id, { due: iso(-1) })
  mk('susp', d1!.id, { suspended: true })
  mk('buried', d1!.id, { buryUntil: iso(2) })
  mk('otherdeck', d2!.id)
  idsOf.deck1 = d1!.id
})

describe('parseCardIds', () => {
  it('treats an absent param as no list and rejects malformed lists', () => {
    expect(M.ids.parseCardIds(null)).toEqual({ ok: true, ids: null })
    expect(M.ids.parseCardIds('1,2,3')).toEqual({ ok: true, ids: [1, 2, 3] })
    for (const bad of ['', '1,,2', '0', '-1', '1.5', 'a', '1,1', ' '])
      expect(M.ids.parseCardIds(bad).ok).toBe(false)
    const many = Array.from({ length: M.ids.MAX_EXPLICIT_CARD_IDS + 1 }, (_, i) => i + 1).join(',')
    expect(M.ids.parseCardIds(many).ok).toBe(false)
  })
})

describe('GET /api/review explicit card list', () => {
  it('leaves the ordinary queue alone when no list is given', async () => {
    const { body } = await get('')
    expect(body.explicit).toBe(false)
    expect(body.earlyCount).toBe(0)
    const got = body.cards.map((c: { id: number }) => c.id)
    expect(got).toContain(idsOf.due)
    expect(got).not.toContain(idsOf.far1)
  })

  it('returns exactly the listed cards, in the order given, even when not due', async () => {
    const { status, body } = await get(`?cardIds=${idsOf.far2},${idsOf.far1}`)
    expect(status).toBe(200)
    expect(body.explicit).toBe(true)
    expect(body.cards.map((c: { id: number }) => c.id)).toEqual([idsOf.far2, idsOf.far1])
    expect(body.cards[0].previews[3]).toBeTruthy()
    expect(body.earlyCount).toBe(2) // both far cards are not due yet
    const mixed = await get(`?cardIds=${idsOf.due},${idsOf.far1}`)
    expect(mixed.body.earlyCount).toBe(1)
  })

  it('rejects unknown, suspended and buried cards and names them', async () => {
    const r = await get(`?cardIds=${idsOf.far1},${idsOf.susp},${idsOf.buried},999999`)
    expect(r.status).toBe(400)
    expect(new Set(r.body.cardIds)).toEqual(new Set([idsOf.susp, idsOf.buried, 999999]))
  })

  it('does not let the list escape the chosen deck', async () => {
    const ok = await get(`?deckId=${idsOf.deck1}&cardIds=${idsOf.far1}`)
    expect(ok.status).toBe(200)
    const out = await get(`?deckId=${idsOf.deck1}&cardIds=${idsOf.far1},${idsOf.otherdeck}`)
    expect(out.status).toBe(400)
    expect(out.body.cardIds).toEqual([idsOf.otherdeck])
  })

  it('rejects duplicate, malformed and over-long lists', async () => {
    expect((await get(`?cardIds=${idsOf.far1},${idsOf.far1}`)).status).toBe(400)
    expect((await get('?cardIds=abc')).status).toBe(400)
    expect((await get('?cardIds=')).status).toBe(400)
    const many = Array.from({ length: 101 }, (_, i) => i + 1).join(',')
    expect((await get(`?cardIds=${many}`)).status).toBe(400)
  })

  it('reading never writes a review or changes a card', async () => {
    const snap = () =>
      JSON.stringify([
        M.db.db.select().from(M.db.cards).all(),
        M.db.db.select().from(M.db.revlog).all(),
      ])
    const before = snap()
    await get(`?cardIds=${idsOf.far1}`)
    await get('?cardIds=999999')
    expect(snap()).toBe(before)
  })
})

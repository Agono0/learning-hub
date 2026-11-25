/**
 * Study session API: a read-only, bounded card picker.
 * Checks parameter parsing, validation, bounds, the funnel, labels,
 * assumptions, the start link, stale-set detection and that nothing is written.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-study-session-api-')), 'p.db')

type Mods = {
  route: typeof import('../src/server/handlers/study-session/preview/route')
  review: typeof import('../src/server/handlers/review/card-ids')
  db: typeof import('@learning-hub/db')
}
let M: Mods
let deckA: number
let deckB: number
const ids: number[] = []

const day = 86_400_000
const iso = (d: number) => new Date(Date.now() + d * day).toISOString()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(qs = ''): Promise<{ status: number; body: any }> {
  const res = await M.route.GET(new Request(`http://localhost/api/study-session/preview${qs}`))
  return { status: res.status, body: await res.json() }
}

beforeAll(async () => {
  const db = await import('@learning-hub/db')
  const route = await import('../src/server/handlers/study-session/preview/route')
  const review = await import('../src/server/handlers/review/card-ids')
  M = { route, review, db }
  deckA = db.db.insert(db.decks).values({ name: 'Anatomy' }).returning().all()[0]!.id
  deckB = db.db.insert(db.decks).values({ name: 'Pharma' }).returning().all()[0]!.id
  for (let i = 0; i < 40; i++) {
    const row = db.db
      .insert(db.cards)
      .values({
        deckId: i < 30 ? deckA : deckB,
        type: 'basic',
        content: { basic: { front: `Q${i}`, back: `A${i}` } } as never,
        tags: i % 3 === 0 ? ['bio', 'ch1'] : i % 3 === 1 ? ['bio'] : [],
        state: i < 36 ? 2 : 0,
        stability: i < 36 ? 3 + (i % 8) * 4 : 0,
        difficulty: 5,
        reps: i < 36 ? 3 : 0,
        lapses: i % 5,
        lastReview: i < 36 ? iso(-4 - (i % 9) * 3) : null,
        due: iso(i % 4 === 0 ? -3 : i % 4 === 1 ? 0 : i % 4 === 2 ? 5 : 40),
      })
      .returning()
      .all()[0]!
    ids.push(row.id)
  }
  db.db.update(db.cards).set({ suspended: true }).where(eq(db.cards.id, ids[1]!)).run()
  db.db
    .update(db.cards)
    .set({ buryUntil: iso(2) })
    .where(eq(db.cards.id, ids[2]!))
    .run()
})

describe('GET /api/study-session/preview', () => {
  it('with no filters picks the default 20 most overdue cards and says more matched', async () => {
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.selected).toBe(20)
    expect(body.matched).toBe(38)
    expect(body.truncated).toBe(true)
    expect(body.scanned).toBe(40)
    expect(body.excluded).toMatchObject({ suspended: 1, buried: 1 })
    expect(body.startHref).toBe(
      `/review?cardIds=${body.cards.map((c: { id: number }) => c.id).join(',')}`,
    )
  })

  it('every response carries assumptions, a note and a funnel', async () => {
    const { body } = await get('?tags=bio')
    expect(body.assumptions.length).toBeGreaterThan(0)
    expect(body.assumptions[0]).toMatch(/as of \d{4}-\d{2}-\d{2}/)
    expect(body.note).toMatch(/Nothing here is scheduled or reviewed for you/)
    expect(body.funnel[0].key).toBe('eligible')
    expect(body.funnel.at(-1).key).toBe('tags')
  })

  it('filters by deck, every tag, state, lapses and due window', async () => {
    const deck = await get(`?deckIds=${deckB}&limit=100`)
    expect(deck.body.cards.every((c: { deckId: number }) => c.deckId === deckB)).toBe(true)
    const tags = await get('?tags=bio,ch1&limit=100')
    expect(tags.body.cards.length).toBeGreaterThan(0)
    expect(tags.body.cards.every((c: { tags: string[] }) => c.tags.includes('ch1'))).toBe(true)
    const states = await get('?states=0&limit=100')
    expect(states.body.cards.every((c: { state: number }) => c.state === 0)).toBe(true)
    const lapses = await get('?minLapses=3&limit=100')
    expect(lapses.body.cards.every((c: { lapses: number }) => c.lapses >= 3)).toBe(true)
    const due = await get('?dueByDays=0&limit=100')
    expect(due.body.cards.every((c: { dueInDays: number }) => c.dueInDays <= 0.1)).toBe(true)
  })

  it('recallBelow drops cards without an estimate and reports how many', async () => {
    const { body } = await get('?recallBelow=0.95&states=0,2&limit=100')
    expect(body.noRecallEstimate).toBeGreaterThan(0)
    for (const c of body.cards) {
      expect(c.recall).not.toBeNull()
      expect(c.recall).toBeLessThan(0.95)
    }
  })

  it('names the filter that emptied the list', async () => {
    const { body } = await get('?tags=bio&minLapses=900')
    expect(body.cards).toEqual([])
    expect(body.startHref).toBe('')
    expect(body.funnel.find((f: { count: number }) => f.count === 0).key).toBe('lapses')
  })

  it('labels cards with their front text and deck name', async () => {
    const { body } = await get(`?deckIds=${deckA}&limit=5`)
    expect(body.cards[0].deck).toBe('Anatomy')
    expect(body.cards[0].label).toMatch(/^Q\d+$/)
  })

  it('caps a session at 100 cards, the review queue explicit-list cap', async () => {
    expect((await get('?limit=100')).status).toBe(200)
    expect((await get('?limit=101')).status).toBe(400)
    expect((await get('?limit=0')).status).toBe(400)
    const { STUDY_SESSION_LIMITS } = await import('@learning-hub/core')
    expect(STUDY_SESSION_LIMITS.maxCards).toBe(M.review.MAX_EXPLICIT_CARD_IDS)
  })

  it.each([
    '?limit=abc',
    '?limit=',
    '?recallBelow=NaN',
    '?recallBelow=1',
    '?recallBelow=0',
    '?dueByDays=366',
    '?dueByDays=-1',
    '?minLapses=1.5',
    '?minLapses=5&maxLapses=2',
    '?states=4',
    '?states=1,1',
    '?deckIds=0',
    '?deckIds=1,x',
    '?tags=a,a',
    '?tags=',
    '?sort=random',
    '?bogus=1',
  ])('rejects %s with 400 and a reason', async (qs) => {
    const { status, body } = await get(qs)
    expect(status).toBe(400)
    expect(body.ok).toBe(false)
    expect(typeof body.error).toBe('string')
  })

  it('the picked set opens in the review queue parser untouched', async () => {
    const { body } = await get('?limit=100')
    const parsed = M.review.parseCardIds(body.startHref.split('cardIds=')[1])
    expect(parsed.ok).toBe(true)
  })

  it('the fingerprint changes when a picked card is suspended, so Start can tell', async () => {
    const before = await get('?limit=10')
    const first = before.body.cards[0].id as number
    M.db.db.update(M.db.cards).set({ suspended: true }).where(eq(M.db.cards.id, first)).run()
    const after = await get('?limit=10')
    expect(after.body.fingerprint).not.toBe(before.body.fingerprint)
    expect(after.body.cards.map((c: { id: number }) => c.id)).not.toContain(first)
    M.db.db.update(M.db.cards).set({ suspended: false }).where(eq(M.db.cards.id, first)).run()
  })

  it('is deterministic for the same data', async () => {
    const a = await get('?sort=lowest-recall&limit=15')
    const b = await get('?sort=lowest-recall&limit=15')
    expect(a.body.cards.map((c: { id: number }) => c.id)).toEqual(
      b.body.cards.map((c: { id: number }) => c.id),
    )
  })

  it('writes nothing: no review log rows, no card changes', async () => {
    const snap = () =>
      JSON.stringify(
        M.db.db
          .select()
          .from(M.db.cards)
          .all()
          .map((c) => [c.id, c.due, c.reps, c.state]),
      )
    const before = snap()
    await get('?limit=100&sort=lowest-recall&recallBelow=0.9')
    expect(snap()).toBe(before)
    expect(M.db.db.select().from(M.db.revlog).all()).toHaveLength(0)
  })
})

describe('custom weights', () => {
  it('uses the deck weights decay for that deck and reports it', async () => {
    const w = Array.from({ length: 21 }, () => 1)
    w[20] = 0.4
    M.db.db.update(M.db.decks).set({ fsrsWeights: w }).where(eq(M.db.decks.id, deckB)).run()
    const { body } = await get('?states=2&recallBelow=0.99&limit=100')
    expect(body.decaySource.custom).toBeGreaterThan(0)
    expect(body.decaySource.default).toBeGreaterThan(0)
    expect(body.assumptions[0]).toMatch(
      /use the forgetting-curve decay from your stored FSRS weights/,
    )
    expect(body.assumptions[0]).toMatch(/not a validated prediction/)
    M.db.db.update(M.db.decks).set({ fsrsWeights: null }).where(eq(M.db.decks.id, deckB)).run()
    const again = await get('?states=2&recallBelow=0.99&limit=100')
    expect(again.body.decaySource.custom).toBe(0)
  })
})

describe('scan bound', () => {
  it('refuses, rather than samples, when more cards are in scope than a session can scan', async () => {
    const { runStudySession } = await import('@learning-hub/db')
    const { STUDY_SESSION_LIMITS } = await import('@learning-hub/core')
    const fake = {
      select: () => ({
        from: () => ({ where: () => ({ get: () => ({ n: STUDY_SESSION_LIMITS.maxScan + 1 }) }) }),
      }),
    } as never
    const r = await runStudySession({}, { db: fake })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(422)
      expect(r.error).toMatch(/Choose one or a few decks/)
    }
  })
})

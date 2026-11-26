import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  INF_MAX_DECISIONS,
  INF_MAX_DRILL_PER_DAY,
  InterferenceLimitError,
  InterferenceValidationError,
  cards,
  decks,
  getPairDrill,
  initDb,
  interferenceDrills,
  interferencePairs,
  listDrillSummaries,
  listPairDecisions,
  logPairDrill,
  planSeparatedSession,
  revlog,
  revlogUndos,
  runInterferenceAuditDb,
  setDb,
  setPairStatus,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
const NOW = new Date('2026-11-20T12:00:00.000Z')
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 10, day, hour)).toISOString()

beforeAll(async () => {
  db = await initDb({ path: join(mkdtempSync(join(tmpdir(), 'lh-inf-')), 'i.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(interferenceDrills).run()
  db.delete(interferencePairs).run()
  db.delete(revlogUndos).run()
  db.delete(revlog).run()
  db.delete(cards).run()
  db.delete(decks).run()
  db.insert(decks).values({ id: 1, name: 'Bio' }).run()
  db.insert(decks).values({ id: 2, name: 'Other' }).run()
})

function addCard(id: number, front: string, back: string, deckId = 1, extra: object = {}) {
  db.insert(cards)
    .values({
      id,
      deckId,
      type: 'basic',
      content: { basic: { front, back } },
      due: '2026-11-21T00:00:00.000Z',
      ...extra,
    })
    .run()
}
function review(id: number, cardId: number, rating: number, when: string) {
  db.insert(revlog)
    .values({
      id,
      cardId,
      rating,
      state: 2,
      elapsedDays: 1,
      scheduledDays: 1,
      timeMs: 1000,
      reviewedAt: when,
    })
    .run()
}
function lookalikes() {
  addCard(1, 'Which enzyme unwinds DNA at the fork?', 'Helicase')
  addCard(2, 'Which enzyme unwinds RNA at the fork?', 'Topoisomerase')
  addCard(3, 'Capital of Peru', 'Lima')
}

describe('audit on live data', () => {
  it('finds the pair, skips suspended cards and unsupported formats', () => {
    lookalikes()
    addCard(4, 'Which enzyme unwinds DNA at the fork also?', 'Gyrase', 1, { suspended: true })
    db.insert(cards)
      .values({
        id: 5,
        deckId: 1,
        type: 'occlusion',
        content: { occlusion: {} } as never,
        due: NOW.toISOString(),
      })
      .run()
    const r = runInterferenceAuditDb({ now: NOW })
    expect(r.audit.scanned).toBe(3)
    expect(r.audit.pairs).toHaveLength(1)
    expect([r.audit.pairs[0]!.a, r.audit.pairs[0]!.b]).toEqual([1, 2])
  })
  it('limits to one deck', () => {
    lookalikes()
    db.insert(cards)
      .values({
        id: 9,
        deckId: 2,
        type: 'basic',
        content: { basic: { front: 'x y z', back: 'w' } },
        due: NOW.toISOString(),
      })
      .run()
    expect(runInterferenceAuditDb({ deckId: 2, now: NOW }).audit.scanned).toBe(1)
  })
  it('uses reviews as evidence and ignores undone ones', () => {
    lookalikes()
    let id = 1
    for (let d = 1; d <= 10; d++) {
      review(id++, 1, 3, at(d, 8))
      review(id++, 2, 1, at(d, 9))
    }
    for (let d = 11; d <= 18; d++) review(id++, 2, 3, at(d, 9))
    expect(runInterferenceAuditDb({ now: NOW }).audit.pairs[0]!.evidence.verdict).toBe(
      'interfering',
    )
    db.insert(revlogUndos)
      .values(
        db
          .select()
          .from(revlog)
          .all()
          .map((r) => ({ revlogId: r.id, cardId: r.cardId, undoneAt: NOW.toISOString() })),
      )
      .run()
    expect(runInterferenceAuditDb({ now: NOW }).audit.pairs[0]!.evidence.exposedReviews).toBe(0)
  })
})

describe('pair decisions', () => {
  it('stores smaller id first, dismisses, confirms and clears without deleting', () => {
    lookalikes()
    expect(setPairStatus(2, 1, 'dismissed', 'fine', NOW)).toBe(true)
    expect(listPairDecisions()).toEqual([{ a: 1, b: 2, status: 'dismissed' }])
    expect(runInterferenceAuditDb({ now: NOW }).audit.pairs).toHaveLength(0)
    expect(setPairStatus(1, 2, 'confirmed', undefined, new Date(NOW.getTime() + 1000))).toBe(true)
    expect(runInterferenceAuditDb({ now: NOW }).audit.confirmed).toBe(1)
    expect(setPairStatus(1, 2, null)).toBe(true)
    expect(listPairDecisions()).toEqual([])
    expect(db.select().from(interferencePairs).all()).toHaveLength(1)
    expect(db.select().from(interferencePairs).get()!.status).toBe('cleared')
  })
  it('rejects bad ids, reports missing cards and caps decisions', () => {
    lookalikes()
    expect(() => setPairStatus(1, 1, 'confirmed')).toThrow(InterferenceValidationError)
    expect(() => setPairStatus(0, 2, 'confirmed')).toThrow(InterferenceValidationError)
    expect(setPairStatus(1, 99, 'confirmed')).toBe(false)
    expect(setPairStatus(1, 99, null)).toBe(false)
    expect(INF_MAX_DECISIONS).toBe(2000)
  })
  it('refuses new decisions past the cap', () => {
    lookalikes()
    addCard(4, 'x', 'y')
    for (let i = 0; i < INF_MAX_DECISIONS; i += 400)
      db.insert(cards)
        .values(
          Array.from({ length: 400 }, (_, k) => ({
            id: 1000 + i + k,
            deckId: 1,
            type: 'basic' as const,
            content: { basic: { front: `f${i + k}`, back: 'b' } },
            due: NOW.toISOString(),
          })),
        )
        .run()
    db.insert(interferencePairs)
      .values(
        Array.from({ length: INF_MAX_DECISIONS }, (_, i) => ({
          cardAId: 1,
          cardBId: 1000 + i,
          status: 'confirmed' as const,
        })),
      )
      .run()
    expect(() => setPairStatus(3, 4, 'confirmed')).toThrow(InterferenceLimitError)
  })
})

describe('drills', () => {
  it('builds a drill for usable cards only', () => {
    lookalikes()
    expect(getPairDrill(2, 1)!.items.map((i) => i.cardId)).toEqual([1, 2, 2, 1])
    expect(getPairDrill(1, 99)).toBeNull()
  })
  it('adds answers to the day row, validates and caps', () => {
    lookalikes()
    expect(logPairDrill({ a: 1, b: 2, correct: 3, total: 4, now: NOW })).toEqual({
      day: '2026-11-20',
      correct: 3,
      total: 4,
    })
    expect(logPairDrill({ a: 2, b: 1, correct: 1, total: 4, now: NOW })).toEqual({
      day: '2026-11-20',
      correct: 4,
      total: 8,
    })
    expect(db.select().from(interferenceDrills).all()).toHaveLength(1)
    expect(() => logPairDrill({ a: 1, b: 2, correct: 5, total: 4, now: NOW })).toThrow(
      InterferenceValidationError,
    )
    expect(() => logPairDrill({ a: 1, b: 2, correct: 0, total: 51, now: NOW })).toThrow(
      InterferenceValidationError,
    )
    expect(logPairDrill({ a: 1, b: 99, correct: 1, total: 1, now: NOW })).toBeNull()
    for (let i = 0; i < Math.floor((INF_MAX_DRILL_PER_DAY - 8) / 50); i++)
      logPairDrill({ a: 1, b: 2, correct: 1, total: 50, now: NOW })
    expect(() => logPairDrill({ a: 1, b: 2, correct: 1, total: 50, now: NOW })).toThrow(
      InterferenceLimitError,
    )
  })
  it('summarises recent drill days per pair', () => {
    lookalikes()
    logPairDrill({ a: 1, b: 2, correct: 2, total: 4, now: NOW })
    logPairDrill({ a: 1, b: 2, correct: 4, total: 4, now: new Date(NOW.getTime() - 86_400_000) })
    logPairDrill({
      a: 1,
      b: 2,
      correct: 1,
      total: 1,
      now: new Date(NOW.getTime() - 90 * 86_400_000),
    })
    const s = listDrillSummaries(30, NOW)
    expect(s).toEqual([{ a: 1, b: 2, days: 2, correct: 6, total: 8, accuracy: 0.75 }])
  })
})

describe('separated session', () => {
  it('keeps lookalikes apart in a queue', () => {
    lookalikes()
    for (let i = 10; i < 16; i++) addCard(i, `Unrelated thing ${i * 13}`, `value ${i * 7}`)
    const out = planSeparatedSession([1, 2, 3, 10, 11, 12, 13], { now: NOW, gap: 3 })
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 10, 11, 12, 13])
    expect(Math.abs(out.indexOf(1) - out.indexOf(2))).toBeGreaterThanOrEqual(3)
  })
})

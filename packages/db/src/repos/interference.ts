/**
 * Interference and confusability: reads cards and recent reviews, runs the
 * pure audit in core, and stores the learner's pair decisions and drill
 * tallies. Cards, schedules and reviews are never written.
 */
import { and, asc, count, desc, eq, gte, inArray, ne, notInArray } from 'drizzle-orm'
import {
  INF_DEFAULTS,
  buildDrill,
  cardCueTarget,
  orderedPair,
  runInterferenceAudit,
  spreadPairs,
  summarizeInterference,
  type Drill,
  type InfAudit,
  type InfCard,
  type InfReport,
  type InfReview,
  type PairDecision,
} from '@learning-hub/core/interference'
import { getDb, type LearningHubDB } from '../index'
import { cards, interferenceDrills, interferencePairs, revlog, revlogUndos } from '../schema'
import type { Transaction } from '../transaction'

type Db = LearningHubDB | Transaction

/** Most stored pair decisions. */
export const INF_MAX_DECISIONS = 2000
/** Most drill day-rows. */
export const INF_MAX_DRILL_ROWS = 5000
/** Most drill answers logged for one pair on one day. */
export const INF_MAX_DRILL_PER_DAY = 200
/** Most reviews read for evidence (newest first). */
export const INF_MAX_REVIEWS = 100_000

/** 400 in the API. */
export class InterferenceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InterferenceValidationError'
  }
}
/** 409 in the API. */
export class InterferenceLimitError extends Error {
  constructor(what: string, max: number) {
    super(`Too many ${what} (limit ${max}).`)
    this.name = 'InterferenceLimitError'
  }
}

export interface InterferenceQuery {
  deckId?: number
  windowDays?: number
  now?: Date
}

export interface InterferenceRun {
  audit: InfAudit
  report: InfReport
}

/** Cards that can be compared: not suspended, with a usable cue and target. Ordered by id and cut at maxCards + 1 so the audit can say it truncated. */
export function loadInfCards(deckId?: number, database?: Db): InfCard[] {
  const db = database ?? getDb()
  const rows = db
    .select()
    .from(cards)
    .where(
      deckId === undefined
        ? eq(cards.suspended, false)
        : and(eq(cards.suspended, false), eq(cards.deckId, deckId)),
    )
    .orderBy(asc(cards.id))
    .limit(INF_DEFAULTS.maxCards + 1)
    .all()
  const out: InfCard[] = []
  for (const r of rows) {
    const ct = cardCueTarget(r.content)
    if (ct) out.push({ id: r.id, deckId: r.deckId, cue: ct.cue, target: ct.target })
  }
  return out
}

/** Reviews in the window with undone reviews removed (newest first, bounded). */
export function loadInfReviews(windowDays: number, now: Date, database?: Db): InfReview[] {
  const db = database ?? getDb()
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString()
  const undone = db.select({ id: revlogUndos.revlogId }).from(revlogUndos)
  return db
    .select({ cardId: revlog.cardId, rating: revlog.rating, reviewedAt: revlog.reviewedAt })
    .from(revlog)
    .where(and(gte(revlog.reviewedAt, since), notInArray(revlog.id, undone)))
    .orderBy(desc(revlog.id))
    .limit(INF_MAX_REVIEWS)
    .all()
}

export function listPairDecisions(database?: Db): PairDecision[] {
  const db = database ?? getDb()
  return db
    .select()
    .from(interferencePairs)
    .where(ne(interferencePairs.status, 'cleared'))
    .all()
    .map((r) => ({ a: r.cardAId, b: r.cardBId, status: r.status as 'confirmed' | 'dismissed' }))
}

/** Run the audit against the live database. Read-only. */
export function runInterferenceAuditDb(q: InterferenceQuery = {}, database?: Db): InterferenceRun {
  const now = q.now ?? new Date()
  const windowDays = q.windowDays ?? INF_DEFAULTS.windowDays
  const audit = runInterferenceAudit(
    loadInfCards(q.deckId, database),
    loadInfReviews(windowDays, now, database),
    { now, windowDays, decisions: listPairDecisions(database) },
  )
  return { audit, report: summarizeInterference(audit) }
}

function cardsExist(a: number, b: number, db: Db): boolean {
  return (
    db
      .select({ id: cards.id })
      .from(cards)
      .where(inArray(cards.id, [a, b]))
      .all().length === 2
  )
}

function checkPair(a: number, b: number): [number, number] {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0)
    throw new InterferenceValidationError('Card ids must be positive whole numbers.')
  if (a === b) throw new InterferenceValidationError('A pair needs two different cards.')
  return orderedPair(a, b)
}

/**
 * Record the learner's decision about a pair: 'confirmed', 'dismissed', or
 * null to clear it. Clearing keeps the row (status 'cleared') so it syncs.
 * Returns false when either card does not exist.
 */
export function setPairStatus(
  cardA: number,
  cardB: number,
  status: 'confirmed' | 'dismissed' | null,
  note?: string | null,
  now = new Date(),
  database?: Db,
): boolean {
  const db = database ?? getDb()
  const [a, b] = checkPair(cardA, cardB)
  const stamp = now.toISOString()
  const row = db
    .select()
    .from(interferencePairs)
    .where(and(eq(interferencePairs.cardAId, a), eq(interferencePairs.cardBId, b)))
    .get()
  if (!row) {
    if (status === null) return cardsExist(a, b, db)
    if (!cardsExist(a, b, db)) return false
    const total = db.select({ n: count() }).from(interferencePairs).get()?.n ?? 0
    if (total >= INF_MAX_DECISIONS)
      throw new InterferenceLimitError('pair decisions', INF_MAX_DECISIONS)
    db.insert(interferencePairs)
      .values({
        cardAId: a,
        cardBId: b,
        status,
        note: note?.slice(0, 200) ?? null,
        createdAt: stamp,
        updatedAt: stamp,
      })
      .run()
    return true
  }
  db.update(interferencePairs)
    .set({
      status: status ?? 'cleared',
      note: note === undefined ? row.note : (note?.slice(0, 200) ?? null),
      updatedAt: stamp,
    })
    .where(eq(interferencePairs.id, row.id))
    .run()
  return true
}

/** The discrimination drill for a pair, or null when a card is missing or has no usable cue and target. */
export function getPairDrill(cardA: number, cardB: number, database?: Db): Drill | null {
  const db = database ?? getDb()
  const [a, b] = checkPair(cardA, cardB)
  const rows = db
    .select()
    .from(cards)
    .where(inArray(cards.id, [a, b]))
    .all()
  const out: InfCard[] = []
  for (const r of rows) {
    const ct = cardCueTarget(r.content)
    if (ct) out.push({ id: r.id, deckId: r.deckId, cue: ct.cue, target: ct.target })
  }
  return out.length === 2 ? buildDrill(out[0] as InfCard, out[1] as InfCard) : null
}

export interface DrillLogInput {
  a: number
  b: number
  correct: number
  total: number
  now?: Date
}

/** Add drill answers to today's row for the pair. Returns the day's totals, or null when a card does not exist. */
export function logPairDrill(
  input: DrillLogInput,
  database?: Db,
): { day: string; correct: number; total: number } | null {
  const db = database ?? getDb()
  const [a, b] = checkPair(input.a, input.b)
  const { correct, total } = input
  if (!Number.isInteger(total) || total < 1 || total > 50)
    throw new InterferenceValidationError('Total must be a whole number from 1 to 50.')
  if (!Number.isInteger(correct) || correct < 0 || correct > total)
    throw new InterferenceValidationError('Correct must be a whole number from 0 to total.')
  if (!cardsExist(a, b, db)) return null
  const now = input.now ?? new Date()
  const stamp = now.toISOString()
  const day = stamp.slice(0, 10)
  const row = db
    .select()
    .from(interferenceDrills)
    .where(
      and(
        eq(interferenceDrills.cardAId, a),
        eq(interferenceDrills.cardBId, b),
        eq(interferenceDrills.day, day),
      ),
    )
    .get()
  if (row) {
    if (row.total + total > INF_MAX_DRILL_PER_DAY)
      throw new InterferenceLimitError('drill answers for one pair today', INF_MAX_DRILL_PER_DAY)
    db.update(interferenceDrills)
      .set({ correct: row.correct + correct, total: row.total + total, updatedAt: stamp })
      .where(eq(interferenceDrills.id, row.id))
      .run()
    return { day, correct: row.correct + correct, total: row.total + total }
  }
  const rows = db.select({ n: count() }).from(interferenceDrills).get()?.n ?? 0
  if (rows >= INF_MAX_DRILL_ROWS) throw new InterferenceLimitError('drill days', INF_MAX_DRILL_ROWS)
  db.insert(interferenceDrills)
    .values({ cardAId: a, cardBId: b, day, correct, total, createdAt: stamp, updatedAt: stamp })
    .run()
  return { day, correct, total }
}

export interface DrillSummary {
  a: number
  b: number
  days: number
  correct: number
  total: number
  /** correct / total over the stored days. */
  accuracy: number
}

/** Drill totals per pair over the last `days` days, most practised first. */
export function listDrillSummaries(days = 30, now = new Date(), database?: Db): DrillSummary[] {
  const db = database ?? getDb()
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
  const rows = db.select().from(interferenceDrills).where(gte(interferenceDrills.day, since)).all()
  const m = new Map<string, DrillSummary>()
  for (const r of rows) {
    const k = `${r.cardAId}:${r.cardBId}`
    const s = m.get(k) ?? { a: r.cardAId, b: r.cardBId, days: 0, correct: 0, total: 0, accuracy: 0 }
    s.days++
    s.correct += r.correct
    s.total += r.total
    s.accuracy = s.total ? Math.round((s.correct / s.total) * 1000) / 1000 : 0
    m.set(k, s)
  }
  return [...m.values()].sort((x, y) => y.total - x.total || x.a - y.a || x.b - y.b)
}

/**
 * Reorder a queue of card ids so flagged lookalikes are not reviewed close
 * together. Dismissed pairs and near-duplicates are ignored. Read-only.
 */
export function planSeparatedSession(
  queue: number[],
  q: InterferenceQuery & { gap?: number } = {},
  database?: Db,
): number[] {
  const { audit } = runInterferenceAuditDb(q, database)
  const pairs = audit.pairs
    .filter((p) => p.kind !== 'near-duplicate' && p.band !== 'low')
    .map((p) => [p.a, p.b] as [number, number])
  return spreadPairs(queue, pairs, Math.max(1, Math.min(20, q.gap ?? 5)))
}

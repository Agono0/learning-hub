/**
 * Retrieval-induced forgetting guard: reads cards and recent reviews, runs the
 * pure audit in core, and stores audit summaries and dismissals. Cards,
 * schedules and reviews are never written.
 */
import { and, count, desc, eq, gte, isNull, notInArray } from 'drizzle-orm'
import {
  RIF_DEFAULTS,
  cardCueTarget,
  expandSession,
  interleaveByCluster,
  rescueQueue,
  runAudit,
  summarizeAudit,
  type RescueItem,
  type RifAudit,
  type RifCard,
  type RifReport,
  type RifReview,
} from '@learning-hub/core/retrieval-forgetting'
import { getDb, type LearningHubDB } from '../index'
import { cards, revlog, revlogUndos, rifAudits, rifDismissals } from '../schema'
import type { Transaction } from '../transaction'

type Db = LearningHubDB | Transaction

export interface RifQuery {
  deckId?: number
  windowDays?: number
  now?: Date
}

export interface RifRun {
  audit: RifAudit
  report: RifReport
  rescue: RescueItem[]
}

/** Cards that can be audited: not suspended, with a usable cue and target. */
export function loadRifCards(deckId?: number, database?: Db): RifCard[] {
  const db = database ?? getDb()
  const rows = db
    .select()
    .from(cards)
    .where(
      deckId === undefined
        ? eq(cards.suspended, false)
        : and(eq(cards.suspended, false), eq(cards.deckId, deckId)),
    )
    .limit(RIF_DEFAULTS.maxCards + 1)
    .all()
  const out: RifCard[] = []
  for (const r of rows) {
    const ct = cardCueTarget(r.content)
    if (!ct) continue
    out.push({
      id: r.id,
      deckId: r.deckId,
      cue: ct.cue,
      target: ct.target,
      tags: r.tags ?? [],
      stability: r.stability,
      lastReview: r.lastReview,
      state: r.state,
    })
  }
  return out
}

/** Reviews in the window, with undone reviews removed. */
export function loadRifReviews(windowDays: number, now: Date, database?: Db): RifReview[] {
  const db = database ?? getDb()
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString()
  const undone = db.select({ id: revlogUndos.revlogId }).from(revlogUndos)
  return db
    .select({ cardId: revlog.cardId, rating: revlog.rating, reviewedAt: revlog.reviewedAt })
    .from(revlog)
    .where(and(gte(revlog.reviewedAt, since), notInArray(revlog.id, undone)))
    .all()
}

export function listRifDismissed(database?: Db): number[] {
  const db = database ?? getDb()
  return db
    .select({ cardId: rifDismissals.cardId })
    .from(rifDismissals)
    .all()
    .map((r) => r.cardId)
}

/** Run the audit against the live database. Read-only. */
export function runRifAudit(q: RifQuery = {}, database?: Db): RifRun {
  const now = q.now ?? new Date()
  const windowDays = q.windowDays ?? RIF_DEFAULTS.windowDays
  const cardRows = loadRifCards(q.deckId, database)
  const audit = runAudit(cardRows, loadRifReviews(windowDays, now, database), {
    now,
    windowDays,
    dismissed: new Set(listRifDismissed(database)),
  })
  return { audit, report: summarizeAudit(audit), rescue: rescueQueue(audit, { limit: 20 }) }
}

/** Store a summary of an audit (history for trend lines). Returns the stored row id. */
/** Most audit summaries kept. Rows sync between devices and are append-only, so the cap refuses new rows instead of pruning. */
export const RIF_MAX_AUDITS = 500
/** Most cards that can be dismissed. */
export const RIF_MAX_DISMISSED = 2000

/** Thrown when a history or dismissal cap is reached. */
export class RifLimitError extends Error {
  constructor(what: string, max: number) {
    super(`Too many ${what} (limit ${max}).`)
    this.name = 'RifLimitError'
  }
}

export function saveRifAudit(audit: RifAudit, deckId: number | null, database?: Db): number {
  const db = database ?? getDb()
  const same = db
    .select({ id: rifAudits.id })
    .from(rifAudits)
    .where(
      and(
        eq(rifAudits.createdAt, audit.asOf),
        deckId === null ? isNull(rifAudits.deckId) : eq(rifAudits.deckId, deckId),
      ),
    )
    .get()
  if (same) return same.id
  const total = db.select({ n: count() }).from(rifAudits).get()?.n ?? 0
  if (total >= RIF_MAX_AUDITS) throw new RifLimitError('saved audits', RIF_MAX_AUDITS)
  const top = audit.clusters
    .flatMap((c) => c.members)
    .filter((m) => !m.dismissed && m.band !== 'low')
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 10)
    .map((m) => ({ cardId: m.cardId, risk: m.risk, band: m.band }))
  const [row] = db
    .insert(rifAudits)
    .values({
      deckId,
      windowDays: audit.windowDays,
      scanned: audit.scanned,
      clustered: audit.clustered,
      atRisk: audit.atRisk,
      watch: audit.watch,
      meanRisk: audit.meanRisk,
      top,
      createdAt: audit.asOf,
    })
    .returning({ id: rifAudits.id })
    .all()
  return row!.id
}

export function listRifAudits(limit = 20, database?: Db) {
  const db = database ?? getDb()
  return db
    .select()
    .from(rifAudits)
    .orderBy(desc(rifAudits.createdAt), desc(rifAudits.id))
    .limit(Math.max(1, Math.min(200, limit)))
    .all()
}

/** Exclude a card from the guard. Idempotent. Returns false when the card does not exist. */
export function dismissRifCard(cardId: number, reason?: string, database?: Db): boolean {
  const db = database ?? getDb()
  const exists = db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).get()
  if (!exists) return false
  const already = db
    .select({ id: rifDismissals.id })
    .from(rifDismissals)
    .where(eq(rifDismissals.cardId, cardId))
    .get()
  if (already) return true
  const total = db.select({ n: count() }).from(rifDismissals).get()?.n ?? 0
  if (total >= RIF_MAX_DISMISSED) throw new RifLimitError('dismissed cards', RIF_MAX_DISMISSED)
  db.insert(rifDismissals)
    .values({ cardId, reason: reason?.slice(0, 200) ?? null })
    .onConflictDoNothing()
    .run()
  return true
}

/** Put a dismissed card back under the guard. Returns whether anything was removed. */
export function restoreRifCard(cardId: number, database?: Db): boolean {
  const db = database ?? getDb()
  return (
    db
      .delete(rifDismissals)
      .where(eq(rifDismissals.cardId, cardId))
      .returning({ id: rifDismissals.id })
      .all().length > 0
  )
}

/**
 * Add suppressed siblings to a list of due card ids and order the result so
 * competitors are not retrieved back to back.
 */
export function planBalancedSession(
  dueIds: number[],
  q: RifQuery & { budget?: number } = {},
  database?: Db,
): { ids: number[]; added: ReturnType<typeof expandSession>['added'] } {
  const { audit } = runRifAudit(q, database)
  const ex = expandSession(dueIds, audit, q.budget ?? 5)
  return { ids: interleaveByCluster(ex.ids, audit), added: ex.added }
}

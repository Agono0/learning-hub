/**
 * Retrieval-induced forgetting guard: reads cards and recent reviews, runs the
 * pure audit in core, and stores audit summaries and dismissals. Cards,
 * schedules and reviews are never written.
 */
import { and, asc, count, desc, eq, gte, isNull, lte, notInArray } from 'drizzle-orm'
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
    .orderBy(asc(cards.id))
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
    .where(eq(rifDismissals.active, true))
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
/** Most dismissed cards. */
export const RIF_MAX_DISMISSED = 2000
/** How many saved audits the API and page show. Older rows stay stored: the table is append-only and synced, so pruning would let another device bring them back. */
export const RIF_HISTORY_VISIBLE = 200

/** Thrown when the dismissal cap is reached. */
export class RifLimitError extends Error {
  constructor(what: string, max: number) {
    super(`Too many ${what} (limit ${max}).`)
    this.name = 'RifLimitError'
  }
}

/**
 * Store a summary of an audit (history for trend lines). At most one row per
 * deck per UTC hour is kept, so growth is bounded at 24 rows per deck per day
 * without ever deleting synced history. Returns the row id (the existing one
 * when this hour already has a summary).
 */
export function saveRifAudit(audit: RifAudit, deckId: number | null, database?: Db): number {
  const db = database ?? getDb()
  const hourStart = `${audit.asOf.slice(0, 13)}:00:00.000Z`
  const hourEnd = `${audit.asOf.slice(0, 13)}:59:59.999Z`
  const same = db
    .select({ id: rifAudits.id })
    .from(rifAudits)
    .where(
      and(
        gte(rifAudits.createdAt, hourStart),
        lte(rifAudits.createdAt, hourEnd),
        deckId === null ? isNull(rifAudits.deckId) : eq(rifAudits.deckId, deckId),
      ),
    )
    .get()
  if (same) return same.id
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

export function listRifAudits(limit = RIF_HISTORY_VISIBLE, database?: Db) {
  const db = database ?? getDb()
  return db
    .select()
    .from(rifAudits)
    .orderBy(desc(rifAudits.createdAt), desc(rifAudits.id))
    .limit(Math.max(1, Math.min(200, limit)))
    .all()
}

/** Exclude a card from the guard. Idempotent; reactivates a restored card. Returns false when the card does not exist. */
export function dismissRifCard(cardId: number, reason?: string, database?: Db): boolean {
  const db = database ?? getDb()
  const exists = db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).get()
  if (!exists) return false
  const row = db.select().from(rifDismissals).where(eq(rifDismissals.cardId, cardId)).get()
  if (row?.active) return true
  const now = new Date().toISOString()
  if (row) {
    db.update(rifDismissals)
      .set({ active: true, reason: reason?.slice(0, 200) ?? row.reason, updatedAt: now })
      .where(eq(rifDismissals.id, row.id))
      .run()
    return true
  }
  const total = db.select({ n: count() }).from(rifDismissals).get()?.n ?? 0
  if (total >= RIF_MAX_DISMISSED) throw new RifLimitError('dismissed cards', RIF_MAX_DISMISSED)
  db.insert(rifDismissals)
    .values({ cardId, reason: reason?.slice(0, 200) ?? null, createdAt: now, updatedAt: now })
    .run()
  return true
}

/**
 * Put a dismissed card back under the guard. The row is kept with active =
 * false and a newer updated_at, so on sync the restore beats the older
 * dismissal on other devices. Returns whether anything changed.
 */
export function restoreRifCard(cardId: number, database?: Db): boolean {
  const db = database ?? getDb()
  const rows = db
    .update(rifDismissals)
    .set({ active: false, updatedAt: new Date().toISOString() })
    .where(and(eq(rifDismissals.cardId, cardId), eq(rifDismissals.active, true)))
    .returning({ id: rifDismissals.id })
    .all()
  return rows.length > 0
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

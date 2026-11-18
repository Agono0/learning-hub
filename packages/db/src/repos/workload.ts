/**
 * Workload repository — the unsuspended-card workload projection and the
 * transactional due-date shifts that the forecast / balance / catch-up tools
 * on every host (MCP `workload_balance`, CLI `workload`) share.
 *
 * One definition, every host: the MCP tool and the CLI command previously
 * carried verbatim duplicates of the card select and of the two due-shift
 * transactions (`balanceWorkload` / `catchUpBacklog` outputs written row by
 * row). All shifting is `withTransaction` (Hard Rule #6).
 */
import { and, eq, inArray } from 'drizzle-orm'
import type { WorkloadCardItem } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards } from '../schema'
import { withTransaction } from '../transaction'

/**
 * The workload projection core's forecast/balance/catch-up engines consume:
 * unsuspended cards mapped to `WorkloadCardItem` (`intervalDays` =
 * `scheduledDays`, zeros where FSRS state is unset). No implicit cap — pass
 * `limit` to sample.
 */
export function workloadCards(
  opts: { deckId?: number; limit?: number; db?: LearningHubDB } = {},
): WorkloadCardItem[] {
  const db = opts.db ?? getDb()
  const conditions = [eq(cards.suspended, false)]
  if (opts.deckId !== undefined) conditions.push(eq(cards.deckId, opts.deckId))
  const rows = db
    .select({
      id: cards.id,
      due: cards.due,
      stability: cards.stability,
      scheduledDays: cards.scheduledDays,
      state: cards.state,
      lapses: cards.lapses,
    })
    .from(cards)
    .where(and(...conditions))
    .all()
  const items = rows.map((r) => ({
    id: r.id,
    due: r.due,
    stability: r.stability ?? 0,
    intervalDays: r.scheduledDays ?? 0,
    state: r.state ?? 0,
    lapses: r.lapses ?? 0,
  }))
  return opts.limit !== undefined ? items.slice(0, opts.limit) : items
}

/** One absolute due-date write: card `cardId` moves to `newDue` (ISO). */
export interface WorkloadShift {
  cardId: number
  newDue: string
}

/**
 * Write pre-computed due dates (core `balanceWorkload` / `catchUpBacklog`
 * outputs) in ONE transaction — the direct replacement for the per-host
 * `withTransaction` copies. Returns the number of cards updated.
 */
export function applyWorkloadShifts(
  shifts: WorkloadShift[],
  opts: { db?: LearningHubDB } = {},
): number {
  if (shifts.length === 0) return 0
  const db = opts.db ?? getDb()
  return withTransaction((tx) => {
    let applied = 0
    for (const shift of shifts) {
      tx.update(cards).set({ due: shift.newDue }).where(eq(cards.id, shift.cardId)).run()
      applied += 1
    }
    return applied
  }, db)
}

const DAY_MS = 86_400_000

/**
 * Shift the due dates of `cardIds` by `deltaDays` (positive = later) relative
 * to each card's CURRENT due date, preserving time-of-day, in one
 * transaction. Returns the number of cards updated. Unknown ids are skipped.
 */
export function shiftCardsDue(
  cardIds: number[],
  deltaDays: number,
  opts: { db?: LearningHubDB } = {},
): number {
  if (cardIds.length === 0 || deltaDays === 0) return 0
  const db = opts.db ?? getDb()
  return withTransaction((tx) => {
    const rows = tx
      .select({ id: cards.id, due: cards.due })
      .from(cards)
      .where(inArray(cards.id, cardIds))
      .all()
    for (const row of rows) {
      const next = new Date(Date.parse(row.due) + deltaDays * DAY_MS).toISOString()
      tx.update(cards).set({ due: next }).where(eq(cards.id, row.id)).run()
    }
    return rows.length
  }, db)
}

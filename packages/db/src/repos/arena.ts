/**
 * Review Arena run repository — the arena's persistent record.
 *
 * One row per settled session, keyed by the settlement idempotency key
 * (`referenceId`, shared with the coin ledger): a replayed settlement is a
 * no-op here exactly as it is a no-op for coin minting, so history and
 * economy can never disagree about whether a run happened.
 *
 * Stats are aggregates over those rows for the setup screen ("your record")
 * and future guardian tuning. They are computed from append-only history —
 * never stored as mutable counters that could drift from it.
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import { arenaRuns } from '../schema'
import { getDb, type LearningHubDB } from '../index'

export interface ArenaRunRecord {
  userId?: string
  deckIds: number[]
  result: 'victory' | 'defeat'
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  crits: number
  score: number
  coins: number
  xp: number
  durationMs: number
  referenceId: string
}

export type ArenaRunRow = typeof arenaRuns.$inferSelect

export interface ArenaStats {
  runs: number
  victories: number
  defeats: number
  winRate: number
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  bestScore: number
  totalCoins: number
  totalXp: number
  /** Consecutive victories, newest first. */
  winStreak: number
}

/**
 * Record a settled run. Idempotent: the unique `referenceId` makes a replay
 * a silent no-op (returns false) instead of a duplicate row.
 * @returns true when the row was inserted, false when it already existed.
 */
export function recordArenaRun(record: ArenaRunRecord, db: LearningHubDB = getDb()): boolean {
  const inserted = db
    .insert(arenaRuns)
    .values({
      userId: record.userId ?? 'default',
      deckIds: record.deckIds,
      result: record.result,
      rounds: record.rounds,
      correct: record.correct,
      accuracy: record.accuracy,
      bestCombo: record.bestCombo,
      crits: record.crits,
      score: record.score,
      coins: record.coins,
      xp: record.xp,
      durationMs: record.durationMs,
      referenceId: record.referenceId,
    })
    .onConflictDoNothing({ target: arenaRuns.referenceId })
    .returning({ id: arenaRuns.id })
    .all()
  return inserted.length > 0
}

/** Recent runs, newest first. */
export function listArenaRuns(
  opts: { userId?: string; limit?: number; db?: LearningHubDB } = {},
): ArenaRunRow[] {
  const db = opts.db ?? getDb()
  return db
    .select()
    .from(arenaRuns)
    .where(eq(arenaRuns.userId, opts.userId ?? 'default'))
    .orderBy(desc(arenaRuns.id))
    .limit(Math.min(opts.limit ?? 20, 100))
    .all()
}

/**
 * Aggregate record for the setup screen. Win streak walks newest-first rows
 * and stops at the first defeat; everything else is one SQL aggregate.
 */
export function getArenaStats(opts: { userId?: string; db?: LearningHubDB } = {}): ArenaStats {
  const db = opts.db ?? getDb()
  const userId = opts.userId ?? 'default'

  const [agg] = db
    .select({
      runs: sql<number>`count(*)`,
      victories: sql<number>`sum(case when ${arenaRuns.result} = 'victory' then 1 else 0 end)`,
      rounds: sql<number>`coalesce(sum(${arenaRuns.rounds}), 0)`,
      correct: sql<number>`coalesce(sum(${arenaRuns.correct}), 0)`,
      bestCombo: sql<number>`coalesce(max(${arenaRuns.bestCombo}), 0)`,
      bestScore: sql<number>`coalesce(max(${arenaRuns.score}), 0)`,
      totalCoins: sql<number>`coalesce(sum(${arenaRuns.coins}), 0)`,
      totalXp: sql<number>`coalesce(sum(${arenaRuns.xp}), 0)`,
    })
    .from(arenaRuns)
    .where(eq(arenaRuns.userId, userId))
    .all()

  const runs = Number(agg?.runs ?? 0)
  const victories = Number(agg?.victories ?? 0)
  const rounds = Number(agg?.rounds ?? 0)
  const correct = Number(agg?.correct ?? 0)

  let winStreak = 0
  if (runs > 0) {
    const recent = db
      .select({ result: arenaRuns.result })
      .from(arenaRuns)
      .where(eq(arenaRuns.userId, userId))
      .orderBy(desc(arenaRuns.id))
      .limit(50)
      .all()
    for (const row of recent) {
      if (row.result !== 'victory') break
      winStreak++
    }
  }

  return {
    runs,
    victories,
    defeats: runs - victories,
    winRate: runs === 0 ? 0 : victories / runs,
    rounds,
    correct,
    accuracy: rounds === 0 ? 0 : correct / rounds,
    bestCombo: Number(agg?.bestCombo ?? 0),
    bestScore: Number(agg?.bestScore ?? 0),
    totalCoins: Number(agg?.totalCoins ?? 0),
    totalXp: Number(agg?.totalXp ?? 0),
    winStreak,
  }
}

/** Look up a run by its settlement key (settlement dedupe + tests). */
export function getArenaRunByReference(
  referenceId: string,
  db: LearningHubDB = getDb(),
): ArenaRunRow | undefined {
  return db
    .select()
    .from(arenaRuns)
    .where(and(eq(arenaRuns.referenceId, referenceId)))
    .limit(1)
    .all()[0]
}

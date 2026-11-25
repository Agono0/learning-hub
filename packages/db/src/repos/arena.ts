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
import { arenaRuns, arenaSessions } from '../schema'
import { getDb, type LearningHubDB } from '../index'
import { withTransaction, type Transaction } from '../transaction'

export interface ArenaRunRecord {
  userId?: string
  deckIds: number[]
  result: 'victory' | 'defeat'
  archetype?: 'warden' | 'colossus' | 'shade'
  boss?: boolean
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

/** Per-deck record: a run counts toward every deck it drew cards from. */
export interface ArenaDeckStats {
  deckId: number
  runs: number
  victories: number
  winRate: number
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  bestScore: number
}

/**
 * Aggregate the record book per deck. A multi-deck run counts toward each
 * deck it touched, so deck totals can sum above the global run count —
 * this answers "how do I do with THIS deck", not "partition the history".
 * Computed from the append-only run rows (bounded read: latest 500 runs),
 * never from mutable counters.
 */
export function getArenaStatsByDeck(
  opts: { userId?: string; db?: LearningHubDB } = {},
): ArenaDeckStats[] {
  const db = opts.db ?? getDb()
  const rows = db
    .select({
      deckIds: arenaRuns.deckIds,
      result: arenaRuns.result,
      rounds: arenaRuns.rounds,
      correct: arenaRuns.correct,
      bestCombo: arenaRuns.bestCombo,
      score: arenaRuns.score,
    })
    .from(arenaRuns)
    .where(eq(arenaRuns.userId, opts.userId ?? 'default'))
    .orderBy(desc(arenaRuns.id))
    .limit(500)
    .all()

  const byDeck = new Map<number, ArenaDeckStats>()
  for (const row of rows) {
    const deckIds = [...new Set(row.deckIds as number[])]
    for (const deckId of deckIds) {
      const agg = byDeck.get(deckId) ?? {
        deckId,
        runs: 0,
        victories: 0,
        winRate: 0,
        rounds: 0,
        correct: 0,
        accuracy: 0,
        bestCombo: 0,
        bestScore: 0,
      }
      agg.runs += 1
      if (row.result === 'victory') agg.victories += 1
      agg.rounds += row.rounds
      agg.correct += row.correct
      agg.bestCombo = Math.max(agg.bestCombo, row.bestCombo)
      agg.bestScore = Math.max(agg.bestScore, row.score)
      byDeck.set(deckId, agg)
    }
  }
  const out = [...byDeck.values()]
  for (const agg of out) {
    agg.winRate = agg.runs === 0 ? 0 : agg.victories / agg.runs
    agg.accuracy = agg.rounds === 0 ? 0 : agg.correct / agg.rounds
  }
  // Most-played decks first — the record book leads with what matters.
  out.sort((a, b) => b.runs - a.runs || b.winRate - a.winRate || a.deckId - b.deckId)
  return out
}

/** Per-guardian record for the bestiary: how you fare against each archetype. */
export interface ArenaGuardianStats {
  archetype: string
  runs: number
  victories: number
  winRate: number
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  bestScore: number
  bossWins: number
}

/**
 * Aggregate the record book per guardian archetype. One SQL group-by over
 * the append-only run rows — never mutable counters.
 */
export function getArenaStatsByGuardian(
  opts: { userId?: string; db?: LearningHubDB } = {},
): ArenaGuardianStats[] {
  const db = opts.db ?? getDb()
  const rows = db
    .select({
      archetype: arenaRuns.archetype,
      runs: sql<number>`count(*)`,
      victories: sql<number>`sum(case when ${arenaRuns.result} = 'victory' then 1 else 0 end)`,
      rounds: sql<number>`coalesce(sum(${arenaRuns.rounds}), 0)`,
      correct: sql<number>`coalesce(sum(${arenaRuns.correct}), 0)`,
      bestCombo: sql<number>`coalesce(max(${arenaRuns.bestCombo}), 0)`,
      bestScore: sql<number>`coalesce(max(${arenaRuns.score}), 0)`,
      bossWins: sql<number>`sum(case when ${arenaRuns.result} = 'victory' and ${arenaRuns.boss} = true then 1 else 0 end)`,
    })
    .from(arenaRuns)
    .where(eq(arenaRuns.userId, opts.userId ?? 'default'))
    .groupBy(arenaRuns.archetype)
    .all()
  return rows.map((r) => {
    const runs = Number(r.runs ?? 0)
    const victories = Number(r.victories ?? 0)
    const rounds = Number(r.rounds ?? 0)
    return {
      archetype: r.archetype,
      runs,
      victories,
      winRate: runs === 0 ? 0 : victories / runs,
      rounds,
      correct: Number(r.correct ?? 0),
      accuracy: rounds === 0 ? 0 : Number(r.correct ?? 0) / rounds,
      bestCombo: Number(r.bestCombo ?? 0),
      bestScore: Number(r.bestScore ?? 0),
      bossWins: Number(r.bossWins ?? 0),
    }
  })
}

/**
 * Record a settled run. Idempotent: the unique `referenceId` makes a replay
 * a silent no-op (returns false) instead of a duplicate row.
 * @returns true when the row was inserted, false when it already existed.
 */
export function recordArenaRun(
  record: ArenaRunRecord,
  db: LearningHubDB | Transaction = getDb(),
): boolean {
  const inserted = db
    .insert(arenaRuns)
    .values({
      userId: record.userId ?? 'default',
      deckIds: record.deckIds,
      result: record.result,
      archetype: record.archetype ?? 'warden',
      boss: record.boss ?? false,
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

// ─── Session lifecycle (server-issued run identity) ─────────────────────────

/**
 * How long a 'settling' claim may linger before a retry may reclaim it. A
 * crash between the claim and the commit would otherwise wedge the run
 * forever. Two minutes is far beyond any real settle time (one SQLite tx).
 * Reclaim is safe because of the settleAttempt fencing token: the stale
 * claimant's commit matches zero rows and its whole transaction rolls back.
 */
export const ARENA_SETTLING_TTL_MS = 120_000

export type ArenaSessionStatus = 'open' | 'settling' | 'settled'

export type ArenaSessionRow = typeof arenaSessions.$inferSelect

/** Issue a run: the exact queue the server dealt, bound to a fresh id and owner. */
export function createArenaSession(
  input: {
    userId?: string
    deckIds: number[]
    cardIds: number[]
    archetype: string
    boss: boolean
    modifier?: string | null
    drillOfRunId?: string | null
  },
  db: LearningHubDB = getDb(),
): ArenaSessionRow {
  const id = crypto.randomUUID()
  const [row] = db
    .insert(arenaSessions)
    .values({
      id,
      userId: input.userId ?? 'default',
      deckIds: input.deckIds,
      cardIds: input.cardIds,
      archetype: input.archetype,
      boss: input.boss,
      modifier: input.modifier ?? null,
      drillOfRunId: input.drillOfRunId ?? null,
      status: 'open',
    })
    .returning()
    .all()
  return row!
}

export function getArenaSession(
  id: string,
  db: LearningHubDB | Transaction = getDb(),
): ArenaSessionRow | undefined {
  return db.select().from(arenaSessions).where(eq(arenaSessions.id, id)).limit(1).all()[0]
}

export type ClaimOutcome =
  | { kind: 'claimed'; run: ArenaSessionRow; attempt: number }
  | { kind: 'in_progress' }
  | { kind: 'settled'; run: ArenaSessionRow }
  | { kind: 'missing' }

/**
 * Atomically claim the right to settle a run (open → settling, or reclaim a
 * stale settling), incrementing the settleAttempt fencing token. Runs inside
 * an IMMEDIATE transaction, so concurrent claimants serialize and exactly
 * one wins. Owner-scoped: a run belonging to another userId reports
 * 'missing' — possession of the UUID alone is not authorization.
 */
export function claimArenaSettlement(
  runId: string,
  opts: {
    userId?: string
    now?: Date
    settlingTtlMs?: number
    db?: LearningHubDB
  } = {},
): ClaimOutcome {
  const db = opts.db ?? getDb()
  const userId = opts.userId ?? 'default'
  const now = opts.now ?? new Date()
  const ttl = opts.settlingTtlMs ?? ARENA_SETTLING_TTL_MS

  return withTransaction((tx) => {
    const run = tx.select().from(arenaSessions).where(eq(arenaSessions.id, runId)).get()
    if (!run || run.userId !== userId) return { kind: 'missing' } as const
    if (run.status === 'settled') return { kind: 'settled', run } as const
    if (run.status === 'settling') {
      const startedAt = run.settlingStartedAt ? Date.parse(run.settlingStartedAt) : 0
      const stale = now.getTime() - startedAt > ttl
      if (!stale) return { kind: 'in_progress' } as const
      // Stale claim (crashed settler): reclaim below with a fresh token.
    }
    const attempt = run.settleAttempt + 1
    const [updated] = tx
      .update(arenaSessions)
      .set({
        status: 'settling',
        settlingStartedAt: now.toISOString(),
        settleAttempt: attempt,
      })
      .where(eq(arenaSessions.id, runId))
      .returning()
      .all()
    return { kind: 'claimed', run: updated!, attempt } as const
  }, db)
}

/** Thrown when a fenced settlement commit loses the run to a newer claim. */
export class ArenaSettlementFencedError extends Error {
  constructor(runId: string) {
    super(`Arena settlement claim lost for run ${runId}`)
    this.name = 'ArenaSettlementFencedError'
  }
}

/**
 * Mark a claimed run settled — with the normalized accepted grade log and
 * the exact response the client received — inside the caller's settlement
 * transaction. The conditional update enforces the fencing token: if a
 * newer claim owns the run, zero rows match, we throw, and the caller's
 * transaction (reviews, coins, run record) rolls back with it.
 */
export function completeArenaSettlementInTx(
  tx: Transaction,
  runId: string,
  attempt: number,
  gradeLog: unknown[],
  settlement: Record<string, unknown>,
): void {
  const res = tx
    .update(arenaSessions)
    .set({
      status: 'settled',
      gradeLog,
      settlementJson: settlement,
      settledAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(arenaSessions.id, runId),
        eq(arenaSessions.status, 'settling'),
        eq(arenaSessions.settleAttempt, attempt),
      ),
    )
    .run()
  if (res.changes === 0) {
    throw new ArenaSettlementFencedError(runId)
  }
}

/**
 * Abandon a claim without settling (post-claim validation failed). Fenced:
 * only reopens while THIS attempt still owns the claim, so a stale
 * claimant's release can never clobber the run's new owner.
 */
export function releaseArenaClaim(
  runId: string,
  attempt: number,
  db: LearningHubDB = getDb(),
): void {
  db.update(arenaSessions)
    .set({ status: 'open', settlingStartedAt: null })
    .where(
      and(
        eq(arenaSessions.id, runId),
        eq(arenaSessions.status, 'settling'),
        eq(arenaSessions.settleAttempt, attempt),
      ),
    )
    .run()
}

/** One arena run row by id (record book detail). */
export function getArenaRun(
  id: number,
  db: LearningHubDB = getDb(),
): typeof arenaRuns.$inferSelect | undefined {
  return db.select().from(arenaRuns).where(eq(arenaRuns.id, id)).limit(1).all()[0]
}

/** Card ids graded Again (1) or Hard (2) in a settled run — the drill pool. */
export function getWeakCardIdsForRun(
  runId: string,
  opts: { userId?: string; db?: LearningHubDB } = {},
): number[] | undefined {
  const db = opts.db ?? getDb()
  const run = getArenaSession(runId, db)
  if (!run || run.userId !== (opts.userId ?? 'default') || run.status !== 'settled') {
    return undefined
  }
  const log = (run.gradeLog ?? []) as Array<{ cardId?: unknown; grade?: unknown }>
  const weak = new Set<number>()
  for (const e of log) {
    if (typeof e.cardId === 'number' && typeof e.grade === 'number' && e.grade <= 2) {
      weak.add(e.cardId)
    }
  }
  return [...weak]
}

/**
 * Accepted grade logs of settled sessions, oldest first — the input to the
 * per-card nemesis analysis. Only the server-normalized log persisted at
 * settlement is read (never client-supplied fields), and only `settled`
 * sessions count, so open or half-claimed runs can never skew insights.
 */
export function listSettledGradeLogs(
  opts: { userId?: string; limit?: number; db?: LearningHubDB } = {},
): Array<Array<{ cardId: number; grade: number; confidence: number; timeMs: number }>> {
  const db = opts.db ?? getDb()
  const rows = db
    .select({ gradeLog: arenaSessions.gradeLog })
    .from(arenaSessions)
    .where(
      and(eq(arenaSessions.userId, opts.userId ?? 'default'), eq(arenaSessions.status, 'settled')),
    )
    .orderBy(desc(arenaSessions.settledAt))
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500))
    .all()
    .reverse()
  const logs: Array<Array<{ cardId: number; grade: number; confidence: number; timeMs: number }>> =
    []
  for (const r of rows) {
    const entries: Array<{ cardId: number; grade: number; confidence: number; timeMs: number }> = []
    for (const e of (r.gradeLog ?? []) as Array<Record<string, unknown>>) {
      if (
        typeof e.cardId === 'number' &&
        typeof e.grade === 'number' &&
        typeof e.confidence === 'number' &&
        typeof e.timeMs === 'number'
      ) {
        entries.push({
          cardId: e.cardId,
          grade: e.grade,
          confidence: e.confidence,
          timeMs: e.timeMs,
        })
      }
    }
    if (entries.length > 0) logs.push(entries)
  }
  return logs
}

/**
 * Learning-stats repository — the read-only "due / today / retention /
 * forecast / decks" aggregations shared by every host (web handlers, the
 * headless server, MCP tools, CLI commands).
 *
 * One definition, every host: these queries were previously re-implemented
 * per host (due-count ×5, today-tallies ×4, retention+forecast ×4, deck
 * listing ×2 with already-diverged response shapes — see
 * docs/tech-debt.md TD-01). This module is the single address for them; the
 * `NOT EXISTS revlog_undos` exclusion inside the tallies is THE undo
 * semantics (ADR 0004) — never hand-write that clause again.
 */
import { and, asc, eq, lte, sql } from 'drizzle-orm'
import { dayKey, forecastNext30Days } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards, decks, streaks, xpEvents } from '../schema'

/** Options every function here accepts (tests may inject a database handle). */
export interface StatsQueryOptions {
  /** Instant the "now"-relative queries evaluate at. */
  now?: Date
  /** Override the database handle (tests). */
  database?: LearningHubDB
}

/** Count of unsuspended cards due at `now` (the due-queue size). */
export function getDueCardCount(options: StatsQueryOptions = {}): number {
  const db = options.database ?? getDb()
  const now = (options.now ?? new Date()).toISOString()
  const [row] = db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, now), eq(cards.suspended, false)))
    .all()
  return Number(row?.count ?? 0)
}

/** Count of unsuspended cards that have never been studied (state = 0). */
export function getNewCardCount(options: StatsQueryOptions = {}): number {
  const db = options.database ?? getDb()
  const [row] = db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .where(and(eq(cards.state, 0), eq(cards.suspended, false)))
    .all()
  return Number(row?.count ?? 0)
}

/** Today's review tallies (UTC day bucket), undone reviews excluded. */
export interface TodayReviewTallies {
  /** Day key the tallies are bucketed to (`YYYY-MM-DD`, UTC). */
  day: string
  reviews: number
  correct: number
  avgTimeMs: number | null
}

/** Reviews committed today (rating > 1 counts as correct), undone excluded. */
export function getTodayReviewTallies(options: StatsQueryOptions = {}): TodayReviewTallies {
  const db = options.database ?? getDb()
  const now = options.now ?? new Date()
  const day = dayKey(now)
  const [row] = db.all<{
    reviews: number
    correct: number
    avg_time_ms: number | null
  }>(sql`
    SELECT count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog
    WHERE substr(reviewed_at, 1, 10) = ${day}
      AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
  `)
  return {
    day,
    reviews: Number(row?.reviews ?? 0),
    correct: Number(row?.correct ?? 0),
    avgTimeMs: row?.avg_time_ms ?? null,
  }
}

/** True retention row from the `v_true_retention` view over the append-only revlog. */
export interface TrueRetention {
  total: number
  retained: number
  retention_pct: number | null
}

/** True retention (never an editable number — computed by SQL over revlog). */
export function getTrueRetention(options: StatsQueryOptions = {}): TrueRetention {
  const db = options.database ?? getDb()
  const rows = db.all<{ total: number; retained: number; retention_pct: number }>(
    sql`SELECT total, retained, retention_pct FROM v_true_retention`,
  )
  return rows[0] ?? { total: 0, retained: 0, retention_pct: null }
}

/** The 30-day due forecast (`forecastNext30Days` over unsuspended card due dates). */
export function getDueForecast(
  options: StatsQueryOptions = {},
): ReturnType<typeof forecastNext30Days> {
  const db = options.database ?? getDb()
  const dueRows = db
    .select({ due: cards.due, suspended: cards.suspended })
    .from(cards)
    .limit(5000)
    .all()
  return forecastNext30Days(dueRows.filter((r) => !r.suspended).map((r) => ({ due: r.due })))
}

/** The single streak row, or null before the first review. */
export function getStreakRow(options: StatsQueryOptions = {}): typeof streaks.$inferSelect | null {
  const db = options.database ?? getDb()
  return db.select().from(streaks).limit(1).all()[0] ?? null
}

/** One day of the review series (from the `v_daily_reviews` view). */
export interface DailyReviewsPoint {
  /** Day key (`YYYY-MM-DD`, UTC). */
  day: string
  reviews: number
  correct: number
  avgTimeMs: number | null
}

/**
 * The last `days` days of the `v_daily_reviews` series, ascending (oldest
 * first). The view already excludes undone reviews (`revlog_undos`), so an
 * erased review never counts. One definition, every host: the CLI stats panel
 * previously queried the view inline.
 */
export function dailyReviewsSeries(
  options: StatsQueryOptions & { days?: number } = {},
): DailyReviewsPoint[] {
  const db = options.database ?? getDb()
  const days = Math.max(1, options.days ?? 7)
  const rows = db.all<{
    day: string
    reviews: number
    correct: number
    avg_time_ms: number | null
  }>(
    sql`SELECT day, reviews, correct, avg_time_ms FROM v_daily_reviews ORDER BY day DESC LIMIT ${days}`,
  )
  return rows.reverse().map((r) => ({
    day: r.day,
    reviews: Number(r.reviews),
    correct: Number(r.correct),
    avgTimeMs: r.avg_time_ms ?? null,
  }))
}

/** XP totals: lifetime sum and today's sum (UTC day bucket). */
export interface XpTotals {
  total: number
  today: number
}

export function getXpTotals(options: StatsQueryOptions = {}): XpTotals {
  const db = options.database ?? getDb()
  const now = options.now ?? new Date()
  const todayStart = `${dayKey(now)}T00:00:00.000Z`
  const [totalRow] = db
    .select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(xpEvents)
    .all()
  const [todayRow] = db
    .select({ today: sql<number>`coalesce(sum(amount), 0)` })
    .from(xpEvents)
    .where(sql`${xpEvents.createdAt} >= ${todayStart}`)
    .all()
  return { total: Number(totalRow?.total ?? 0), today: Number(todayRow?.today ?? 0) }
}

/** One deck row with card counts — the superset both hosts project from. */
export type DeckSummary = typeof decks.$inferSelect & {
  total: number
  due: number
  newCards: number
  /** true when the deck carries a full 21-parameter FSRS-6 weight vector. */
  hasCustomWeights: boolean
}

/** Decks with card/due/new counts (one aggregate query, ordered by name). */
export function getDeckSummaries(options: StatsQueryOptions = {}): DeckSummary[] {
  const db = options.database ?? getDb()
  const now = (options.now ?? new Date()).toISOString()
  const rows = db
    .select({
      id: decks.id,
      name: decks.name,
      description: decks.description,
      emoji: decks.emoji,
      desiredRetention: decks.desiredRetention,
      delayedFeedback: decks.delayedFeedback,
      fsrsWeights: decks.fsrsWeights,
      createdAt: decks.createdAt,
      total: sql<number>`count(${cards.id})`,
      due: sql<number>`sum(CASE WHEN ${cards.due} <= ${now} AND ${cards.suspended} = 0 THEN 1 ELSE 0 END)`,
      newCards: sql<number>`sum(CASE WHEN ${cards.state} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(decks)
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .groupBy(decks.id)
    .orderBy(asc(decks.name))
    .all()
  return rows.map((r) => ({
    ...r,
    total: Number(r.total ?? 0),
    due: Number(r.due ?? 0),
    newCards: Number(r.newCards ?? 0),
    hasCustomWeights: Array.isArray(r.fsrsWeights) && r.fsrsWeights.length === 21,
  }))
}

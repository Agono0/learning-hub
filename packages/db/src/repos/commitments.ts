/**
 * Commitments repository — precommitment contracts and honest accountability tracking.
 *
 * Implements precommitment devices (Ariely & Wertenbroch 2002; Bryan et al. 2010).
 */
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { dayKey } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { commitments, focusSessions, lessons } from '../schema'

export type CommitmentRow = typeof commitments.$inferSelect

export const COMMITMENT_METRICS = ['reviews', 'focus_minutes', 'lessons'] as const
export type CommitmentMetric = (typeof COMMITMENT_METRICS)[number]

export interface CreateCommitmentInput {
  title: string
  metric: CommitmentMetric
  threshold: number
  stakes?: string | null
  endsAt?: string | null
}

export interface PatchCommitmentInput {
  title?: string
  metric?: CommitmentMetric
  threshold?: number
  stakes?: string | null
  status?: 'active' | 'kept' | 'broken' | 'cancelled'
  endsAt?: string | null
}

export interface CommitmentReportItem {
  commitment: CommitmentRow
  week: { start: string; end: string }
  value: number
  threshold: number
  met: boolean
  note: string | null
}

function mondayOf(date: Date, tzOffsetMinutes = 0): string {
  const key = dayKey(date, tzOffsetMinutes)
  const d = new Date(key + 'T00:00:00Z')
  const shift = (d.getUTCDay() + 6) % 7
  return dayKey(new Date(d.getTime() - shift * 86_400_000))
}

function localWeekRange(
  weekStart: string,
  weekEnd: string,
  tzOffsetMinutes: number,
): { start: string; end: string } {
  const startMs = Date.parse(weekStart + 'T00:00:00Z') + tzOffsetMinutes * 60_000
  const endMs = Date.parse(weekEnd + 'T00:00:00Z') + tzOffsetMinutes * 60_000 + 86_400_000
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() }
}

/**
 * Computes weekly metric value directly from active database rows.
 */
export function weeklyMetricValue(
  metric: CommitmentMetric,
  weekStart: string,
  weekEnd: string,
  tz: number,
  db: LearningHubDB,
): number {
  if (metric === 'reviews') {
    const rows = db.all<{ total: number }>(
      sql`SELECT coalesce(sum(reviews), 0) AS total FROM v_daily_reviews WHERE day BETWEEN ${weekStart} AND ${weekEnd}`,
    )
    return rows[0]?.total ?? 0
  }

  const { start, end } = localWeekRange(weekStart, weekEnd, tz)

  if (metric === 'focus_minutes') {
    const [row] = db
      .select({ minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` })
      .from(focusSessions)
      .where(
        and(
          gte(focusSessions.startedAt, start),
          lt(focusSessions.startedAt, end),
          eq(focusSessions.completed, true),
        ),
      )
      .all()
    return row?.minutes ?? 0
  }

  const [row] = db
    .select({ n: sql<number>`count(*)` })
    .from(lessons)
    .where(and(gte(lessons.completedAt, start), lt(lessons.completedAt, end)))
    .all()
  return row?.n ?? 0
}

/**
 * List commitments with active weekly tracking progress reports.
 */
export function listCommitments(
  opts: {
    tzOffset?: number
    now?: Date
    db?: LearningHubDB
  } = {},
): {
  commitments: CommitmentRow[]
  report: CommitmentReportItem[]
  week: { start: string; end: string }
} {
  const db = opts.db ?? getDb()
  const tz = opts.tzOffset ?? 0
  const nowDate = opts.now ?? new Date()
  const rows = db.select().from(commitments).orderBy(desc(commitments.startedAt)).all()
  const weekStart = mondayOf(nowDate, tz)
  const weekEnd = dayKey(new Date(Date.parse(weekStart + 'T00:00:00Z') + 6 * 86_400_000))

  const report = rows
    .filter((c) => c.status === 'active')
    .map((c) => {
      const isKnownMetric = (COMMITMENT_METRICS as readonly string[]).includes(c.metric)
      const metric = isKnownMetric ? (c.metric as CommitmentMetric) : null
      const value = metric ? weeklyMetricValue(metric, weekStart, weekEnd, tz, db) : 0
      return {
        commitment: c,
        week: { start: weekStart, end: weekEnd },
        value,
        threshold: c.threshold,
        met: value >= c.threshold,
        note: metric ? null : `Unknown metric "${c.metric}" — treat manually`,
      }
    })

  return { commitments: rows, report, week: { start: weekStart, end: weekEnd } }
}

/**
 * Create a new commitment contract.
 */
export function createCommitment(
  input: CreateCommitmentInput,
  opts: { db?: LearningHubDB } = {},
): CommitmentRow {
  const db = opts.db ?? getDb()
  const [row] = db
    .insert(commitments)
    .values({
      title: input.title,
      metric: input.metric,
      threshold: input.threshold,
      stakes: input.stakes?.trim() || null,
      endsAt: input.endsAt?.trim() || null,
    })
    .returning()
    .all()

  return row!
}

/**
 * Update an existing commitment contract.
 */
export function updateCommitment(
  id: number,
  input: PatchCommitmentInput,
  opts: { db?: LearningHubDB } = {},
): CommitmentRow | null {
  const db = opts.db ?? getDb()
  const [existing] = db.select().from(commitments).where(eq(commitments.id, id)).limit(1).all()
  if (!existing) return null

  const [row] = db
    .update(commitments)
    .set({
      title: input.title !== undefined ? input.title.trim() || existing.title : existing.title,
      metric: input.metric ?? existing.metric,
      threshold: input.threshold ?? existing.threshold,
      stakes: input.stakes !== undefined ? input.stakes?.trim() || null : existing.stakes,
      status: input.status ?? existing.status,
      endsAt: input.endsAt !== undefined ? input.endsAt?.trim() || null : existing.endsAt,
    })
    .where(eq(commitments.id, id))
    .returning()
    .all()

  return row ?? null
}

/**
 * Delete a commitment by id.
 */
export function deleteCommitment(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(commitments).where(eq(commitments.id, id)).run()
  return res.changes > 0
}

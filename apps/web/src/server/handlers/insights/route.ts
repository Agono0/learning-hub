/**
 * GET /api/insights — cross-metric learning correlations over the last 60 days:
 * sleep, exercise, mood and focus joined against daily review outcomes. All
 * rows already exist (physio_log, journal_entries, focus_sessions,
 * v_daily_reviews); this handler only aligns them by day and hands the pure
 * math to packages/core/src/insights.ts.
 */
import { sql } from 'drizzle-orm'
import { computeLearningInsights, dayKey, type DailyMetric } from '@learning-hub/core'
import { db } from '@/lib/db'
import { withRoute } from '@/lib/api'

const WINDOW_DAYS = 60

export const GET = withRoute(async () => {
  const today = new Date()
  const from = new Date(today.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const fromDate = dayKey(from)

  const physio = db.all<{
    date: string
    sleepHours: number | null
    sleepQuality: number | null
    exerciseMinutes: number | null
  }>(
    sql`SELECT date, sleep_hours AS sleepHours, sleep_quality AS sleepQuality, exercise_minutes AS exerciseMinutes
        FROM physio_log WHERE date >= ${fromDate} ORDER BY date`,
  )

  const moods = db.all<{ date: string; mood: number | null }>(
    sql`SELECT date, mood FROM journal_entries WHERE date >= ${fromDate} AND mood IS NOT NULL ORDER BY date`,
  )

  const focus = db.all<{ day: string; minutes: number }>(
    sql`SELECT substr(started_at, 1, 10) AS day, sum(coalesce(actual_minutes, planned_minutes)) AS minutes
        FROM focus_sessions WHERE started_at >= ${fromDate} GROUP BY day`,
  )

  const reviews = db.all<{ day: string; reviews: number; correct: number }>(
    sql`SELECT day, reviews, correct FROM v_daily_reviews WHERE day >= ${fromDate}`,
  )

  // Build continuous date axes (null where nothing logged — the math pairs
  // only days where BOTH sides exist).
  const dates: string[] = []
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    dates.push(dayKey(new Date(today.getTime() - i * 24 * 60 * 60 * 1000)))
  }
  const byDate =
    <T extends { date: string }>(rows: T[]) =>
    (pick: (r: T) => number | null): Map<string, number | null> =>
      new Map(rows.map((r) => [r.date, pick(r)]))

  const physioMap = new Map(physio.map((r) => [r.date, r]))
  const moodMap = byDate(moods)((r) => r.mood)
  const focusMap = new Map(focus.map((r) => [r.day, r.minutes]))
  const reviewMap = new Map(reviews.map((r) => [r.day, r]))

  const series = (pick: (date: string) => number | null): DailyMetric[] =>
    dates.map((date) => ({ date, value: pick(date) }))

  const report = computeLearningInsights({
    sleep: series((d) => physioMap.get(d)?.sleepHours ?? null),
    sleepQuality: series((d) => physioMap.get(d)?.sleepQuality ?? null),
    exercise: series((d) => physioMap.get(d)?.exerciseMinutes ?? null),
    mood: series((d) => (moodMap.has(d) ? (moodMap.get(d) ?? null) : null)),
    focusMinutes: series((d) => focusMap.get(d) ?? null),
    reviews: series((d) => reviewMap.get(d)?.reviews ?? null),
    retention: series((d) => {
      const r = reviewMap.get(d)
      return r && r.reviews > 0 ? r.correct / r.reviews : null
    }),
  })

  return Response.json({ ok: true, ...report })
})

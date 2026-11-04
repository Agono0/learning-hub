import { NextResponse } from 'next/server'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cards, focusSessions, revlog } from '@learning-hub/db'
import {
  calibrationCurve,
  dayKey,
  focusLeakTrend,
  forecastHistogram,
  heatmapData,
  learningScore,
  timeOfDayPerformance,
  type DailyReviewsRow,
} from '@learning-hub/core'
import { tzOffsetFromQuery } from '@/lib/api'

export const runtime = 'nodejs'

/** GET /api/analytics?tzOffset=N — every chart dataset in one call, computed from real rows. */
export async function GET(req: Request) {
  const tz = tzOffsetFromQuery(req)
  const today = dayKey(new Date(), tz)
  const weekAgo = dayKey(new Date(Date.now() - 7 * 86_400_000), tz)
  const monthAgo = dayKey(new Date(Date.now() - 30 * 86_400_000), tz)

  // forecast: upcoming workload
  const cardRows = db.select({ due: cards.due, suspended: cards.suspended }).from(cards).all()
  const forecast = forecastHistogram(cardRows, 30, today)

  // calibration: bucket the logged FSRS retrievability (Addon 10 column,
  // written by the review pipeline) against the actual outcomes
  const revlogRows = db
    .select({ rating: revlog.rating, reviewedAt: revlog.reviewedAt, retrievability: revlog.retrievability })
    .from(revlog)
    .orderBy(desc(revlog.reviewedAt))
    .limit(5000)
    .all()
  const calibration = calibrationCurve(
    revlogRows.map((r) => ({ rating: r.rating })),
    revlogRows.map((r) => r.retrievability),
  )

  // heatmap of daily review volume
  const dailyReviewRows = db.all<DailyReviewsRow>(
    sql`SELECT day, reviews, correct FROM v_daily_reviews WHERE day >= ${monthAgo}`,
  )
  const heatmap = heatmapData(dailyReviewRows)

  // time-of-day performance (bucketed by the client's local hour)
  const timeOfDay = timeOfDayPerformance(
    revlogRows.map((r) => ({ reviewedAt: r.reviewedAt, rating: r.rating })),
    { timezoneOffsetMinutes: tz },
  )

  // learning score over the last 7 days
  const weeklyReviews = dailyReviewRows.filter((r) => r.day >= weekAgo).reduce((a, r) => a + r.reviews, 0)
  const retentionRows = db.all<{ retention_pct: number | null; total: number }>(
    sql`SELECT retention_pct, total FROM v_true_retention`,
  )
  const retentionPct = retentionRows[0]?.retention_pct ?? null
  const [weeklyFocusRow] = db
    .select({ minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` })
    .from(focusSessions)
    .where(and(gte(focusSessions.startedAt, weekAgo), eq(focusSessions.completed, true)))
    .all()
  const weeklyFocusMinutes = weeklyFocusRow?.minutes ?? 0
  const score = learningScore({
    reviews: weeklyReviews,
    retentionPct,
    focusMinutes: weeklyFocusMinutes,
  })

  // focus-leak trend (honest tab-switch data)
  const sessionRows = db
    .select({ startedAt: focusSessions.startedAt, leaks: focusSessions.leaks })
    .from(focusSessions)
    .where(gte(focusSessions.startedAt, dayKey(new Date(Date.now() - 30 * 86_400_000), tz)))
    .all()
  const leakTrend = focusLeakTrend(sessionRows)

  const hasPredictions = revlogRows.some((r) => r.retrievability != null)

  return NextResponse.json({
    forecast,
    calibration,
    calibrationNote:
      cardRows.length === 0
        ? null
        : hasPredictions
          ? 'Buckets fill as reviews with logged retrievability predictions accumulate.'
          : 'No logged retrievability predictions yet — buckets fill as reviews record predictions.',
    heatmap,
    timeOfDay,
    learningScore: score,
    focusLeakTrend: leakTrend,
    trueRetention: { retentionPct, totalReviews: retentionRows[0]?.total ?? 0 },
    week: { start: weekAgo, reviews: weeklyReviews, focusMinutes: weeklyFocusMinutes },
  })
}

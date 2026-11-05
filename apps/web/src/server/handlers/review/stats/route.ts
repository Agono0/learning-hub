/**
 * /api/review/stats — true retention (from the append-only revlog via
 * v_true_retention), today's review counts, and the 30-day due forecast
 * (forecastNext30Days from core/fsrs).
 */
import { sql } from 'drizzle-orm'
import { db, cards } from '@learning-hub/db'
import { forecastNext30Days } from '@learning-hub/core'

export async function GET() {
  const retention = await db.all<{ total: number; retained: number; retention_pct: number }>(
    sql`SELECT total, retained, retention_pct FROM v_true_retention`,
  )

  const todayKey = new Date().toISOString().slice(0, 10)
  const todayStats = await db.all<{
    reviews: number
    correct: number
    avg_time_ms: number | null
  }>(sql`
    SELECT count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog
    WHERE substr(reviewed_at, 1, 10) = ${todayKey}
      AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
  `)

  const dueRows = await db
    .select({ due: cards.due, suspended: cards.suspended })
    .from(cards)
    .limit(5000)
  const forecast = forecastNext30Days(
    dueRows.filter((r) => !r.suspended).map((r) => ({ due: r.due })),
  )

  return Response.json({
    trueRetention: retention[0] ?? { total: 0, retained: 0, retention_pct: null },
    today: {
      day: todayKey,
      reviews: Number(todayStats[0]?.reviews ?? 0),
      correct: Number(todayStats[0]?.correct ?? 0),
      avgTimeMs: todayStats[0]?.avg_time_ms ?? null,
    },
    forecast,
  })
}

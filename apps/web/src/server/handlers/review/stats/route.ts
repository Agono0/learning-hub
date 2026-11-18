/**
 * /api/review/stats — true retention (from the append-only revlog via
 * v_true_retention), today's review counts, and the 30-day due forecast.
 *
 * All aggregations come from the shared stats repo (packages/db repos/stats)
 * so the web app, headless server, MCP and CLI answer identically.
 */
import { getDueForecast, getTodayReviewTallies, getTrueRetention } from '@learning-hub/db'

export async function GET() {
  const retention = getTrueRetention()
  const today = getTodayReviewTallies()
  const forecast = getDueForecast()

  return Response.json({
    trueRetention: retention,
    today: {
      day: today.day,
      reviews: today.reviews,
      correct: today.correct,
      avgTimeMs: today.avgTimeMs,
    },
    forecast,
  })
}

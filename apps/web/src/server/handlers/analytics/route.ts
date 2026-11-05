import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cards, focusSessions, revlog } from '@learning-hub/db'
import {
  calibrationByCard,
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
    .select({
      cardId: revlog.cardId,
      rating: revlog.rating,
      confidence: revlog.confidence,
      reviewedAt: revlog.reviewedAt,
      retrievability: revlog.retrievability,
    })
    .from(revlog)
    .orderBy(desc(revlog.reviewedAt))
    .limit(5000)
    .all()
  const calibration = calibrationCurve(
    revlogRows.map((r) => ({ rating: r.rating })),
    revlogRows.map((r) => r.retrievability),
  )

  // calibration TRAINER: per-card confidence vs correctness — the drill list
  // is the confident-wrong set (hypercorrection targets). Preview text comes
  // from the card content so the panel can name what to re-drill.
  const cardStats = calibrationByCard(
    revlogRows.map((r) => ({ cardId: r.cardId, confidence: r.confidence, rating: r.rating })),
  )
  const statById = new Map(cardStats.map((s) => [s.cardId, s]))
  const drillCandidates = revlogRows
    .filter((r) => r.confidence === 1 && r.rating === 1)
    .map((r) => r.cardId)
  const drillIds = [...new Set(drillCandidates)].slice(0, 10)
  const previewRows =
    drillIds.length > 0
      ? db
          .select({ id: cards.id, type: cards.type, content: cards.content, deckId: cards.deckId })
          .from(cards)
          .where(inArray(cards.id, drillIds))
          .all()
      : []
  const previewById = new Map(previewRows.map((c) => [c.id, c]))
  const calibrationTrainer = {
    overconfidentTotal: cardStats.filter((s) => s.overconfident > 0).length,
    reviewedCards: cardStats.length,
    cards: drillIds
      .map((id) => {
        const card = previewById.get(id)
        const text = card ? cardFrontPreview(card.type, card.content) : null
        return {
          cardId: id,
          deckId: card?.deckId ?? null,
          preview: text,
          overconfident: statById.get(id)?.overconfident ?? 0,
        }
      })
      .filter((c) => c.preview !== null),
  }

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
  const weeklyReviews = dailyReviewRows
    .filter((r) => r.day >= weekAgo)
    .reduce((a, r) => a + r.reviews, 0)
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

  return Response.json({
    forecast,
    calibration,
    calibrationNote:
      cardRows.length === 0
        ? null
        : hasPredictions
          ? 'Buckets fill as reviews with logged retrievability predictions accumulate.'
          : 'No logged retrievability predictions yet — buckets fill as reviews record predictions.',
    calibrationTrainer,
    heatmap,
    timeOfDay,
    learningScore: score,
    focusLeakTrend: leakTrend,
    trueRetention: { retentionPct, totalReviews: retentionRows[0]?.total ?? 0 },
    week: { start: weekAgo, reviews: weeklyReviews, focusMinutes: weeklyFocusMinutes },
  })
}

/** Short front-text preview of a card for the trainer panel. */
function cardFrontPreview(type: string, content: unknown): string | null {
  const c = (content ?? {}) as Record<string, unknown>
  if (type === 'exercise') {
    const ex = c.exercise as { prompt?: string } | undefined
    return ex?.prompt?.replace(/[#*`>]/g, '').slice(0, 90) ?? null
  }
  const basic = c.basic as { front?: string } | undefined
  if (basic?.front) return basic.front.replace(/[#*`>]/g, '').slice(0, 90)
  const cloze = c.cloze as { text?: string } | undefined
  if (cloze?.text) return cloze.text.replace(/[#*`>]/g, '').slice(0, 90)
  const mcq = c.mcq as { question?: string } | undefined
  if (mcq?.question) return mcq.question.replace(/[#*`>]/g, '').slice(0, 90)
  const typein = c.typein as { question?: string } | undefined
  if (typein?.question) return typein.question.replace(/[#*`>]/g, '').slice(0, 90)
  const proof = c.proof_step as { statement?: string } | undefined
  if (proof?.statement) return proof.statement.replace(/[#*`>]/g, '').slice(0, 90)
  return null
}

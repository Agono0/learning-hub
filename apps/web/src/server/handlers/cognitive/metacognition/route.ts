/**
 * /api/cognitive/metacognition — Koriat & Bjork metacognitive calibration &
 * fluency-illusion engine, fed by REAL review history.
 *
 * GET  → Derive JOL observations from `revlog` (the FSRS review log persists a
 *        per-review `confidence` — 0 uncertain / 1 confident — written by
 *        `executeReview`), evaluate monitoring γ, the Murphy Brier
 *        decomposition, and surface the crucible drill list (confident-wrong
 *        cards). No samples: an empty history returns an honest empty report.
 * POST → Evaluate explicitly supplied trials (used by the studio's manual
 *        mode, the headless server, and MCP parity).
 */
import { z } from 'zod'
import { desc, inArray, sql } from 'drizzle-orm'
import {
  decomposeBrierScore,
  evaluateMetacognitiveProfile,
  evaluateStudioReport,
  goodmanKruskalGamma,
  jolObservationSchema,
  type JolObservation,
} from '@learning-hub/core'
import { db } from '@/lib/db'
import { cards, revlog } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const metacognitionInputSchema = z.object({
  trials: z.array(jolObservationSchema),
})

/** Mapping used across MCP/server parity: stored binary confidence → 0–1 forecast. */
export function confidenceToForecast(confidence: 0 | 1): number {
  return confidence === 1 ? 0.9 : 0.35
}

/** Build JOL observations from revlog rows (shared with parity consumers). */
export function trialsFromRows(
  rows: { cardId: number; rating: number; confidence: 0 | 1; timeMs?: number | null }[],
): JolObservation[] {
  return rows.map((r) => ({
    cardId: r.cardId,
    confidence: confidenceToForecast(r.confidence),
    outcome: r.rating >= 3 ? 1 : 0,
    latencyMs: r.timeMs ?? undefined,
  }))
}

/** GET /api/cognitive/metacognition — real calibration report from revlog. */
export const GET = withRoute(async () => {
  const rows = db
    .select({
      cardId: revlog.cardId,
      rating: revlog.rating,
      confidence: revlog.confidence,
      timeMs: revlog.timeMs,
    })
    .from(revlog)
    .where(sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`)
    .orderBy(desc(revlog.id))
    .limit(1000)
    .all()

  const trials = trialsFromRows(rows)
  const report = evaluateMetacognitiveProfile(trials)
  const gamma = goodmanKruskalGamma(trials)
  const brier = decomposeBrierScore(trials)
  const studio = evaluateStudioReport({ jols: trials })

  // Crucible drill list: cards whose most recent miss was committed with high
  // confidence — the Butterfield-Metcalfe high-value retest targets.
  const lastMissConfidence = new Map<number, 0 | 1>()
  for (const r of rows) {
    if (r.rating < 3 && !lastMissConfidence.has(r.cardId)) {
      lastMissConfidence.set(r.cardId, r.confidence)
    }
  }
  const confidentMissIds = [...lastMissConfidence.entries()]
    .filter(([, conf]) => conf === 1)
    .map(([cardId]) => cardId)
    .slice(0, 10)

  const previewRows =
    confidentMissIds.length > 0
      ? db
          .select({ id: cards.id, type: cards.type, content: cards.content })
          .from(cards)
          .where(inArray(cards.id, confidentMissIds))
          .all()
      : []

  return Response.json({
    ok: true,
    report,
    monitoring: {
      gamma: gamma.gamma,
      level: gamma.level,
      interpretation: gamma.interpretation,
      concordantPairs: gamma.concordantPairs,
      discordantPairs: gamma.discordantPairs,
      tiedPairs: gamma.tiedPairs,
    },
    brier: {
      score: brier.brierScore,
      reliability: brier.reliability,
      resolution: brier.resolution,
      uncertainty: brier.uncertainty,
      calibrationIndex: brier.calibrationIndex,
      bins: brier.bins,
    },
    /** Full integrated studio report over the same real trials (HUD-ready). */
    studio,
    crucibleDrillIds: confidentMissIds,
    cruciblePreviews: previewRows,
    sampleSize: trials.length,
  })
})

/** POST /api/cognitive/metacognition — evaluate explicit JOL trials. */
export const POST = withRoute(async (req: Request) => {
  const { trials } = await readJson(req, metacognitionInputSchema)
  const report = evaluateMetacognitiveProfile(trials)
  const gamma = goodmanKruskalGamma(trials)
  const studio = evaluateStudioReport({ jols: trials })
  return Response.json({ ok: true, report, gamma, selfKnowledgeIndex: studio.selfKnowledgeIndex })
})

/** Type re-export for parity consumers (server/CLI). */
export type MetacognitionTrial = JolObservation

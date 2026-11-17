/**
 * /api/cognitive/hypercorrection — Butterfield & Metcalfe (2001) crucible.
 *
 * GET  → Derive error-correction trials from REAL revlog history: every miss
 *        (`rating < 3`) committed with a recorded confidence, and whether a
 *        later review of the same card succeeded (correction). Returns the
 *        crucible report plus the FSRS relearning-priority queue built from
 *        each card's latest FSRS state.
 * POST → Evaluate explicitly supplied correction trials + relearn candidates
 *        (manual mode / parity with the headless server and MCP).
 */
import { z } from 'zod'
import { desc, inArray, sql } from 'drizzle-orm'
import {
  correctionTrialSchema,
  epistemicShockOf,
  evaluateHypercorrection,
  predictedCorrectionProbability,
  prioritizeRelearningQueue,
  relearnPrioritySchema,
  type CorrectionTrial,
  type RelearnCandidate,
  type RelearnPriorityItem,
} from '@learning-hub/core'
import { db } from '@/lib/db'
import { cards, revlog } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const hypercorrectionInputSchema = z.object({
  corrections: z.array(correctionTrialSchema),
  candidates: z.array(
    z.object({
      cardId: z.number().int().positive(),
      errorConfidence: z.number().min(0).max(1),
      stability: z.number().min(0),
      difficulty: z.number().min(1).max(10),
      wasAlreadyCorrected: z.boolean().optional(),
    }),
  ),
})

interface RevlogRow {
  cardId: number
  rating: number
  confidence: 0 | 1
}

/**
 * Reconstructs correction trials from the review log. For each card, walks the
 * history oldest→newest: every miss armed with its confidence; the next
 * successful review of the same card counts as the correction.
 */
export function correctionTrialsFromRows(rows: RevlogRow[]): {
  corrections: CorrectionTrial[]
  candidates: RelearnCandidate[]
} {
  const chronological = [...rows].reverse() // revlog arrives newest-first
  const corrections: CorrectionTrial[] = []
  const candidates: RelearnCandidate[] = []
  // One armed miss per card: a miss waits for the card's next success.
  const armed = new Map<number, 0 | 1>()

  for (const r of chronological) {
    const correct = r.rating >= 3
    const pending = armed.get(r.cardId)
    if (pending !== undefined && correct) {
      corrections.push({
        cardId: r.cardId,
        initialConfidence: pending === 1 ? 0.9 : 0.35,
        wasCorrected: true,
      })
      armed.delete(r.cardId)
    }
    if (!correct) {
      // A fresh miss re-arms the card with its latest miss confidence.
      armed.set(r.cardId, r.confidence)
    }
  }

  // Anything still armed is an uncorrected error — the crucible's queue seed.
  for (const [cardId, confidence] of armed) {
    candidates.push({
      cardId,
      errorConfidence: confidence === 1 ? 0.9 : 0.35,
      stability: 1,
      difficulty: 6,
      wasAlreadyCorrected: false,
    })
  }
  return { corrections, candidates }
}

/** GET /api/cognitive/hypercorrection — crucible report + relearn queue from revlog. */
export const GET = withRoute(async () => {
  const rows: RevlogRow[] = db
    .select({
      cardId: revlog.cardId,
      rating: revlog.rating,
      confidence: revlog.confidence,
    })
    .from(revlog)
    .where(sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`)
    .orderBy(desc(revlog.id))
    .limit(2000)
    .all()

  const { corrections, candidates: armedCandidates } = correctionTrialsFromRows(rows)

  // FSRS telemetry for the queue comes from the cards table (FSRS-6 state is
  // stored on the card, not the log row).
  const candidateIds = [...new Set(armedCandidates.map((c) => c.cardId))]
  const fsrsRows =
    candidateIds.length > 0
      ? db
          .select({ id: cards.id, stability: cards.stability, difficulty: cards.difficulty })
          .from(cards)
          .where(inArray(cards.id, candidateIds))
          .all()
      : []
  const fsrsById = new Map(fsrsRows.map((c) => [c.id, c]))

  const candidates: RelearnCandidate[] = armedCandidates.map((c) => {
    const state = fsrsById.get(c.cardId)
    return {
      ...c,
      // FSRS difficulty is 1..10 with 0 meaning "new" — fall back to 6 (hard-ish)
      // so fresh cards still get sensible queue priority.
      stability: state && state.stability > 0 ? state.stability : c.stability,
      difficulty: state && state.difficulty > 0 ? state.difficulty : c.difficulty,
    }
  })

  const report = evaluateHypercorrection(corrections)
  const queue: RelearnPriorityItem[] = prioritizeRelearningQueue(candidates, corrections)

  return Response.json({
    ok: true,
    report,
    queue: queue.slice(0, 12),
    sampleSize: corrections.length,
  })
})

/** POST /api/cognitive/hypercorrection — evaluate explicit crucible trials. */
export const POST = withRoute(async (req: Request) => {
  const { corrections, candidates } = await readJson(req, hypercorrectionInputSchema)
  const normalized: RelearnCandidate[] = candidates.map((c) => ({
    ...c,
    wasAlreadyCorrected: c.wasAlreadyCorrected ?? false,
  }))
  const report = evaluateHypercorrection(corrections)
  const queue = prioritizeRelearningQueue(normalized, corrections)
  const shocks = corrections
    .filter((c) => !c.wasCorrected && c.initialConfidence >= 0.7)
    .map((c) => epistemicShockOf(c.initialConfidence, 0, c.cardId ?? null))
  const forecast = candidates.length
    ? predictedCorrectionProbability(candidates[0].errorConfidence, corrections)
    : null
  return Response.json({
    ok: true,
    report,
    queue,
    uncorrectedShocks: shocks,
    forecastedCorrectionProbability: forecast,
  })
})

export const relearnPriorityOutputSchema = relearnPrioritySchema

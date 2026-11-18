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
import {
  correctionTrialSchema,
  epistemicShockOf,
  evaluateHypercorrection,
  predictedCorrectionProbability,
  prioritizeRelearningQueue,
  relearnPrioritySchema,
  type RelearnCandidate,
  type RelearnPriorityItem,
} from '@learning-hub/core'
import { getRevlogTrialRows, reconstructCorrectionTrials } from '@learning-hub/db'
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

/** GET /api/cognitive/hypercorrection — crucible report + relearn queue from revlog. */
export const GET = withRoute(async () => {
  // Shared repo query: undone reviews excluded, cards joined for FSRS state;
  // reconstruction goes through the canonical core walk (one definition for
  // web, the headless server and MCP — see packages/db repos/cognitive-trials).
  const { corrections, candidates: armedCandidates } = reconstructCorrectionTrials(
    getRevlogTrialRows({ limit: 2000 }),
  )

  const report = evaluateHypercorrection(corrections)
  const queue: RelearnPriorityItem[] = prioritizeRelearningQueue(armedCandidates, corrections)

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

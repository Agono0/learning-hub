/**
 * Runtime-neutral API handler for the Epistemic Curiosity & Information Gap
 * Studio.
 *
 * Grounded in:
 * - George Loewenstein (1994): "The Psychology of Curiosity: A Review and
 *   Reinterpretation" (information gap theory; inverted-U epistemic tension)
 * - Daniel E. Berlyne (1960, 1966): "Conflict, Arousal, and Curiosity"
 *   (collative variables weighting the tension curve)
 * - Min Jeong Kang et al. (2009, Neuron): "The Wick in the Candle of Learning"
 *   (dopaminergic memory facilitation multiplier, capped at 1.85x)
 *
 * Actions (zod-discriminated):
 * - `metrics`: the live Loewenstein/Kang telemetry for an in-progress session
 *   — epistemic tension, memory facilitation multiplier, gap salience and
 *   drive status. The perceived-knowledge level is the CALLER's input (the
 *   studio derives it from clue coverage / HUD simulation / post-resolution
 *   closure); the tension curve and multiplier are the engine's.
 * - `resolve`: the stateful engine resolution (`InformationGapSession`) — the
 *   authoritative headless contract. On accurate closure the session's
 *   perceived knowledge is raised to 0.95 and the metrics are re-derived, so
 *   the returned multiplier is the post-resolution engine value (the studio
 *   composes its own presentation result client-side and keeps the
 *   pre-resolution peak — see the studio's resolver handler).
 * - `fsrsCards`: the engine's FSRS-6 curiosity card export, driven through a
 *   session state (revealed clues + optional resolution).
 *
 * GET returns the calibrated mystery catalog (pure content lookup — no
 * persistence, no AI; deterministic, so the manual-mode guarantee of
 * AGENTS.md rule 9 holds by construction).
 */

import { z } from 'zod'
import {
  CALIBRATED_CURIOSITY_MYSTERIES,
  calculateLoewensteinEpistemicTension,
  calculateMemoryFacilitationMultiplier,
  evaluateEpistemicDriveStatus,
  InformationGapSession,
  type CuriosityGapMystery,
  type CuriosityMetrics,
} from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'

// -----------------------------------------------------------------------------
// Boundary schemas (zod at every boundary)
// -----------------------------------------------------------------------------

const postCuriosityBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('metrics'),
    mysteryId: z.string().min(1),
    /** Perceived knowledge k ∈ [0, 1] — the input to Loewenstein's inverted-U. */
    priorKnowledgeLevel: z.number().min(0).max(1),
    cluesRevealedCount: z.number().int().min(0),
    isResolved: z.boolean(),
  }),
  z.object({
    action: z.literal('resolve'),
    mysteryId: z.string().min(1),
    optionId: z.string().min(1),
  }),
  z.object({
    action: z.literal('fsrsCards'),
    mysteryId: z.string().min(1),
    /** Clues already revealed; unknown ids are skipped, not fatal. */
    revealedClueIds: z.array(z.string()).default([]),
    /** When present, the session is resolved through this option first. */
    resolvedOptionId: z.string().optional(),
  }),
])

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Resolve a calibrated mystery by id. Unknown ids are a client error (404),
 * never a silent fallback — the metrics must come from the mystery the caller
 * actually saw.
 */
function findMystery(mysteryId: string): CuriosityGapMystery {
  const mystery = CALIBRATED_CURIOSITY_MYSTERIES[mysteryId]
  if (!mystery) throw new ApiError(404, `Unknown curiosity mystery: ${mysteryId}`)
  return mystery
}

/**
 * The engine math behind the studio's live HUD: Loewenstein's inverted-U
 * tension curve (weighted by Berlyne's collative variable), the Kang et al.
 * memory facilitation multiplier, the gap salience index and the epistemic
 * drive status. Deterministic — identical to the in-browser mirror and to
 * `InformationGapSession#getMetrics` for the same inputs.
 */
function computeCuriosityMetrics(
  mystery: CuriosityGapMystery,
  priorKnowledgeLevel: number,
  cluesRevealedCount: number,
  isResolved: boolean,
): CuriosityMetrics {
  const tension = calculateLoewensteinEpistemicTension(
    priorKnowledgeLevel,
    mystery.collativeVariable,
  )
  const multiplier = calculateMemoryFacilitationMultiplier(
    tension,
    cluesRevealedCount,
    mystery.clues.length,
  )
  const salience = Math.round((cluesRevealedCount / Math.max(1, mystery.clues.length)) * 100) / 100
  const driveStatus = evaluateEpistemicDriveStatus(tension, isResolved)

  return {
    priorKnowledgeLevel: Math.round(priorKnowledgeLevel * 100) / 100,
    epistemicTensionScore: tension,
    cluesRevealedCount,
    totalAvailableClues: mystery.clues.length,
    gapSalienceIndex: salience,
    memoryFacilitationMultiplier: multiplier,
    isResolved,
    epistemicDriveStatus: driveStatus,
  }
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

/**
 * GET /api/curiosity — the calibrated mystery catalog (paradox hooks, clue
 * ladders, resolver options). Static content lookup: same body on every host
 * (web shim, hub worker, headless server), no database required.
 */
export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    mysteries: Object.values(CALIBRATED_CURIOSITY_MYSTERIES),
  })
})

/**
 * POST /api/curiosity — engine operations for the curiosity studio,
 * dispatched on `action`. See the module doc for the action list; every
 * variant is zod-validated and every response carries `ok: true` beside the
 * computed output (never client-claimed metrics).
 */
export const POST = withRoute(async (req) => {
  const body = await readJson(req, postCuriosityBodySchema)

  if (body.action === 'metrics') {
    const mystery = findMystery(body.mysteryId)
    return Response.json({
      ok: true,
      metrics: computeCuriosityMetrics(
        mystery,
        body.priorKnowledgeLevel,
        body.cluesRevealedCount,
        body.isResolved,
      ),
    })
  }

  if (body.action === 'resolve') {
    findMystery(body.mysteryId)
    const session = new InformationGapSession(body.mysteryId)
    if (!session.getMystery().resolverOptions.some((o) => o.id === body.optionId)) {
      throw new ApiError(404, `Unknown resolver option: ${body.optionId}`)
    }
    const result = session.resolveMystery(body.optionId)
    return Response.json({ ok: true, result, metrics: session.getMetrics() })
  }

  // action === 'fsrsCards' — the stateful session export: reveal the given
  // clues (unknown ids skipped so a stale client list cannot hard-fail the
  // export), optionally resolve, then export the Kang-multiplier-scaled cards.
  findMystery(body.mysteryId)
  const session = new InformationGapSession(body.mysteryId)
  const knownClueIds = new Set(session.getMystery().clues.map((c) => c.id))
  for (const clueId of body.revealedClueIds) {
    if (knownClueIds.has(clueId)) session.revealClue(clueId)
  }
  if (body.resolvedOptionId !== undefined) {
    if (!session.getMystery().resolverOptions.some((o) => o.id === body.resolvedOptionId)) {
      throw new ApiError(404, `Unknown resolver option: ${body.resolvedOptionId}`)
    }
    session.resolveMystery(body.resolvedOptionId)
  }
  return Response.json({
    ok: true,
    cards: session.exportFSRSCards(),
    metrics: session.getMetrics(),
  })
})

/**
 * Runtime-neutral API handler for the Cognitive Apprenticeship & Expert
 * Modeling Studio.
 *
 * Grounded in:
 * - Allan Collins, John Seely Brown & Susan E. Newman (1989): Cognitive
 *   Apprenticeship methods — Modeling, Coaching, Scaffolding, Articulation,
 *   Reflection, Exploration.
 * - Jean Lave & Etienne Wenger (1991): Legitimate Peripheral Participation
 *   (LPP) across authentic practice communities.
 * - Kurt VanLehn (1999) & Michelene Chi (2000): making tacit expert heuristics
 *   visible through think-aloud decomposition and prompted articulation.
 *
 * Actions (zod-discriminated):
 * - `metrics`: the full apprenticeship telemetry (tacit extraction rate,
 *   fading index, LPP participation level, per-stage readiness) computed by
 *   the core engine's own primitives from the learner's externally-held
 *   session state (the studio keeps its state in React, not in a
 *   `CognitiveApprenticeshipSession` instance).
 * - `deck`: FSRS-6 tacit-heuristic flashcards synthesized by the engine's own
 *   `CognitiveApprenticeshipSession.exportFSRSCards`, with the learner's
 *   extracted-principle set reconstructed through the session's public
 *   interaction API — never a handler-side copy of the card algorithm.
 *
 * GET returns the calibrated suite corpus (expert think-aloud traces,
 * articulation prompts, reflection contrasts, tacit principles) so any host —
 * web UI, headless server, MCP, CLI — can render or drive a studio without
 * importing the core package. Pure content, no database reads: the endpoint is
 * always available (manual-mode guarantee, rule 9).
 */

import { z } from 'zod'
import {
  CALIBRATED_APPRENTICESHIP_SUITES,
  calculateFadingIndex,
  calculateTacitExtractionRate,
  CognitiveApprenticeshipSession,
  determineParticipationLevel,
  type ApprenticeshipMetrics,
  type ApprenticeshipStage,
  type CognitiveApprenticeshipSuite,
  type FSRSTacitHeuristicCard,
} from '@learning-hub/core/apprenticeship'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** The six Collins-Brown (1989) stages — mirrors the core engine's union. */
const apprenticeshipStageSchema = z.enum([
  'modeling',
  'coaching',
  'scaffolding',
  'articulation',
  'reflection',
  'exploration',
])

/**
 * Observed-trace / extracted-principle / completed-reflection id lists. Sets on
 * the client; deduplicated here so a malformed duplicate can never inflate a
 * count.
 */
const idListSchema = z.array(z.string().min(1)).max(64).default([])

/** Articulation alignment scores (0..1), one per currently-answered prompt. */
const articulationScoresSchema = z.array(z.number().min(0).max(1)).max(64).default([])

const postApprenticeshipBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('metrics'),
    suiteId: z.string().min(1),
    stage: apprenticeshipStageSchema,
    observedTraceIds: idListSchema,
    extractedPrincipleIds: idListSchema,
    articulationScores: articulationScoresSchema,
    completedReflectionIds: idListSchema,
  }),
  z.object({
    action: z.literal('deck'),
    suiteId: z.string().min(1),
    stage: apprenticeshipStageSchema,
    extractedPrincipleIds: idListSchema,
  }),
])

/**
 * Resolve a suite id against the calibrated corpus. Unlike the studio's
 * silent-fallback display default, an unknown id from an API caller is a
 * boundary error: 404 with the offending id.
 */
function requireSuite(suiteId: string): CognitiveApprenticeshipSuite {
  const suite = CALIBRATED_APPRENTICESHIP_SUITES[suiteId]
  if (!suite) throw new ApiError(404, `Unknown cognitive apprenticeship suite: ${suiteId}`)
  return suite
}

/**
 * Full apprenticeship telemetry for externally-held session state, composed
 * from the same core primitives `CognitiveApprenticeshipSession.getMetrics()`
 * uses — tacit extraction rate, fading index, LPP participation level — plus
 * the session's aggregate counters and per-stage readiness gates. Inputs are
 * deduplicated counts so the response is invariant to list duplication.
 */
function computeApprenticeshipMetrics(params: {
  suite: CognitiveApprenticeshipSuite
  stage: ApprenticeshipStage
  observedTraceIds: readonly string[]
  extractedPrincipleIds: readonly string[]
  articulationScores: readonly number[]
  completedReflectionIds: readonly string[]
}): ApprenticeshipMetrics {
  const { suite, stage } = params
  const observedCount = new Set(params.observedTraceIds).size
  const extractedCount = new Set(params.extractedPrincipleIds).size
  const completedCount = new Set(params.completedReflectionIds).size
  const scores = params.articulationScores

  const tacitExtractionRate = calculateTacitExtractionRate(
    extractedCount,
    suite.principles.length,
    scores,
  )
  const fadingIndex = calculateFadingIndex(stage, scores.length, suite.prompts.length)
  const participationLevel = determineParticipationLevel(fadingIndex, tacitExtractionRate)

  const meanArticulationScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0

  return {
    totalTracesObserved: observedCount,
    totalArticulationsAttempted: scores.length,
    meanArticulationScore,
    extractedPrincipleCount: extractedCount,
    totalAvailablePrinciples: suite.principles.length,
    tacitExtractionRate,
    completedReflectionsCount: completedCount,
    fadingIndex,
    participationLevel,
    stageReadiness: {
      modeling: observedCount > 0,
      coaching: observedCount >= suite.traces.length,
      scaffolding: scores.length > 0,
      articulation: scores.length >= suite.prompts.length,
      reflection: completedCount > 0,
      exploration: fadingIndex >= 0.7 && completedCount >= suite.reflectionContrasts.length,
    },
  }
}

/**
 * Synthesize the FSRS-6 tacit-heuristic deck through the engine itself. The
 * learner's extracted-principle set (principles ever unlocked by an option
 * with `tacitAlignmentScore >= 0.8` referencing them) is replayed into a fresh
 * `CognitiveApprenticeshipSession` via its public `submitArticulation` API —
 * the same unlock condition the studio applies on selection — so
 * `exportFSRSCards` (extracted-multiplier 1.4 vs locked 0.85, expert
 * think-aloud quotes, Collins pedagogical note) remains the single source of
 * truth for card content.
 */
function buildDeckCards(
  suite: CognitiveApprenticeshipSuite,
  stage: ApprenticeshipStage,
  extractedPrincipleIds: readonly string[],
): readonly FSRSTacitHeuristicCard[] {
  const session = new CognitiveApprenticeshipSession(suite.id)
  session.setCurrentStage(stage)
  for (const principleId of new Set(extractedPrincipleIds)) {
    const prompt = suite.prompts.find((p) =>
      p.options.some((o) => o.principleId === principleId && o.tacitAlignmentScore >= 0.8),
    )
    const option = prompt?.options.find(
      (o) => o.principleId === principleId && o.tacitAlignmentScore >= 0.8,
    )
    if (prompt && option) session.submitArticulation(prompt.id, option.id)
  }
  return session.exportFSRSCards()
}

/** GET /api/apprenticeship — the full calibrated suite corpus (static content). */
export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    suites: CALIBRATED_APPRENTICESHIP_SUITES,
  })
})

/**
 * POST /api/apprenticeship — engine-backed studio operations:
 * `metrics` (telemetry for the learner's session state) and `deck` (FSRS-6
 * tacit-heuristic cards for the extracted-principle set).
 */
export const POST = withRoute(async (req) => {
  const body = await readJson(req, postApprenticeshipBodySchema)
  const suite = requireSuite(body.suiteId)

  if (body.action === 'metrics') {
    const metrics = computeApprenticeshipMetrics({
      suite,
      stage: body.stage,
      observedTraceIds: body.observedTraceIds,
      extractedPrincipleIds: body.extractedPrincipleIds,
      articulationScores: body.articulationScores,
      completedReflectionIds: body.completedReflectionIds,
    })
    return Response.json({ ok: true, metrics })
  }

  // action === 'deck'
  const cards = buildDeckCards(suite, body.stage, body.extractedPrincipleIds)
  return Response.json({ ok: true, cards })
})

/**
 * Runtime-neutral API handler for the Dual-Process Diagnostic & Cognitive
 * Forcing Studio.
 *
 * Grounded in:
 * - Daniel Kahneman (2011): "Thinking, Fast and Slow" (System 1 / System 2)
 * - Keith E. Stanovich (2009, 2011): "Rationality and the Reflective Mind"
 *   (tripartite mind; cognitive decoupling; reflective override)
 * - Pat Croskerry (2002, 2003): "Cognitive Forcing Functions in Clinical
 *   Decision Making" (CFF gates against premature closure, anchoring,
 *   search satisficing, confirmation bias)
 *
 * Actions (zod-discriminated):
 * - `evaluate`: the full session telemetry the studio's live HUD shows —
 *   cognitive decoupling score, bias vulnerability score, reflective mind
 *   index, override/accuracy flags and the Stanovich reflective tier, all
 *   derived from the RAW session state (scenario lookup happens here, so the
 *   caller never needs the scenario corpus).
 * - `decoupling` / `vulnerability` / `reflectiveIndex` / `tier`: the individual
 *   scoring functions, exposed one-to-one for headless consumers (MCP/CLI/
 *   server) that want a single engine operation.
 * - `deck`: the FSRS-6 debiasing card deck Croskerry-bridged for a scenario.
 *
 * GET returns the calibrated diagnostic scenarios plus the cognitive-bias
 * catalog (pure content lookup — no persistence, no AI; deterministic, so the
 * manual-mode guarantee of AGENTS.md rule 9 holds by construction).
 */

import { z } from 'zod'
import {
  CALIBRATED_DIAGNOSTIC_SCENARIOS,
  CANONICAL_COGNITIVE_BIAS_CATALOG,
  calculateBiasVulnerabilityScore,
  calculateCognitiveDecouplingScore,
  calculateReflectiveMindIndex,
  evaluateReflectiveMindTier,
  generateFSRSDebiasingDeck,
  type DiagnosticScenario,
  type DualProcessSessionMetrics,
  type ReflectiveMindTier,
} from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'

// -----------------------------------------------------------------------------
// Boundary schemas (zod at every boundary; shapes mirror the studio's session
// state and the engine scoring functions' parameters)
// -----------------------------------------------------------------------------

const countSchema = z.number().int().min(0)
const unitScoreSchema = z.number().min(0).max(1)

/** Raw System-1/System-2 session state, exactly as the studio holds it. */
const dualProcessSessionSchema = z.object({
  scenarioId: z.string().min(1),
  /** '' until the System 1 gut choice is made. */
  system1ChoiceId: z.string(),
  system1LatencyMs: countSchema,
  system1Confidence: unitScoreSchema,
  completedForcingStepIds: z.array(z.string()),
  discoveredAnomalies: z.array(z.string()),
  /** '' until the final System 2 diagnosis is committed. */
  system2ChoiceId: z.string(),
  system2Confidence: unitScoreSchema,
})

const decouplingParamsSchema = z.object({
  hypothesesConsideredCount: countSchema,
  anomaliesDiscoveredCount: countSchema,
  forcingStepsCompletedCount: countSchema,
  totalForcingStepsCount: countSchema,
})

const vulnerabilityParamsSchema = z.object({
  /** Snap judgements (< 3000ms) inflate the vulnerability score. */
  initialDecisionLatencyMs: countSchema,
  forcingStepsCompletedCount: countSchema,
  totalForcingStepsCount: countSchema,
  anomaliesDiscoveredCount: countSchema,
  totalAnomaliesCount: countSchema,
})

const reflectiveIndexParamsSchema = z.object({
  cognitiveDecouplingScore: unitScoreSchema,
  biasVulnerabilityScore: unitScoreSchema,
  reflectiveOverrideOccurred: z.boolean(),
  diagnosticAccuracyAchieved: z.boolean(),
})

const postDualProcessBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('evaluate'), session: dualProcessSessionSchema }),
  z.object({ action: z.literal('decoupling'), ...decouplingParamsSchema.shape }),
  z.object({ action: z.literal('vulnerability'), ...vulnerabilityParamsSchema.shape }),
  z.object({ action: z.literal('reflectiveIndex'), ...reflectiveIndexParamsSchema.shape }),
  z.object({ action: z.literal('tier'), reflectiveMindIndex: unitScoreSchema }),
  z.object({ action: z.literal('deck'), scenarioId: z.string().min(1) }),
])

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Resolve a calibrated scenario by id. Unknown ids are a client error (404),
 * never a silent fallback — a mistyped id must not evaluate against a
 * different scenario than the caller saw.
 */
function findScenario(scenarioId: string): DiagnosticScenario {
  const scenario = CALIBRATED_DIAGNOSTIC_SCENARIOS.find((s) => s.id === scenarioId)
  if (!scenario) throw new ApiError(404, `Unknown diagnostic scenario: ${scenarioId}`)
  return scenario
}

/**
 * The studio's live HUD evaluation, run server-side: derives the session
 * heuristics (hypotheses considered after 2+ forcing steps, heuristic override,
 * diagnostic accuracy against the scenario's target hypothesis) from the raw
 * session state, then runs the three scoring functions and the reflective
 * tier. Deterministic — identical to the in-browser mirror.
 */
function evaluateDualProcessSession(session: z.infer<typeof dualProcessSessionSchema>): {
  metrics: DualProcessSessionMetrics
  tier: ReflectiveMindTier
} {
  const scenario = findScenario(session.scenarioId)
  // Studio heuristic: completing two or more forcing gates implies three
  // competing hypotheses were actively held in working memory.
  const hypothesesConsideredCount = session.completedForcingStepIds.length >= 2 ? 3 : 1

  const cognitiveDecouplingScore = calculateCognitiveDecouplingScore({
    hypothesesConsideredCount,
    anomaliesDiscoveredCount: session.discoveredAnomalies.length,
    forcingStepsCompletedCount: session.completedForcingStepIds.length,
    totalForcingStepsCount: scenario.cognitiveForcingSteps.length,
  })

  const biasVulnerabilityScore = calculateBiasVulnerabilityScore({
    initialDecisionLatencyMs: session.system1LatencyMs,
    forcingStepsCompletedCount: session.completedForcingStepIds.length,
    totalForcingStepsCount: scenario.cognitiveForcingSteps.length,
    anomaliesDiscoveredCount: session.discoveredAnomalies.length,
    totalAnomaliesCount: scenario.subtleAnomalies.length,
  })

  const targetHypothesis = scenario.hypotheses.find((h) => h.isTargetOptimalSolution)
  const diagnosticAccuracyAchieved = session.system2ChoiceId
    ? session.system2ChoiceId === targetHypothesis?.id
    : false
  const reflectiveOverrideOccurred =
    Boolean(session.system1ChoiceId) &&
    Boolean(session.system2ChoiceId) &&
    session.system1ChoiceId !== session.system2ChoiceId &&
    diagnosticAccuracyAchieved

  const reflectiveMindIndex = calculateReflectiveMindIndex({
    cognitiveDecouplingScore,
    biasVulnerabilityScore,
    reflectiveOverrideOccurred,
    diagnosticAccuracyAchieved,
  })

  const metrics: DualProcessSessionMetrics = {
    scenarioId: scenario.id,
    system1InitialDiagnosisId: session.system1ChoiceId,
    system1DecisionLatencyMs: session.system1LatencyMs,
    system1InitialConfidence: session.system1Confidence,
    completedForcingStepIds: session.completedForcingStepIds,
    discoveredAnomalies: session.discoveredAnomalies,
    system2FinalDiagnosisId: session.system2ChoiceId,
    system2FinalConfidence: session.system2Confidence,
    reflectiveOverrideOccurred,
    cognitiveDecouplingScore,
    biasVulnerabilityScore,
    reflectiveMindIndex,
    diagnosticAccuracyAchieved,
  }

  return { metrics, tier: evaluateReflectiveMindTier(reflectiveMindIndex) }
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

/**
 * GET /api/dual-process — the calibrated diagnostic scenario corpus and the
 * canonical cognitive-bias catalog. Static content lookup: same body on every
 * host (web shim, hub worker, headless server), no database required.
 */
export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    scenarios: CALIBRATED_DIAGNOSTIC_SCENARIOS,
    biasCatalog: CANONICAL_COGNITIVE_BIAS_CATALOG,
  })
})

/**
 * POST /api/dual-process — engine operations for the dual-process studio,
 * dispatched on `action`. See the module doc for the action list; every
 * variant is zod-validated and every response carries `ok: true` beside the
 * computed output (never client-claimed metrics).
 */
export const POST = withRoute(async (req) => {
  const body = await readJson(req, postDualProcessBodySchema)

  if (body.action === 'evaluate') {
    const { metrics, tier } = evaluateDualProcessSession(body.session)
    return Response.json({ ok: true, metrics, tier })
  }

  if (body.action === 'decoupling') {
    const score = calculateCognitiveDecouplingScore(body)
    return Response.json({ ok: true, score })
  }

  if (body.action === 'vulnerability') {
    const score = calculateBiasVulnerabilityScore(body)
    return Response.json({ ok: true, score })
  }

  if (body.action === 'reflectiveIndex') {
    const index = calculateReflectiveMindIndex(body)
    return Response.json({ ok: true, index })
  }

  if (body.action === 'tier') {
    return Response.json({ ok: true, tier: evaluateReflectiveMindTier(body.reflectiveMindIndex) })
  }

  // action === 'deck' — FSRS-6 debiasing cards for one scenario.
  const scenario = findScenario(body.scenarioId)
  return Response.json({
    ok: true,
    cards: generateFSRSDebiasingDeck(scenario),
  })
})

/**
 * Runtime-neutral API handler for the Deliberate Practice & Progressive Error
 * Recovery Studio.
 *
 * Grounded in:
 * - Ericsson's Deliberate Practice paradigm (Ericsson, Krampe & Tesch-Römer
 *   1993; Ericsson 2006, 2016) — the Deliberate Effort Index
 *   D = FocusedReps × (1 + 0.45·DeficitTargetingRate) × (1 + 0.35·ImpasseRepairRate)
 * - Vygotsky / Ericsson Zone of Proximal Development frontier: the optimal
 *   deliberate zone holds recent success in [0.65, 0.85] (65–85% sweet spot)
 * - VanLehn's (1990) impasse-driven schema repair & 4-class bug taxonomy
 *   (misconception · procedural lapse · boundary oversight · attentional slip)
 * - Keith & Frese (2008) Error Management Training positive error climate
 * - FSRS-6 deliberate micro-repair card bridge (bug-severity-calibrated S₀)
 *
 * Actions (zod-discriminated, mirroring exactly the engine operations the
 * DeliberatePracticeStudio performs):
 * - `zpd`: ZPD frontier state from the recent attempt window + current tier
 * - `taxonomy`: VanLehn bug-taxonomy breakdown of the recorded error classes
 * - `effort`: Ericsson Deliberate Effort Index + mastery grade
 * - `cards`: FSRS-6 micro-repair deck for a suite — the same card contract the
 *   studio renders and copies, so headless hosts (MCP / CLI / server) get
 *   byte-identical decks
 *
 * GET returns the calibrated suite catalog (drills + impasse checkpoints).
 *
 * Strictly runtime-neutral (AGENTS.md rule 2): no `node:*` imports; zod at the
 * boundary (rule 5); the engine itself (`@learning-hub/core/deliberate`)
 * performs every computation.
 */

import { z } from 'zod'
import {
  analyzeErrorTaxonomy,
  calculateDeliberateEffortIndex,
  calculateZPDFrontier,
  CALIBRATED_DELIBERATE_SUITES,
  type BugClass,
  type DeliberateEffortMetrics,
  type DeliberatePracticeSuite,
  type ErrorTaxonomyBreakdown,
  type FSRSMicroRepairCard,
  type PracticeDifficultyTier,
  type ZPDFrontierState,
} from '@learning-hub/core/deliberate'
import { ApiError, readJson, withRoute } from '@/lib/api'

const bugClassSchema = z.enum([
  'misconception',
  'procedural_lapse',
  'boundary_oversight',
  'attentional_slip',
]) satisfies z.ZodType<BugClass>

const practiceTierSchema = z.enum([
  'foundational',
  'intermediate',
  'advanced',
  'frontier_stretch',
]) satisfies z.ZodType<PracticeDifficultyTier>

const postDeliberateBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('zpd'),
    /** Recent attempt results (the engine window is the last 5 attempts). */
    recentResults: z.array(z.boolean()).max(100).default([]),
    currentTier: practiceTierSchema,
  }),
  z.object({
    action: z.literal('taxonomy'),
    /** Every bug class recorded this session, in occurrence order. */
    recordedErrors: z.array(bugClassSchema).max(500).default([]),
  }),
  z.object({
    action: z.literal('effort'),
    totalReps: z.number().int().min(0).max(100_000),
    targetedDeficitReps: z.number().int().min(0).max(100_000).default(0),
    impasseRepairsCompleted: z.number().int().min(0).max(100_000).default(0),
  }),
  z.object({
    action: z.literal('cards'),
    suiteId: z.string().min(1),
    /** How many impasse checkpoints the learner repaired: > 0 flips the deck
     * to the repaired-stability tier (same contract as the studio's builder). */
    repairedImpasseCount: z.number().int().min(0).max(1000).default(0),
  }),
])

/**
 * The studio's FSRS-6 micro-repair deck contract, mirroring its builder
 * verbatim: one card per wrong (bug-classed) drill option, stability
 * multiplier 1.35 once any impasse has been repaired, 0.8 otherwise. Kept
 * byte-identical to the studio's rendering/export so the API result and the
 * in-browser manual-mode mirror can never diverge.
 */
function buildMicroRepairCards(
  suite: DeliberatePracticeSuite,
  isRepaired: boolean,
): FSRSMicroRepairCard[] {
  const cards: FSRSMicroRepairCard[] = []
  for (const drill of suite.drills) {
    for (const opt of drill.options) {
      if (!opt.isCorrect && opt.bugClass) {
        cards.push({
          id: `fsrs_${suite.id}_${drill.id}_${opt.id}`,
          suiteId: suite.id,
          drillId: drill.id,
          bugClass: opt.bugClass,
          prompt: `[${suite.title} - Deliberate Impasse]\n${drill.prompt}`,
          erroneousImpasse: `Identified Bug: ${opt.text}\nDiagnostic: ${opt.diagnosticFeedback}`,
          schemaRepairSolution: opt.schemaRepairInstruction || drill.expectedKeyInsight,
          emtReframingMnemonic:
            'Keith & Frese EMT: "Errors are information! The error exposes the exact boundary of your schema."',
          recommendedStabilityMultiplier: isRepaired ? 1.35 : 0.8,
        })
      }
    }
  }
  return cards
}

export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    suites: CALIBRATED_DELIBERATE_SUITES,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, postDeliberateBodySchema)

  if (body.action === 'zpd') {
    // Engine window: the last 5 attempts (Ericsson's rolling-accuracy window).
    const zpd: ZPDFrontierState = calculateZPDFrontier(
      body.recentResults.slice(-5),
      body.currentTier,
    )
    return Response.json({ ok: true, zpd })
  }

  if (body.action === 'taxonomy') {
    const taxonomy: ErrorTaxonomyBreakdown = analyzeErrorTaxonomy(body.recordedErrors)
    return Response.json({ ok: true, taxonomy })
  }

  if (body.action === 'effort') {
    const effort: DeliberateEffortMetrics = calculateDeliberateEffortIndex(
      body.totalReps,
      body.targetedDeficitReps,
      body.impasseRepairsCompleted,
    )
    return Response.json({ ok: true, effort })
  }

  // action === 'cards'
  const suite = CALIBRATED_DELIBERATE_SUITES[body.suiteId]
  if (!suite) {
    throw new ApiError(404, `Unknown deliberate practice suite: ${body.suiteId}`)
  }
  return Response.json({
    ok: true,
    cards: buildMicroRepairCards(suite, body.repairedImpasseCount > 0),
  })
})

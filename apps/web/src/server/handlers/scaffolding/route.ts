/**
 * Runtime-neutral API handler for the Worked-Example Fading & Cognitive Load
 * Scaffolding Studio.
 *
 * Grounded in:
 * - Sweller (1988, 2010) Cognitive Load Theory + Paas & van Merriënboer (1994);
 *   Cowan (2001) 4±1 chunk working-memory budget
 * - Renkl & Atkinson (2003, 2004) 4-stage example-problem fading continuum
 *   (Atkinson 2000 backward chaining; forward/intermediate fading)
 * - Chi et al. (1989) principle-based self-explanation scoring (Renkl 1997,
 *   Catrambone 1998 sub-goal chunking)
 * - Große & Renkl (2007) erroneous-example diagnosis crucible
 * - Kalyuga et al. (2003) expertise-reversal adaptation
 * - FSRS v5 flashcard export bridge
 *
 * The studio's stateful engine (`WorkedExampleSession`) runs SERVER-side via a
 * stateless snapshot protocol: every session action carries the learner's
 * session snapshot, the handler hydrates a REAL engine session from it, the
 * engine itself executes the transition, and the response returns the
 * evaluation result plus the next snapshot. No session state is stored here, so
 * web, native hub-worker, MCP and CLI all share one identical contract.
 *
 * GET returns the calibrated multi-domain problem bank.
 *
 * POST actions (zod-discriminated, mirroring exactly the engine operations the
 * WorkedExampleStudio performs):
 * - `newSession`: fresh engine session state for a problem/stage/expertise
 * - `evaluateStep`: grade + advance the current derivation step (stateful)
 * - `hint`: consume a hint — bumps hintsUsed, recalculates load (stateful)
 * - `setStage` / `setStrategy`: Renkl-Atkinson stage & fading strategy (stateful)
 * - `recordSelfExplanation`: fold a scored self-explanation into the session
 * - `evaluateSelfExplanation`: Chi (1989) keyword/rubric evaluation (pure)
 * - `evaluateErroneous`: Große & Renkl (2007) diagnosis (pure)
 * - `fadingStatuses`: per-step omitted/prompt-type for the whole problem (pure)
 * - `exportCard` / `exportDeck`: FSRS v5 card bridge (pure, single/all steps)
 *
 * Strictly runtime-neutral (AGENTS.md rule 2): no `node:*` imports; zod at the
 * boundary (rule 5); the engine performs every computation.
 */

import { z } from 'zod'
import {
  CALIBRATED_SCAFFOLDING_PROBLEMS,
  evaluateErroneousAttempt,
  evaluateSelfExplanation,
  exportStepToFSRS,
  getStepFadingStatus,
  WorkedExampleSession,
  type CognitiveLoadBreakdown,
  type FadingStrategy,
  type MisconceptionCategory,
  type ScaffoldingSessionState,
  type ScaffoldingStage,
  type WorkedExampleProblem,
} from '@learning-hub/core/scaffolding'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** Renkl-Atkinson stages 1-4 — literal union so the parsed output IS a
 * `ScaffoldingStage` (no casts at the engine boundary). */
const scaffoldingStageSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]) satisfies z.ZodType<ScaffoldingStage>

const fadingStrategySchema = z.enum([
  'backward',
  'forward',
  'adaptive',
]) satisfies z.ZodType<FadingStrategy>

const misconceptionSchema = z.enum([
  'invariant_violation',
  'boundary_edge_case',
  'premature_optimization',
  'flawed_induction',
  'concurrency_race',
  'fallacious_assumption',
]) satisfies z.ZodType<MisconceptionCategory>

const cognitiveLoadSchema = z.object({
  intrinsicLoad: z.number().min(0).max(5),
  extraneousLoad: z.number().min(0).max(5),
  germaneLoad: z.number().min(0).max(5),
  totalLoad: z.number().min(0).max(15),
  workingMemoryCapacity: z.number().min(0).max(10),
  overloadProbability: z.number().min(0).max(1),
  isOverloaded: z.boolean(),
  recommendedIntervention: z.enum([
    'reduce_split_attention',
    'fade_faster',
    'add_worked_example',
    'optimal_flow',
  ]),
}) satisfies z.ZodType<CognitiveLoadBreakdown>

/**
 * A full `WorkedExampleSession` snapshot as produced by the engine's
 * `getState()` — the wire format of the stateless snapshot protocol.
 */
const sessionStateSchema = z.object({
  problemId: z.string().min(1),
  stage: scaffoldingStageSchema,
  strategy: fadingStrategySchema,
  learnerExpertise: z.number().min(-2).max(2),
  completedStepIds: z.array(z.string().min(1)).max(500).default([]),
  currentStepIndex: z.number().int().min(1).max(1000),
  cognitiveLoad: cognitiveLoadSchema,
  hintsUsed: z.number().int().min(0).max(100),
  selfExplanationScores: z.record(z.string(), z.number().min(0).max(1)),
  isCompleted: z.boolean(),
  totalAttempts: z.number().int().min(0).max(100_000),
  successfulAttempts: z.number().int().min(0).max(100_000),
}) satisfies z.ZodType<ScaffoldingSessionState>

const postScaffoldingBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('newSession'),
    problemId: z.string().min(1),
    stage: scaffoldingStageSchema,
    learnerExpertise: z.number().min(-2).max(2).default(0),
  }),
  z.object({
    action: z.literal('evaluateStep'),
    state: sessionStateSchema,
    /** The learner's answer: the chosen scaffold option index ("0", "1", …)
     * for faded-choice steps, the target text for cloze/free-generation steps. */
    answer: z.string().max(4000),
  }),
  z.object({
    action: z.literal('hint'),
    state: sessionStateSchema,
  }),
  z.object({
    action: z.literal('setStage'),
    state: sessionStateSchema,
    stage: scaffoldingStageSchema,
  }),
  z.object({
    action: z.literal('setStrategy'),
    state: sessionStateSchema,
    strategy: fadingStrategySchema,
  }),
  z.object({
    action: z.literal('recordSelfExplanation'),
    state: sessionStateSchema,
    promptId: z.string().min(1),
    score: z.number().min(0).max(1),
  }),
  z.object({
    action: z.literal('evaluateSelfExplanation'),
    problemId: z.string().min(1),
    promptId: z.string().min(1),
    userExplanation: z.string().max(20_000),
  }),
  z.object({
    action: z.literal('evaluateErroneous'),
    problemId: z.string().min(1),
    variantId: z.string().min(1),
    selectedStepIndex: z.number().int().min(1),
    selectedMisconception: misconceptionSchema,
    learnerRepairText: z.string().max(20_000),
  }),
  z.object({
    action: z.literal('fadingStatuses'),
    problemId: z.string().min(1),
    stage: scaffoldingStageSchema,
    strategy: fadingStrategySchema,
  }),
  z.object({
    action: z.literal('exportCard'),
    problemId: z.string().min(1),
    stepIndex: z.number().int().min(1),
    stage: scaffoldingStageSchema,
  }),
  z.object({
    action: z.literal('exportDeck'),
    problemId: z.string().min(1),
    stage: scaffoldingStageSchema,
  }),
])

/** Look up a calibrated problem or fail the route with a client-safe 404. */
function requireProblem(problemId: string): WorkedExampleProblem {
  const problem = CALIBRATED_SCAFFOLDING_PROBLEMS[problemId]
  if (!problem) {
    throw new ApiError(404, `Unknown scaffolding problem: ${problemId}`)
  }
  return problem
}

/**
 * Rebuild a REAL engine session from a state snapshot. The engine keeps its
 * state machine in a compile-time-private field; the snapshot protocol writes
 * it back so the ENGINE (never a handler re-implementation) executes every
 * transition. Array/object fields are copied first so the engine's in-place
 * mutations can never alias the caller's snapshot.
 */
function hydrateSession(snapshot: ScaffoldingSessionState): WorkedExampleSession {
  const session = new WorkedExampleSession(
    snapshot.problemId,
    snapshot.stage,
    snapshot.learnerExpertise,
  )
  const mutable = session as unknown as { state: ScaffoldingSessionState }
  mutable.state = {
    ...snapshot,
    completedStepIds: [...snapshot.completedStepIds],
    selfExplanationScores: { ...snapshot.selfExplanationScores },
  }
  return session
}

export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    problems: CALIBRATED_SCAFFOLDING_PROBLEMS,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, postScaffoldingBodySchema)

  if (body.action === 'newSession') {
    requireProblem(body.problemId)
    const session = new WorkedExampleSession(body.problemId, body.stage, body.learnerExpertise)
    return Response.json({ ok: true, state: session.getState() })
  }

  if (body.action === 'evaluateStep') {
    requireProblem(body.state.problemId)
    const session = hydrateSession(body.state)
    const result = session.evaluateCurrentStepAnswer(body.answer)
    return Response.json({ ok: true, result, state: session.getState() })
  }

  if (body.action === 'hint') {
    requireProblem(body.state.problemId)
    const session = hydrateSession(body.state)
    const hint = session.useHint()
    return Response.json({ ok: true, hint, state: session.getState() })
  }

  if (body.action === 'setStage') {
    requireProblem(body.state.problemId)
    const session = hydrateSession(body.state)
    session.setStage(body.stage)
    return Response.json({ ok: true, state: session.getState() })
  }

  if (body.action === 'setStrategy') {
    requireProblem(body.state.problemId)
    const session = hydrateSession(body.state)
    session.setStrategy(body.strategy)
    return Response.json({ ok: true, state: session.getState() })
  }

  if (body.action === 'recordSelfExplanation') {
    requireProblem(body.state.problemId)
    const session = hydrateSession(body.state)
    session.recordSelfExplanationScore(body.promptId, body.score)
    return Response.json({ ok: true, state: session.getState() })
  }

  if (body.action === 'evaluateSelfExplanation') {
    const problem = requireProblem(body.problemId)
    const prompt = problem.selfExplanationPrompts.find((p) => p.id === body.promptId)
    if (!prompt) {
      throw new ApiError(404, `Unknown self-explanation prompt: ${body.promptId}`)
    }
    return Response.json({
      ok: true,
      result: evaluateSelfExplanation({ userExplanation: body.userExplanation, prompt }),
    })
  }

  if (body.action === 'evaluateErroneous') {
    const problem = requireProblem(body.problemId)
    const variant = problem.erroneousVariants.find((v) => v.id === body.variantId)
    if (!variant) {
      throw new ApiError(404, `Unknown erroneous variant: ${body.variantId}`)
    }
    return Response.json({
      ok: true,
      result: evaluateErroneousAttempt({
        selectedStepIndex: body.selectedStepIndex,
        selectedMisconception: body.selectedMisconception,
        learnerRepairText: body.learnerRepairText,
        erroneousVariant: variant,
      }),
    })
  }

  if (body.action === 'fadingStatuses') {
    const problem = requireProblem(body.problemId)
    const statuses: Record<string, ReturnType<typeof getStepFadingStatus>> = {}
    for (const step of problem.steps) {
      statuses[step.id] = getStepFadingStatus({
        step,
        totalSteps: problem.steps.length,
        stage: body.stage,
        strategy: body.strategy,
      })
    }
    return Response.json({ ok: true, statuses })
  }

  if (body.action === 'exportCard') {
    const problem = requireProblem(body.problemId)
    return Response.json({
      ok: true,
      card: exportStepToFSRS({ problem, stepIndex: body.stepIndex, stage: body.stage }),
    })
  }

  // action === 'exportDeck' — one card per derivation step, in problem order.
  const problem = requireProblem(body.problemId)
  const cards = problem.steps.map((step) =>
    exportStepToFSRS({ problem, stepIndex: step.stepIndex, stage: body.stage }),
  )
  return Response.json({ ok: true, cards })
})

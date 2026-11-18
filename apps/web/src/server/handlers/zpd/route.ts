/**
 * @file apps/web/src/server/handlers/zpd/route.ts
 * @description Runtime-neutral API handler for Dynamic Assessment & Zone of Proximal Development Studio.
 *
 * Implements:
 * - GET /api/zpd — Retrieves canonical multidisciplinary scenarios and schema definitions.
 * - POST /api/zpd — Evaluates answers, serves graduated prompts (Tier 1..5), computes ZPD metrics
 *                   (ADL, PDL, ZPD, LPS, CMI), or exports FSRS-6 calibrated flashcards.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  calculateZpdMetrics,
  evaluateProblemChoice,
  generateFSRSZpdDeck,
  getGraduatedPromptAtTier,
  getZpdScenarioById,
  listZpdScenarios,
  PromptAttemptEventSchema,
} from '@learning-hub/core/dynamic-assessment'
import { readJson, withRoute } from '@/lib/api'

const ZpdActionSchema = z.object({
  action: z
    .enum(['calculate_metrics', 'evaluate_problem', 'request_prompt', 'generate_deck'])
    .default('calculate_metrics'),
  scenarioId: z.string().default('algo_dynamic_programming'),
  phase: z.enum(['pre_test', 'mediated', 'post_test', 'transfer']).optional(),
  selectedOptionIndex: z.number().int().min(0).optional(),
  probeId: z.string().optional(),
  tierLevel: z.number().int().min(1).max(5).optional(),
  preTestScore: z.number().min(0).max(100).optional(),
  postTestScore: z.number().min(0).max(100).optional(),
  promptsConsumed: z.number().int().min(0).max(5).optional(),
  transferScores: z.array(z.number().min(0).max(100)).optional(),
  promptHistory: z.array(PromptAttemptEventSchema).optional(),
})

export const GET = withRoute(async () => {
  const scenarios = listZpdScenarios()

  return Response.json({
    success: true,
    scenarios,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, ZpdActionSchema)
  const scenario = getZpdScenarioById(body.scenarioId) || listZpdScenarios()[0]

  if (body.action === 'evaluate_problem') {
    let targetProblem
    if (body.phase === 'pre_test') {
      targetProblem = scenario.preTestProblem
    } else if (body.phase === 'mediated') {
      targetProblem = scenario.mediatedProblem
    } else if (body.phase === 'post_test') {
      targetProblem = scenario.postTestProblem
    } else if (body.phase === 'transfer' && body.probeId) {
      targetProblem = scenario.transferProbes.find((p) => p.id === body.probeId)
    }

    if (!targetProblem) {
      return Response.json(
        { success: false, error: 'Target problem or probe not found' },
        { status: 404 },
      )
    }

    const evaluation = evaluateProblemChoice(targetProblem, body.selectedOptionIndex ?? 0)

    return Response.json({
      success: true,
      action: body.action,
      evaluation,
    })
  }

  if (body.action === 'request_prompt') {
    const prompt = getGraduatedPromptAtTier(scenario.mediatedProblem, body.tierLevel ?? 1)
    return Response.json({
      success: true,
      action: body.action,
      prompt,
    })
  }

  if (body.action === 'generate_deck') {
    const metrics = calculateZpdMetrics(
      body.preTestScore ?? 25,
      body.postTestScore ?? 75,
      body.promptsConsumed ?? 2,
      body.transferScores ?? [75],
      body.promptHistory ?? [],
    )
    const deck = generateFSRSZpdDeck(scenario, metrics)
    return Response.json({
      success: true,
      action: body.action,
      metrics,
      deck,
    })
  }

  // Action: calculate_metrics (default)
  const metrics = calculateZpdMetrics(
    body.preTestScore ?? 25,
    body.postTestScore ?? 75,
    body.promptsConsumed ?? 2,
    body.transferScores ?? [75],
    body.promptHistory ?? [],
  )

  return Response.json({
    success: true,
    action: body.action,
    metrics,
  })
})

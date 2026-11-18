/**
 * @file apps/web/src/server/handlers/causal/route.ts
 * @description Runtime-neutral API handler for Structural Causal Modeling & Counterfactual Simulator.
 *
 * Implements:
 * - GET /api/causal — Retrieves standard educational SCM, diagnostic questions, and default states.
 * - POST /api/causal — Executes Level 2 intervention simulation, Level 3 counterfactual evaluation,
 *                      d-separation analysis, or curriculum bridge.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  createStandardEducationSCM,
  simulateIntervention,
  evaluateCounterfactual,
  checkDSeparation,
  evaluateBackdoorAdmissibility,
  getStandardDiagnosticProblems,
  evaluateDiagnosticResponses,
  bridgeCausalToCurriculum,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const CausalActionSchema = z.object({
  action: z
    .enum([
      'simulate_intervention',
      'evaluate_counterfactual',
      'check_dsep',
      'grade_diagnostics',
      'bridge_curriculum',
    ])
    .default('evaluate_counterfactual'),
  interventions: z.record(z.string(), z.number()).optional(),
  evidence: z.record(z.string(), z.number()).optional(),
  targetVariableId: z.string().optional(),
  treatmentVar: z.string().optional(),
  outcomeVar: z.string().optional(),
  conditioningSet: z.array(z.string()).optional(),
  diagnosticResponses: z.record(z.string(), z.string()).optional(),
  baseMastery: z.number().min(0).max(1).optional(),
  causalMasteryScore: z.number().min(0).max(100).optional(),
  ladderLevel: z.enum(['L1_ASSOCIATIONAL', 'L2_INTERVENTIONAL', 'L3_COUNTERFACTUAL']).optional(),
})

export const GET = withRoute(async () => {
  const model = createStandardEducationSCM()
  const problems = getStandardDiagnosticProblems()

  return Response.json({
    model,
    problems,
    defaultBaseline: simulateIntervention(model, {}),
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, CausalActionSchema)
  const model = createStandardEducationSCM()

  if (body.action === 'simulate_intervention') {
    const interventionalValues = simulateIntervention(model, body.interventions ?? {})
    return Response.json({
      success: true,
      action: body.action,
      interventionalValues,
    })
  }

  if (body.action === 'evaluate_counterfactual') {
    const result = evaluateCounterfactual(model, {
      modelId: model.id,
      evidence: body.evidence ?? { Aptitude: 50, StudyHours: 6, SleepRest: 50, ExamScore: 52 },
      interventions: body.interventions ?? { StudyHours: 16, SleepRest: 80 },
      targetVariableId: body.targetVariableId ?? 'ExamScore',
    })
    return Response.json({
      success: true,
      action: body.action,
      result,
    })
  }

  if (body.action === 'check_dsep') {
    const treatment = body.treatmentVar ?? 'StudyTechnique'
    const outcome = body.outcomeVar ?? 'ExamScore'
    const zSet = body.conditioningSet ?? ['Aptitude']
    const dsep = checkDSeparation(model, treatment, outcome, zSet)
    const backdoor = evaluateBackdoorAdmissibility(model, treatment, outcome, zSet)
    return Response.json({
      success: true,
      action: body.action,
      dsep,
      backdoor,
    })
  }

  if (body.action === 'grade_diagnostics') {
    const assessment = evaluateDiagnosticResponses(body.diagnosticResponses ?? {})
    const bridge = bridgeCausalToCurriculum(
      body.baseMastery ?? 0.75,
      assessment.overallMasteryScore,
      assessment.ladderLevelAchieved,
    )
    return Response.json({
      success: true,
      action: body.action,
      assessment,
      bridge,
    })
  }

  // Action: bridge_curriculum
  const bridge = bridgeCausalToCurriculum(
    body.baseMastery ?? 0.75,
    body.causalMasteryScore ?? 85,
    body.ladderLevel ?? 'L3_COUNTERFACTUAL',
  )
  return Response.json({
    success: true,
    action: body.action,
    bridge,
  })
})

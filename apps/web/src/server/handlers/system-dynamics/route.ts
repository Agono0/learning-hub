/**
 * Runtime-neutral API handler for System Dynamics & Feedback Loop Modeling Studio
 *
 * Grounded in:
 * - Jay Forrester (1968, 1971) Principles of Systems
 * - John D. Sterman (2000) Business Dynamics
 * - Donella H. Meadows (2008) Thinking in Systems
 */

import { z } from 'zod'
import {
  CANONICAL_SYSTEM_DYNAMICS_SCENARIOS,
  evaluateLearnerModel,
  generateSystemDynamicsFSRSDeck,
  runEulerSimulation,
  LearnerModelHypothesisSchema,
} from '@learning-hub/core/system-dynamics'
import { readJson, withRoute } from '@/lib/api'

const postSystemDynamicsBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('evaluate'),
    hypothesis: LearnerModelHypothesisSchema,
  }),
  z.object({
    action: z.literal('simulate'),
    scenarioId: z.string(),
    stepsCount: z.number().int().min(5).max(300).default(50),
    dt: z.number().min(0.01).max(10).default(1.0),
    policyMultipliers: z.record(z.string(), z.number()).optional(),
  }),
  z.object({
    action: z.literal('deck'),
    scenarioId: z.string(),
    sdiBaseline: z.number().min(0).max(100).default(85),
  }),
])

export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    scenarios: CANONICAL_SYSTEM_DYNAMICS_SCENARIOS,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, postSystemDynamicsBodySchema)

  if (body.action === 'evaluate') {
    const scenario =
      CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.hypothesis.scenarioId) ??
      CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
    const evaluation = evaluateLearnerModel(scenario, body.hypothesis)
    const deck = generateSystemDynamicsFSRSDeck(scenario, evaluation)
    return Response.json({
      ok: true,
      scenarioTitle: scenario.title,
      evaluation,
      deck,
    })
  }

  if (body.action === 'simulate') {
    const scenario =
      CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.scenarioId) ??
      CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
    const run = runEulerSimulation(scenario, body.stepsCount, body.dt, {
      flowRateMultipliers: body.policyMultipliers,
    })
    return Response.json({
      ok: true,
      scenarioTitle: scenario.title,
      simulationRun: run,
    })
  }

  if (body.action === 'deck') {
    const scenario =
      CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.scenarioId) ??
      CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
    const mockEvaluation = {
      sfdr: body.sdiBaseline,
      flia: body.sdiBaseline,
      dam: body.sdiBaseline,
      ars: body.sdiBaseline,
      sdi: body.sdiBaseline,
      maturityTier:
        body.sdiBaseline >= 85 ? ('leverage_strategist' as const) : ('dynamic_simulator' as const),
      strengths: ['Baseline evaluated from direct prompt invocation.'],
      systemicFeedback: [],
      archetypeDiscrepancies: [],
      leveragePointAnalysis: 'Calibrated deck from systems dynamics scenario specifications.',
    }
    const deck = generateSystemDynamicsFSRSDeck(scenario, mockEvaluation)
    return Response.json({
      ok: true,
      deck,
    })
  }

  return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 })
})

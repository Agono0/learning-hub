/**
 * Runtime-neutral API handler for Complex Problem Solving (CPS) Micro-World Studio
 *
 * Grounded in:
 * - Dietrich Dörner (1996) The Logic of Failure
 * - Frensch & Funke (1995) Complex Problem Solving: The European Perspective
 * - Jens Rasmussen (1983) Skills, Rules, and Knowledge (SRK) Framework
 */

import { z } from 'zod'
import {
  getMicroWorldScenario,
  listMicroWorldScenarios,
  simulateMicroWorldStep,
  evaluateCPSSession,
  generateCPSFSRSDeck,
  MicroWorldStateSchema,
  CPSSessionEvaluationSchema,
} from '@learning-hub/core/complex-problem-solving'
import { readJson, withRoute } from '@/lib/api'

const postCPSBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('step'),
    scenarioId: z.string(),
    currentState: MicroWorldStateSchema,
    selectedPolicyIds: z.array(z.string()),
    inspectedVariableIds: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal('evaluate'),
    scenarioId: z.string(),
    finalState: MicroWorldStateSchema,
  }),
  z.object({
    action: z.literal('deck'),
    scenarioId: z.string(),
    evaluation: CPSSessionEvaluationSchema.optional(),
  }),
])

export const GET = withRoute(async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (id) {
    const scenario = getMicroWorldScenario(id)
    if (!scenario) {
      return Response.json({ ok: false, error: 'Scenario not found' }, { status: 404 })
    }
    return Response.json({ ok: true, scenario })
  }

  return Response.json({
    ok: true,
    scenarios: listMicroWorldScenarios(),
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, postCPSBodySchema)

  if (body.action === 'step') {
    const result = simulateMicroWorldStep(
      body.scenarioId,
      body.currentState,
      body.selectedPolicyIds,
      body.inspectedVariableIds || [],
    )
    return Response.json({ ok: true, result })
  }

  if (body.action === 'evaluate') {
    const evaluation = evaluateCPSSession(body.scenarioId, body.finalState)
    const deck = generateCPSFSRSDeck(body.scenarioId, evaluation)
    return Response.json({
      ok: true,
      evaluation,
      deck,
    })
  }

  if (body.action === 'deck') {
    const deck = generateCPSFSRSDeck(body.scenarioId, body.evaluation)
    return Response.json({
      ok: true,
      deck,
    })
  }

  return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 })
})

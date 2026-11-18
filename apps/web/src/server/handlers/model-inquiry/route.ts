/**
 * Runtime-neutral API handler for Model-Based Inquiry & Gedankenexperiment Studio
 *
 * Grounded in:
 * - John Clement (2008) Creative Model Construction in Scientists and Students
 * - Nancy J. Nersessian (2002) Model-Based Reasoning in Science
 * - Philip N. Johnson-Laird (1983) Mental Models
 */

import { z } from 'zod'
import {
  getGedankenScenario,
  listGedankenScenarios,
  perturbExtremeCase,
  simulateMentalAnimation,
  evaluateInquirySession,
  generateModelInquiryFsrsDeck,
  InquirySessionInputSchema,
} from '@learning-hub/core/model-inquiry'
import { readJson, withRoute } from '@/lib/api'

const postModelInquiryBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('perturb'),
    scenarioId: z.string(),
    extremeCaseId: z.string(),
    parameterLimit: z.string().optional(),
  }),
  z.object({
    action: z.literal('simulate'),
    scenarioId: z.string(),
    stepIds: z.array(z.string()),
  }),
  z.object({
    action: z.literal('evaluate'),
    session: InquirySessionInputSchema,
  }),
  z.object({
    action: z.literal('deck'),
    scenarioId: z.string(),
  }),
])

export const GET = withRoute(async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (id) {
    const scenario = getGedankenScenario(id)
    if (!scenario) {
      return Response.json({ ok: false, error: 'Scenario not found' }, { status: 404 })
    }
    return Response.json({ ok: true, scenario })
  }

  return Response.json({
    ok: true,
    scenarios: listGedankenScenarios(),
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, postModelInquiryBodySchema)

  if (body.action === 'perturb') {
    const result = perturbExtremeCase(body.scenarioId, body.extremeCaseId, body.parameterLimit)
    return Response.json({ ok: true, result })
  }

  if (body.action === 'simulate') {
    const result = simulateMentalAnimation(body.scenarioId, body.stepIds)
    return Response.json({ ok: true, result })
  }

  if (body.action === 'evaluate') {
    const evaluation = evaluateInquirySession(body.session)
    const deck = generateModelInquiryFsrsDeck(body.session.scenarioId, evaluation)
    return Response.json({
      ok: true,
      evaluation,
      deck,
    })
  }

  if (body.action === 'deck') {
    const deck = generateModelInquiryFsrsDeck(body.scenarioId)
    return Response.json({
      ok: true,
      deck,
    })
  }

  return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 })
})

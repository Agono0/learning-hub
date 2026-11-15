/**
 * /api/cognitive/flow-state — Flow State & Ultradian Rhythm session assessment.
 *
 * GET  → Quick assessment of current focus block and ultradian phase.
 * POST → Evaluate session telemetry (accuracy, latency, strain) for flow zone & recommendations.
 */
import { z } from 'zod'
import { evaluateFlowState, sessionTelemetrySchema } from '@learning-hub/core'
import { readJson, readQuery, withRoute } from '@/lib/api'

const flowQuerySchema = z.object({
  elapsedMinutes: z.coerce.number().min(0).default(0),
  accuracy: z.coerce.number().min(0).max(1).default(0.85),
})

export const GET = withRoute(async (req: Request) => {
  const { elapsedMinutes, accuracy } = readQuery(req, flowQuerySchema)
  const evaluation = evaluateFlowState({
    accuracy,
    averageLatencyMs: 2500,
    expectedLatencyMs: 2500,
    cardsAnswered: Math.round(elapsedMinutes * 2),
    elapsedFocusMinutes: elapsedMinutes,
  })

  return Response.json({ ok: true, flow: evaluation })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, sessionTelemetrySchema)
  const evaluation = evaluateFlowState(body)

  return Response.json({ ok: true, flow: evaluation })
})

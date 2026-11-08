/**
 * /api/cognitive/load — Real-time Cognitive Load telemetry, CLI evaluation & flow intervention.
 */
import { z } from 'zod'
import { evaluateCognitiveLoad } from '@learning-hub/core'
import { getRecentCognitiveTelemetry, recordCognitiveTelemetryEvent } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const telemetryInputSchema = z.object({
  cardId: z.number().int().positive().optional(),
  responseLatencyMs: z.number().nonnegative(),
  baselineLatencyMs: z.number().nonnegative().optional(),
  keystrokeTimestamps: z.array(z.number()).optional(),
  backspaceCount: z.number().int().nonnegative().optional(),
  recentErrorCount: z.number().int().nonnegative().optional(),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const cardId = url.searchParams.get('cardId') ? Number(url.searchParams.get('cardId')) : undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 20

  const events = getRecentCognitiveTelemetry(limit, cardId)
  return Response.json({
    ok: true,
    events,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, telemetryInputSchema)

  // 1. Calculate Cognitive Load Index and determine Flow Zone
  const evaluation = evaluateCognitiveLoad({
    cardId: body.cardId ?? 0,
    responseLatencyMs: body.responseLatencyMs,
    baselineLatencyMs: body.baselineLatencyMs,
    keystrokeTimestamps: body.keystrokeTimestamps,
    backspaceCount: body.backspaceCount,
    recentErrorCount: body.recentErrorCount,
  })

  // 2. Persist event telemetry
  const event = recordCognitiveTelemetryEvent({
    cardId: body.cardId,
    responseLatencyMs: body.responseLatencyMs,
    hesitationVariance: body.keystrokeTimestamps ? 100 : undefined,
    editChurnCount: body.backspaceCount ?? 0,
    estimatedCli: evaluation.cli,
    flowZone: evaluation.flowZone,
    interventionApplied: evaluation.intervention,
  })

  return Response.json({
    ok: true,
    evaluation,
    eventId: event.id,
  })
})

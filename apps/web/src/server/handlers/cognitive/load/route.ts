/**
 * /api/cognitive/load — Real-time Cognitive Load telemetry, CLI evaluation & flow intervention.
 *
 * GET  → recent telemetry events (optionally for one card).
 * POST → evaluate one answer's latency / keystroke rhythm / edit churn into a
 *        Cognitive Load Index + flow zone + suggested intervention, and append the
 *        event (append-only telemetry). The stored hesitation variance is the real
 *        inter-keystroke jitter, not a placeholder.
 */
import { z } from 'zod'
import { computeKeystrokeJitter, evaluateCognitiveLoad } from '@learning-hub/core'
import {
  cardExists,
  getRecentCognitiveTelemetry,
  recordCognitiveTelemetryEvent,
} from '@learning-hub/db'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'

const telemetryInputSchema = z.object({
  cardId: z.number().int().positive().optional(),
  responseLatencyMs: z.number().nonnegative().max(3_600_000),
  baselineLatencyMs: z.number().positive().max(3_600_000).optional(),
  keystrokeTimestamps: z.array(z.number().nonnegative()).max(5000).optional(),
  backspaceCount: z.number().int().nonnegative().optional(),
  recentErrorCount: z.number().int().nonnegative().optional(),
})

const telemetryQuerySchema = z.object({
  cardId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
})

export const GET = withRoute(async (req: Request) => {
  const { cardId, limit } = readQuery(req, telemetryQuerySchema)
  return Response.json({ ok: true, events: getRecentCognitiveTelemetry(limit, cardId) })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, telemetryInputSchema)
  // Telemetry rows FK onto cards — an unknown id is the caller's error, not a 500.
  if (body.cardId !== undefined && !cardExists(body.cardId)) {
    throw new ApiError(404, 'card not found')
  }
  // Keystrokes may arrive out of order from batched input events — sort before
  // measuring intervals (negative gaps would inflate the jitter).
  const keystrokes = body.keystrokeTimestamps
    ? [...body.keystrokeTimestamps].sort((a, b) => a - b)
    : undefined

  const evaluation = evaluateCognitiveLoad({
    cardId: body.cardId ?? 0,
    responseLatencyMs: body.responseLatencyMs,
    baselineLatencyMs: body.baselineLatencyMs,
    keystrokeTimestamps: keystrokes,
    backspaceCount: body.backspaceCount,
    recentErrorCount: body.recentErrorCount,
  })

  const event = recordCognitiveTelemetryEvent({
    cardId: body.cardId,
    responseLatencyMs: Math.round(body.responseLatencyMs),
    hesitationVariance: keystrokes
      ? Math.round(computeKeystrokeJitter(keystrokes) * 100) / 100
      : undefined,
    editChurnCount: body.backspaceCount ?? 0,
    estimatedCli: evaluation.cli,
    flowZone: evaluation.flowZone,
    interventionApplied: evaluation.intervention,
  })

  return Response.json({ ok: true, evaluation, eventId: event.id })
})

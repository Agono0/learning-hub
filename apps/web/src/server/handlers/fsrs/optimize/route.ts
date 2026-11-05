/**
 * /api/fsrs/optimize — FSRS-6 evaluation, in-app 21-weight optimizer, custom
 * parameter import/reset, and optional card history rescheduling.
 *
 * GET  ?deckId=<id>  → baseline vs active Log-Loss, 10-bin RMSE, retention, custom weights
 * POST { deckId?, mode: 'optimize'|'set'|'reset', weights?, desiredRetention?, reschedule? }
 */
import { z } from 'zod'
import { fsrsWeightsSchema } from '@learning-hub/core'
import { getFsrsStatus, optimizeAndPersistFsrs } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const optimizeBodySchema = z.object({
  deckId: z.number().int().positive().optional(),
  mode: z.enum(['optimize', 'set', 'reset']).default('optimize'),
  weights: fsrsWeightsSchema.optional(),
  desiredRetention: z.number().nullable().optional(),
  reschedule: z.boolean().optional().default(false),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const rawDeckId = url.searchParams.get('deckId')
  let deckId: number | undefined
  if (rawDeckId !== null && rawDeckId !== '') {
    const parsed = Number(rawDeckId)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ApiError(400, 'deckId must be a positive integer')
    }
    deckId = parsed
  }
  const status = getFsrsStatus({ deckId })
  return Response.json({ ok: true, ...status })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, optimizeBodySchema)
  if (body.mode === 'set' && !body.weights) {
    throw new ApiError(400, 'weights are required when mode is "set"')
  }
  const result = await optimizeAndPersistFsrs({
    deckId: body.deckId,
    mode: body.mode,
    weights: body.weights,
    desiredRetention: body.desiredRetention,
    reschedule: body.reschedule,
  })
  const status = getFsrsStatus({ deckId: body.deckId })
  return Response.json({ ok: true, ...result, status })
})

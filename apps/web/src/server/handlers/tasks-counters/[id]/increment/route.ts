/**
 * Tasks handlers batch D (S3-19 / S3-91) — counter taps.
 *
 * POST /api/tasks-counters/[id]/increment `{ day?, by? }` — upserts the
 * (counter, day) row ADDING `by` (default 1); repeated taps accumulate.
 */
import { calendarDay } from '@/lib/query-params'
import { z } from 'zod'
import { incrementCounter } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../../tasks/_shared'

const bodySchema = z.object({
  day: calendarDay.optional(),
  by: z.number().int().min(1).max(1000).default(1),
})

export const POST = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, bodySchema)
    const log = incrementCounter(id, body.day ?? new Date().toISOString().slice(0, 10), body.by)
    return Response.json({ log })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

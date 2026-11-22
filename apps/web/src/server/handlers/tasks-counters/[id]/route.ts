/**
 * Tasks handlers batch D (S3-19 / S3-91) — one simple counter.
 *
 * GET    /api/tasks-counters/[id]?from=&to= — the counter + its daily log
 *        (S3-90's streak math reads the per-day counts from here).
 * PATCH  /api/tasks-counters/[id] — `{ label?, color?, archived? }`.
 * DELETE /api/tasks-counters/[id] — cascades the daily log.
 */
import { z } from 'zod'
import { deleteCounterRow, listCounterLogs, listCounters, updateCounterRow } from '@learning-hub/db'
import { readJson, readQuery, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../tasks/_shared'

/** GET /api/tasks-counters/[id] — counter + daily logs. */
export async function GET(req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const counter = listCounters({ includeArchived: true }).find((c) => c.id === id)
  if (!counter) return Response.json({ error: 'Counter not found' }, { status: 404 })
  const q = readQuery(
    req,
    z.object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  )
  return Response.json({
    counter,
    logs: listCounterLogs({ counterId: id, from: q.from, to: q.to }),
  })
}

const patchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  color: z.string().max(40).nullable().optional(),
  archived: z.boolean().optional(),
})

/** PATCH /api/tasks-counters/[id]. */
export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, patchSchema)
    const counter = updateCounterRow(id, body)
    if (!counter) return Response.json({ error: 'Counter not found' }, { status: 404 })
    return Response.json({ counter })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/** DELETE /api/tasks-counters/[id]. */
export async function DELETE(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteCounterRow(id)
  if (!deleted) return Response.json({ error: 'Counter not found' }, { status: 404 })
  return Response.json({ deleted: true })
}

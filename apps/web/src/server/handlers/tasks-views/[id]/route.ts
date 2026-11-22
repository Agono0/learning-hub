/**
 * Tasks handlers batch B (S3-17) — one saved task view / board.
 * PATCH  /api/tasks-views/[id] — `{ name?, kind?, filter?, sortBy?, groupBy? }`.
 * DELETE /api/tasks-views/[id].
 */
import { z } from 'zod'
import { deleteTaskViewRow, updateTaskViewRow } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../tasks/_shared'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(['kanban', 'eisenhower', 'custom']).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
  sortBy: z.string().max(40).nullable().optional(),
  groupBy: z.string().max(40).nullable().optional(),
})

/** PATCH /api/tasks-views/[id]. */
export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, patchSchema)
    const view = updateTaskViewRow(id, body)
    if (!view) return Response.json({ error: 'View not found' }, { status: 404 })
    return Response.json({ view })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/** DELETE /api/tasks-views/[id]. */
export async function DELETE(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteTaskViewRow(id)
  if (!deleted) return Response.json({ error: 'View not found' }, { status: 404 })
  return Response.json({ deleted: true })
}

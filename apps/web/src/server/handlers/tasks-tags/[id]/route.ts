/**
 * Tasks handlers batch B (S3-17) — one tag.
 *
 * PATCH  /api/tasks-tags/[id] — `{ name?, color? }` (renames re-normalize;
 *        a name clash is a 409).
 * DELETE /api/tasks-tags/[id] — unlinks every task, then removes the row.
 */
import { z } from 'zod'
import { deleteTaskTag, updateTaskTag } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../tasks/_shared'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(40).nullable().optional(),
})

/** PATCH /api/tasks-tags/[id]. */
export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, patchSchema)
    const tag = updateTaskTag(id, body)
    if (!tag) return Response.json({ error: 'Tag not found' }, { status: 404 })
    return Response.json({ tag })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/** DELETE /api/tasks-tags/[id]. */
export async function DELETE(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteTaskTag(id)
  if (!deleted) return Response.json({ error: 'Tag not found' }, { status: 404 })
  return Response.json({ deleted: true })
}

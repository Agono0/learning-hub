/**
 * Tasks handlers batch C (S3-18) — worklog inline corrections.
 *
 * DELETE /api/tasks-time/[id] — removes one erroneous session row and
 * re-derives the task's per-day map (S3-28's inline correction path; the
 * correction deletes the offending row, which is how SP's worklog edits
 * behave — the map is recomputed, never patched by hand).
 */
import { deleteTimeLog } from '@learning-hub/db'
import { routeId, type IdContext } from '../../tasks/_shared'

export async function DELETE(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteTimeLog(id)
  if (!deleted) {
    return Response.json({ error: 'Time log not found' }, { status: 404 })
  }
  return Response.json({ deleted: true })
}

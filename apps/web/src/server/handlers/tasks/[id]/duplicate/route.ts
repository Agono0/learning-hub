/**
 * Tasks handlers (S3-16) — POST /api/tasks/[id]/duplicate.
 *
 * SP-style duplicate: `(copy)` suffix, fresh ids, not done, empty time map;
 * subtasks and tag links are copied (201 with the new task).
 */
import { duplicateTaskItem } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, taskNotFound, type IdContext } from '../../_shared'

export const POST = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const task = await duplicateTaskItem(id)
    if (!task) return taskNotFound()
    return Response.json({ task }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

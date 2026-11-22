/**
 * Tasks handlers (S3-16) — POST /api/tasks/[id]/complete.
 *
 * Marks the task done (SP parent completion sweeps its open subtasks).
 * Completing a won't-do task is a domain error (400, code
 * `wontdo-cannot-complete`) — reopen it first.
 */
import { completeTaskItem } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, taskNotFound, type IdContext } from '../../_shared'

export const POST = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const task = await completeTaskItem(id)
    if (!task) return taskNotFound()
    return Response.json({ task })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

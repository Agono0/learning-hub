/**
 * Tasks handlers (S3-16) — POST /api/tasks/[id]/reopen.
 *
 * Reopens a done task or un-marks a won't-do task; reopening also clears
 * any archive tier row so the task is fully back on the active lists.
 */
import { reopenTaskItem } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, taskNotFound, type IdContext } from '../../_shared'

export const POST = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const task = await reopenTaskItem(id)
    if (!task) return taskNotFound()
    return Response.json({ task })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

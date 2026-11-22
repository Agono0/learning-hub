/**
 * Tasks handlers (S3-16) — POST /api/tasks/[id]/restore.
 *
 * Returns an archived task to the active lists: the tier row is removed and
 * the task keeps its original done/open state and timestamps (S3-11 parity).
 */
import { restoreTaskItem } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { routeId, type IdContext } from '../../_shared'

export const POST = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const restored = await restoreTaskItem(id)
  if (!restored) {
    return Response.json({ error: 'Task is not archived', restored: false }, { status: 404 })
  }
  return Response.json({ restored: true })
})

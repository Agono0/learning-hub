/**
 * Tasks handlers batch B (S3-17) — POST /api/tasks-projects/[id]/restore.
 * The trophy-reopen flow (S3-75): archivedAt clears, project is active.
 */
import { restoreTaskProjectRow } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { routeId, type IdContext } from '../../../tasks/_shared'

export const POST = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const project = restoreTaskProjectRow(id)
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
  return Response.json({ project })
})

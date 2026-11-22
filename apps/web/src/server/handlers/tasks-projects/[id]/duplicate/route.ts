/**
 * Tasks handlers batch B (S3-17) — POST /api/tasks-projects/[id]/duplicate.
 * Copies the project with its OPEN tasks (done/won't-do stay behind);
 * duplicating an archived project is a 400 — restore it first.
 */
import { duplicateTaskProjectRow } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../../tasks/_shared'

export const POST = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const project = duplicateTaskProjectRow(id)
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
    return Response.json({ project }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

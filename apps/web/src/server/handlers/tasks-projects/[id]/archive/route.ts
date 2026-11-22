/**
 * Tasks handlers batch B (S3-17) — POST /api/tasks-projects/[id]/archive.
 *
 * Shelving is idempotent; `archivedAt` records when (finish-day and the
 * trophy-reopen flow, S3-75, read it).
 */
import { archiveTaskProjectRow } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { routeId, type IdContext } from '../../../tasks/_shared'

export const POST = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const project = archiveTaskProjectRow(id)
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
  return Response.json({ project })
})

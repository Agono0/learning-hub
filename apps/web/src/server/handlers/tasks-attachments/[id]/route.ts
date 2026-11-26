/**
 * Tasks handlers (S3-21/S3-37) — one attachment.
 * DELETE /api/tasks-attachments/[id].
 */
import { withRoute } from '@/lib/api'
import { deleteTaskAttachment } from '@learning-hub/db'
import { routeId, type IdContext } from '../../tasks/_shared'

export const DELETE = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteTaskAttachment(id)
  if (!deleted) {
    return Response.json({ error: 'Attachment not found' }, { status: 404 })
  }
  return Response.json({ deleted: true })
})

/**
 * Tasks handlers (S3-21/S3-37) — task attachments.
 *
 * GET  /api/tasks/[id]/attachments — the task's files/URLs/commands.
 * POST /api/tasks/[id]/attachments — `{ type: file|url|command, value, title? }`.
 */
import { z } from 'zod'
import { createTaskAttachment, getTaskItem, listTaskAttachments } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, taskNotFound, type IdContext } from '../../../tasks/_shared'

/** GET /api/tasks/[id]/attachments. */
export async function GET(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  if (!getTaskItem(id)) return taskNotFound()
  return Response.json({ attachments: listTaskAttachments(id) })
}

const createSchema = z.object({
  type: z.enum(['file', 'url', 'command']),
  value: z.string().trim().min(1).max(2000),
  title: z.string().trim().max(200).nullable().optional(),
})

/** POST /api/tasks/[id]/attachments — 201 with the row. */
export const POST = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  if (!getTaskItem(id)) return taskNotFound()
  try {
    const body = await readJson(req, createSchema)
    const attachment = createTaskAttachment({ taskId: id, ...body })
    return Response.json({ attachment }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/**
 * Tasks handlers (S3-16) — one task: read, patch, delete.
 *
 * GET    /api/tasks/[id] — the task with its tags joined (404 when missing).
 * PATCH  /api/tasks/[id] — a validated UpdateTaskInput patch (tag ids in the
 *   body REPLACE the link rows; integrity rules apply — no self-parent, no
 *   deeper nesting, referenced rows must exist).
 * DELETE /api/tasks/[id]?via=task-row|bulk|context-menu|finish-day —
 *   removes the task (cascades to subtasks/links/reminders/attachments/
 *   time logs/archive tiers) and returns the trash entry (S3-12) the client
 *   stores for undo/restore.
 */
import { z } from 'zod'
import { buildTrashEntry, deleteTaskItem, getTaskItem, updateTaskItem } from '@learning-hub/db'
import { updateTaskInputSchema } from '@learning-hub/core'
import { readJson, readQuery, withRoute } from '@/lib/api'
import { taskErrorResponse, taskNotFound, routeId, type IdContext } from '../_shared'

/** GET /api/tasks/[id]. */
export async function GET(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const task = getTaskItem(id)
  if (!task) return taskNotFound()
  return Response.json({ task })
}

const patchSchema = updateTaskInputSchema

/** PATCH /api/tasks/[id]. */
export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  if (!getTaskItem(id)) return taskNotFound()
  try {
    const patch = await readJson(req, patchSchema)
    const task = updateTaskItem(id, patch)
    if (!task) return taskNotFound()
    return Response.json({ task })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

const deleteQuerySchema = z.object({
  via: z.enum(['task-row', 'bulk', 'context-menu', 'finish-day']).default('task-row'),
})

/** DELETE /api/tasks/[id] — delete + return the trash entry for undo. */
export async function DELETE(req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const q = readQuery(req, deleteQuerySchema)
    const trash = buildTrashEntry(id, q.via)
    if (!trash) return taskNotFound()
    const deleted = deleteTaskItem(id)
    return Response.json({ deleted, trash })
  } catch (err) {
    return taskErrorResponse(err)
  }
}

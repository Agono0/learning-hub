/**
 * Tasks handlers batch D (S3-19) — one task reminder.
 * PATCH  /api/tasks-reminders/[id] — `{ remindAt? }` for at_time rows,
 *        `{ offsetMs? }` for relative rows, `exactAlarm?` for both.
 * DELETE /api/tasks-reminders/[id].
 */
import { z } from 'zod'
import { deleteTaskReminderRow, updateTaskReminderRow } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../tasks/_shared'

const patchSchema = z.object({
  remindAt: z.string().min(1).nullable().optional(),
  offsetMs: z.number().int().nullable().optional(),
  exactAlarm: z.boolean().optional(),
})

/** PATCH /api/tasks-reminders/[id]. */
export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, patchSchema)
    const reminder = updateTaskReminderRow(id, body)
    if (!reminder) return Response.json({ error: 'Reminder not found' }, { status: 404 })
    return Response.json({ reminder })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/** DELETE /api/tasks-reminders/[id]. */
export async function DELETE(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteTaskReminderRow(id)
  if (!deleted) return Response.json({ error: 'Reminder not found' }, { status: 404 })
  return Response.json({ deleted: true })
}

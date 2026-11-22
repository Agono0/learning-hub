/**
 * Tasks handlers batch D (S3-19) — per-task reminders.
 *
 * GET  /api/tasks-reminders?taskId=&before=ISO — reminder reads: by task,
 *      or the SCHEDULE view (`before` arms the scheduler with everything
 *      due up to that moment; relative reminders come back decoded into
 *      core's remindAt/offsetMs shape).
 * POST /api/tasks-reminders — create from the core reminder input
 *      (`at_time` needs remindAt; `relative` needs offsetMs — the core
 *      schema refines this).
 */
import { z } from 'zod'
import { createTaskReminderRow, listTaskReminders } from '@learning-hub/db'
import { readJson, readQuery, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

const querySchema = z.object({
  taskId: z.coerce.number().int().positive().optional(),
  before: z.string().min(1).optional(),
})

/** GET /api/tasks-reminders — by task or the scheduler window. */
export async function GET(req: Request) {
  const q = readQuery(req, querySchema)
  return Response.json({ reminders: listTaskReminders({ taskId: q.taskId, before: q.before }) })
}

const createSchema = z.object({
  taskId: z.number().int().positive(),
  type: z.enum(['at_time', 'relative']),
  remindAt: z.string().min(1).nullable().optional(),
  offsetMs: z.number().int().nullable().optional(),
  exactAlarm: z.boolean().optional(),
})

/** POST /api/tasks-reminders — 201 with the decoded reminder. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, createSchema)
    const reminder = createTaskReminderRow(body)
    return Response.json({ reminder }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/**
 * Tasks handlers batch C (S3-18) — time tracking tick.
 *
 * POST /api/tasks-time/tick `{ taskId, sessionMs, startedAt?, source? }` —
 * appends one tracked session (the append-only `task_time_logs` row) and
 * re-derives the task's per-day map (S3-10 merge rule — the map is never
 * hand-patched). Tracking a done/won't-do task is a 400 (SP stops the
 * clock on completion); sub-second/over-cap sessions return
 * `{ skipped: true }` (a tick that quantizes to nothing is a no-op).
 */
import { z } from 'zod'
import { getTaskItem, insertTimeLog } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../../tasks/_shared'

const bodySchema = z.object({
  taskId: z.number().int().positive(),
  sessionMs: z.number().int().positive(),
  /** ISO start of the session; defaults to now (the day key derives from it). */
  startedAt: z.string().min(1).optional(),
  source: z.enum(['manual', 'focus', 'idle']).default('manual'),
})

export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, bodySchema)
    const task = getTaskItem(body.taskId)
    if (!task) return Response.json({ error: 'Task not found' }, { status: 404 })
    if (task.isDone || task.wonthado) {
      return Response.json(
        { error: 'Completed and won\u2019t-do tasks are not trackable.' },
        { status: 400 },
      )
    }
    const log = insertTimeLog({
      taskId: body.taskId,
      day: (body.startedAt ?? new Date().toISOString()).slice(0, 10),
      sessionMs: body.sessionMs,
      startedAt: body.startedAt ?? null,
      source: body.source,
    })
    if (!log) return Response.json({ skipped: true })
    const fresh = getTaskItem(body.taskId)!
    return Response.json({ log, task: fresh }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

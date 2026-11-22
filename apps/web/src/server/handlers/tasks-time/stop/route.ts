/**
 * Tasks handlers batch C (S3-18) — time tracking stop.
 *
 * POST /api/tasks-time/stop `{ taskId, sessionMs? }` — the "clock stops"
 * endpoint: when `sessionMs` is present the remaining buffer is flushed as
 * one final session row (same append path as tick); the response always
 * carries the task's authoritative per-day map so the client state
 * converges (the map is server-derived, never client-computed).
 */
import { z } from 'zod'
import { getTaskItem, insertTimeLog } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../../tasks/_shared'

const bodySchema = z.object({
  taskId: z.number().int().positive(),
  /** Final buffer to flush (optional — a stop without time just summarizes). */
  sessionMs: z.number().int().positive().optional(),
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
    let flushed = null
    if (body.sessionMs !== undefined) {
      flushed = insertTimeLog({
        taskId: body.taskId,
        day: (body.startedAt ?? new Date().toISOString()).slice(0, 10),
        sessionMs: body.sessionMs,
        startedAt: body.startedAt ?? null,
        source: body.source,
      })
    }
    const fresh = getTaskItem(body.taskId)!
    return Response.json({ flushed, task: fresh })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

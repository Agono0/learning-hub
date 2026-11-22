/**
 * Tasks handlers batch C (S3-18) — time log reads.
 *
 * GET /api/tasks-time?taskId=&day=&from=&to= — the append-only session
 * history (newest first) plus the filtered total, for the tick indicator
 * (S3-77) and inline worklog corrections (S3-28).
 */
import { listTimeLogs, sumTimeLogs } from '@learning-hub/db'
import { readQuery } from '@/lib/api'
import { z } from 'zod'

const querySchema = z.object({
  taskId: z.coerce.number().int().positive().optional(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export async function GET(req: Request) {
  const q = readQuery(req, querySchema)
  const filter = { taskId: q.taskId, day: q.day, from: q.from, to: q.to }
  return Response.json({ logs: listTimeLogs(filter), totalMs: sumTimeLogs(filter) })
}

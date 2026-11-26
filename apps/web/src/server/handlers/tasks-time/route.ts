/**
 * Tasks handlers batch C (S3-18) — time log reads.
 *
 * GET /api/tasks-time?taskId=&day=&from=&to= — the append-only session
 * history (newest first) plus the filtered total, for the tick indicator
 * (S3-77) and inline worklog corrections (S3-28).
 */
import { calendarDay } from '@/lib/query-params'
import { listTimeLogs, sumTimeLogs } from '@learning-hub/db'
import { readQuery, withRoute } from '@/lib/api'
import { z } from 'zod'

const querySchema = z.object({
  taskId: z.coerce.number().int().positive().optional(),
  day: calendarDay.optional(),
  from: calendarDay.optional(),
  to: calendarDay.optional(),
})

export const GET = withRoute(async (req: Request) => {
  const q = readQuery(req, querySchema)
  const filter = { taskId: q.taskId, day: q.day, from: q.from, to: q.to }
  return Response.json({ logs: listTimeLogs(filter), totalMs: sumTimeLogs(filter) })
})

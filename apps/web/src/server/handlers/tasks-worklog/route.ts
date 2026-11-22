/**
 * Tasks handlers batch C (S3-18) — worklog rollups.
 *
 * GET /api/tasks-worklog?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: the last
 * 7 days ending today) — per-day and per-task tracked-time rollups computed
 * from the append-only session log (S3-28's history view reads this; the
 * leaf-only/week-depth math upgrades in S3-88 without changing this shape).
 */
import { getTaskItem, listTimeLogs } from '@learning-hub/db'
import { readQuery } from '@/lib/api'
import { z } from 'zod'

const querySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

/** YYYY-MM-DD of `n` days before `now` (UTC calendar). */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const q = readQuery(req, querySchema)
  const from = q.from ?? daysAgo(6)
  const to = q.to ?? daysAgo(0)

  const logs = listTimeLogs({ from, to })

  const perDay = new Map<string, number>()
  const perTask = new Map<number, number>()
  for (const log of logs) {
    perDay.set(log.day, (perDay.get(log.day) ?? 0) + log.sessionMs)
    perTask.set(log.taskId, (perTask.get(log.taskId) ?? 0) + log.sessionMs)
  }

  const tasks = [...perTask.entries()]
    .map(([taskId, ms]) => ({ taskId, title: getTaskItem(taskId)?.title ?? null, totalMs: ms }))
    .sort((a, b) => b.totalMs - a.totalMs)

  return Response.json({
    from,
    to,
    totalMs: logs.reduce((sum, l) => sum + l.sessionMs, 0),
    perDay: [...perDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, ms]) => ({ day, totalMs: ms })),
    perTask: tasks,
    logCount: logs.length,
  })
}

/**
 * Tasks handlers batch D (S3-19) — planner read.
 *
 * GET /api/tasks-planner?days=N&from=YYYY-MM-DD (default: 7 days from
 * today) — the day-column data S3-25 renders: open tasks grouped by due
 * day (date part of `due`, timed dues included), per-day estimated and
 * tracked totals, plus the overdue row (open tasks due before today —
 * SP's red "from previous days" bucket).
 */
import { listTaskItems, sumTimeLogs } from '@learning-hub/db'
import { readQuery } from '@/lib/api'
import { z } from 'zod'

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).default(7),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

/** Date part of a due value (`YYYY-MM-DD` prefix — timed dues included). */
const dayOf = (due: string): string => due.slice(0, 10)

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const q = readQuery(req, querySchema)
  const start = q.from ?? daysAgo(0)
  const days: string[] = []
  for (let i = 0; i < q.days; i++) {
    days.push(new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10))
  }
  const horizonEnd = days[days.length - 1]!

  const open = listTaskItems({ projectId: 'any', parentId: 'any' })
  const today = daysAgo(0)

  const overdue = open
    .filter((t) => t.due !== null && dayOf(t.due) < today)
    .map((t) => ({ id: t.id, title: t.title, due: t.due, estimateMs: t.estimateMs }))

  const columns = days.map((day) => {
    const due = open.filter((t) => t.due !== null && dayOf(t.due) === day)
    return {
      day,
      estimatedMs: due.reduce((sum, t) => sum + (t.estimateMs ?? 0), 0),
      trackedMs: sumTimeLogs({ from: day, to: day }),
      tasks: due.map((t) => ({
        id: t.id,
        title: t.title,
        estimateMs: t.estimateMs,
        priority: t.priority,
        projectId: t.projectId,
        due: t.due,
      })),
    }
  })

  // Deadlines inside the horizon flag the S3-63 semantics (separate from due).
  const deadlines = open.filter(
    (t) => t.deadline !== null && t.deadline >= start && t.deadline <= horizonEnd,
  )

  return Response.json({ start, days: columns, overdue, deadlines })
}

/**
 * Tasks handlers batch D (S3-19) — schedule read.
 *
 * GET /api/tasks-schedule?days=N (default 30) — the 30-day timeline data
 * S3-26 renders: one row per day carrying blocks SIZED by estimate
 * (`estimateMs` on each block; tracked time for the day rides along) and
 * the deadline flags (tasks whose S3-63 hard deadline lands that day).
 * Open tasks with a due date in the horizon become day blocks; overdue
 * work is summarized separately (S3-95's "from previous days" row).
 */
import { listTaskItems, sumTimeLogs } from '@learning-hub/db'
import { readQuery } from '@/lib/api'
import { z } from 'zod'

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
})

const dayOf = (due: string): string => due.slice(0, 10)

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const q = readQuery(req, querySchema)
  const today = daysAgo(0)
  const days: string[] = []
  for (let i = 0; i < q.days; i++) {
    days.push(new Date(Date.parse(today) + i * 86_400_000).toISOString().slice(0, 10))
  }

  const open = listTaskItems({ projectId: 'any', parentId: 'any' })
  const byDay = new Map<string, typeof open>()
  for (const task of open) {
    // Anchor on the due day; deadline-only tasks (no due) surface on their
    // deadline day so the timeline shows the hard date (S3-63 semantics).
    const anchor = task.due !== null ? dayOf(task.due) : task.deadline
    if (anchor === null) continue
    const day = anchor.slice(0, 10)
    const bucket = byDay.get(day) ?? []
    bucket.push(task)
    byDay.set(day, bucket)
  }

  return Response.json({
    today,
    days: days.map((day) => ({
      day,
      trackedMs: sumTimeLogs({ from: day, to: day }),
      blocks: (byDay.get(day) ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        // The block size input: estimate, falling back to tracked-so-far.
        estimateMs: t.estimateMs,
        trackedMs: Object.values(t.timeSpentOnDay).reduce((a, b) => a + b, 0),
        priority: t.priority,
        deadline: t.deadline,
        deadlinePassed: t.deadline !== null && t.deadline < day,
        due: t.due,
      })),
    })),
    overdue: open
      .filter((t) => t.due !== null && dayOf(t.due) < today)
      .map((t) => ({ id: t.id, title: t.title, due: t.due, estimateMs: t.estimateMs })),
  })
}

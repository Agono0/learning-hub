/**
 * Tasks handlers batch C (S3-18) — finish-day.
 *
 * POST /api/tasks-finish-day `{ day? }` (default: today, UTC) — the
 * S3-29 flow's data pass, all in one response:
 * - `completedThatDay`: tasks whose `doneAt` falls on the day;
 * - `trackedMs` for the day;
 * - `stillOpenForDay`: open tasks due that day (the plan-tomorrow prompt);
 * - `archive`: the S3-11 auto-archive pass applied (young/old tiers).
 */
import { z } from 'zod'
import { listTaskItems, runArchivePass, sumTimeLogs } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

const bodySchema = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, bodySchema)
    const day = body.day ?? new Date().toISOString().slice(0, 10)

    // Done tasks whose completion landed on the day (includeDone bypasses
    // the default open-only scope; archived tier rows are irrelevant here).
    const completedThatDay = listTaskItems({
      projectId: 'any',
      parentId: 'any',
      includeDone: true,
      includeWontdo: true,
    }).filter((t) => t.doneAt?.startsWith(day) === true && t.isDone)

    const stillOpenForDay = listTaskItems({
      projectId: 'any',
      parentId: 'any',
    }).filter((t) => t.due?.startsWith(day) === true && !t.dueWithTime)

    const trackedMs = sumTimeLogs({ from: day, to: day })
    const archive = runArchivePass(undefined, new Date().toISOString())

    return Response.json({
      day,
      completedThatDay: completedThatDay.map((t) => ({ id: t.id, title: t.title })),
      trackedMs,
      stillOpenForDay: stillOpenForDay.map((t) => ({ id: t.id, title: t.title, due: t.due })),
      archive,
    })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

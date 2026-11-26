/**
 * /api/exam-prep — a day-by-day review schedule toward an exam date, from the
 * same FSRS model as /api/readiness.
 *
 * Read-only. It does not schedule, review or change any card. Every response
 * carries `plan.assumptions`: the figures are model estimates, the schedule is
 * a greedy heuristic, and following it means doing real reviews yourself.
 *
 *   GET /api/exam-prep?examId=3
 *   GET /api/exam-prep?date=2026-12-01&title=Final
 *   optional: target=0.85, perDay=30, minGain=0.01, maxReviewsPerCard=3,
 *             rest=0,6 (UTC weekdays, 0 = Sunday), deckIds=1,2
 */
import { z } from 'zod'
import { runExamPrep } from '@learning-hub/db'
import { db } from '@/lib/db'
import { withRoute } from '@/lib/api'

const csvInts = (min: number, max: number, items: number) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map(Number),
    )
    .pipe(z.array(z.number().int().min(min).max(max)).max(items))

const querySchema = z.object({
  examId: z.coerce.number().int().positive().optional(),
  date: z.string().max(40).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  target: z.coerce.number().min(0.5).max(0.99).default(0.85),
  perDay: z.coerce.number().int().min(0).max(100).default(30),
  minGain: z.coerce.number().min(0).max(0.5).default(0.01),
  maxReviewsPerCard: z.coerce.number().int().min(1).max(10).default(3),
  rest: csvInts(0, 6, 7).optional(),
  deckIds: csvInts(1, Number.MAX_SAFE_INTEGER, 200).optional(),
})

function fail(status: number, error: string) {
  return Response.json({ ok: false, error }, { status })
}

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return fail(400, 'invalid query')
  const { rest, ...q } = parsed.data
  if (q.examId === undefined && q.date === undefined) return fail(400, 'examId or date is required')
  const run = await runExamPrep({ ...q, restWeekdays: rest }, { db })
  if (!run.ok) return fail(run.status, run.error)
  return Response.json({ ok: true, ...run.value })
})

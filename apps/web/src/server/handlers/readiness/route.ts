/**
 * /api/readiness — exam readiness: how much of the learner's card memory the
 * FSRS model expects to be recalled on an exam date, with and without a
 * hypothetical review plan, plus which cards a review budget helps most.
 *
 * Read-only. Every response carries the report's `assumptions`: the figures are
 * model estimates, not validated exam scores, and the review scenario is not a
 * promise that those reviews happen.
 *
 *   GET /api/readiness                      -> the exam anchors to pick from
 *   GET /api/readiness?examId=3             -> a report for that exam
 *   GET /api/readiness?date=2026-12-01&title=Final   -> a report for an ad-hoc date
 *   optional: plan=none|on-schedule|capacity, perDay=15, target=0.85,
 *             deckIds=1,2, budget=20
 */
import { z } from 'zod'
import { getReadinessExam, listReadinessExams, loadReadinessInputs } from '@learning-hub/db'
import {
  buildReadinessReport,
  parseExamDate,
  planBudget,
  rankReviewGains,
  reviewsNeededFor,
  type ReviewPlan,
} from '@learning-hub/core'
import { db } from '@/lib/db'
import { withRoute } from '@/lib/api'

const MAX_GAIN_ROWS = 50

const csvInts = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map(Number),
  )
  .pipe(z.array(z.number().int().positive()).max(200))

const querySchema = z.object({
  examId: z.coerce.number().int().positive().optional(),
  date: z.string().max(40).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  plan: z.enum(['none', 'on-schedule', 'capacity']).default('on-schedule'),
  perDay: z.coerce.number().int().min(0).max(1000).default(20),
  target: z.coerce.number().min(0.5).max(0.99).default(0.85),
  deckIds: csvInts.optional(),
  budget: z.coerce.number().int().min(0).max(5000).default(20),
})

function fail(status: number, error: string) {
  return Response.json({ ok: false, error }, { status })
}

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return fail(400, 'invalid query')
  const q = parsed.data

  if (q.examId === undefined && q.date === undefined) {
    return Response.json({ ok: true, exams: listReadinessExams(db) })
  }

  let target: { title: string; date: string; courseId: number | null }
  if (q.examId !== undefined) {
    const exam = getReadinessExam(q.examId, db)
    if (!exam) return fail(404, 'exam not found')
    target = { title: exam.title, date: exam.date, courseId: exam.courseId }
  } else {
    if (!parseExamDate(q.date as string))
      return fail(400, 'date must be YYYY-MM-DD or an ISO timestamp')
    target = { title: q.title ?? 'Exam', date: q.date as string, courseId: null }
  }
  if (!parseExamDate(target.date)) return fail(422, 'exam date is not a valid date')

  const plan: ReviewPlan =
    q.plan === 'none'
      ? { kind: 'none' }
      : q.plan === 'capacity'
        ? { kind: 'capacity', perDay: q.perDay }
        : { kind: 'on-schedule' }

  const now = new Date()
  const inputs = loadReadinessInputs({ deckIds: q.deckIds }, db)
  const report = await buildReadinessReport({
    target,
    cards: inputs.cards,
    now,
    plan,
    targetRecall: q.target,
    deckLabel: (id) => inputs.deckNames.get(id) ?? `Deck ${id}`,
    skillLabel: (id) => inputs.skillNames.get(id) ?? `Skill ${id}`,
  })
  if (!report) return fail(422, 'exam date is not a valid date')

  const exam = parseExamDate(target.date) as Date
  const gains = await rankReviewGains(inputs.cards, now, exam)
  const budgetPlan = planBudget(gains, q.budget)
  return Response.json({
    ok: true,
    report,
    review: {
      // Assumes each chosen card is reviewed once today and remembered (Good).
      budget: budgetPlan.budget,
      meanRecallBefore: budgetPlan.before,
      meanRecallAfter: budgetPlan.after,
      reviewsNeededForTarget: reviewsNeededFor(gains, report.targetRecall),
      top: budgetPlan.chosen.slice(0, MAX_GAIN_ROWS),
      assumptions: report.assumptions,
    },
  })
})

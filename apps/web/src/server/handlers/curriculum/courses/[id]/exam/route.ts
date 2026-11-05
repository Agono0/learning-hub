/**
 * /api/curriculum/courses/:id/exam — the course's final exam.
 * GET  → { exercises, passScore, minutes, bestScore, attempts }
 * POST { answers: unknown[] } (one per exercise, in order) → graded attempt:
 *      per-question score + feedback, overall score, passed, and what the
 *      certificate still needs. Grading happens HERE, never in the client.
 *
 * Exam answers are intentionally not scheduled as cards: a final exam
 * measures, while the lesson exercises (already cards) do the spacing.
 */
import { z } from 'zod'
import { gradeExercise } from '@learning-hub/core/practice'
import type { LhcfCourse } from '@learning-hub/core/curriculum'
import { courses, getCourseOverview, recordExamAttempt } from '@learning-hub/db'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { readJson, withRoute } from '@/lib/api'
import { notFound, routeId, type IdContext } from '../../../_shared'

function examOf(courseId: number) {
  const row = db.select({ spec: courses.spec }).from(courses).where(eq(courses.id, courseId)).get()
  return (row?.spec as LhcfCourse | null)?.finalExam ?? null
}

export const GET = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  const exam = id ? examOf(id) : null
  if (!id || !exam) return notFound('exam')
  const overview = getCourseOverview(id)
  return Response.json({
    exercises: exam.exercises,
    passScore: exam.passScore,
    minutes: exam.minutes ?? null,
    bestScore: overview?.exam?.bestScore ?? null,
    attempts: overview?.exam?.attempts ?? 0,
  })
})

const submitSchema = z.object({ answers: z.array(z.unknown()).max(200) })

export const POST = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  const exam = id ? examOf(id) : null
  if (!id || !exam) return notFound('exam')
  const { answers } = await readJson(req, submitSchema)
  const graded = exam.exercises.map((exercise, i) => gradeExercise(exercise, answers[i]))
  const { score, passed } = recordExamAttempt(
    id,
    graded.map((g) => g.score),
    exam.passScore,
  )
  const certificate = getCourseOverview(id)?.certificate
  return Response.json({
    score,
    passed,
    passScore: exam.passScore,
    results: graded.map((g) => ({
      score: g.score,
      correct: g.correct,
      feedback: g.feedback,
      pending: g.pending ?? false,
    })),
    certificate: certificate
      ? { eligible: certificate.eligible, missing: certificate.missing }
      : null,
  })
})

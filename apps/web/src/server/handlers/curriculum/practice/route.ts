/**
 * POST /api/curriculum/practice — answer one exercise card.
 *
 * Body: { cardId, answer, confidence?, timeMs? }
 * 1. grades the answer on the server (gradeExercise — never trusted from UI);
 * 2. unless the grade is pending (free text / code awaiting a score), records
 *    it through the ONE review pipeline (executeReview: FSRS, revlog, XP,
 *    streak, BKT/Elo mastery) — so lesson practice and deck review are the
 *    same memory system;
 * 3. counts the attempt on the card's lesson.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { gradeExercise } from '@learning-hub/core/practice'
import { cards, executeReview, lessonIdForCard, recordLessonAttempt } from '@learning-hub/db'
import { db } from '@/lib/db'
import { readJson, withRoute } from '@/lib/api'
import { notFound } from '../_shared'

const practiceSchema = z.object({
  cardId: z.number().int().positive(),
  answer: z.unknown(),
  confidence: z.union([z.literal(0), z.literal(1)]).optional(),
  timeMs: z.number().int().min(0).max(3_600_000).optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, practiceSchema)
  const card = db.select().from(cards).where(eq(cards.id, body.cardId)).get()
  const exercise = card?.content.exercise
  if (!card || !exercise) return notFound('exercise card')

  const result = gradeExercise(exercise, body.answer)
  if (result.pending) return Response.json({ result, review: null })

  const review = await executeReview({
    cardId: card.id,
    grade: result.grade,
    confidence: body.confidence ?? 1,
    timeMs: body.timeMs,
  })
  const lessonId = lessonIdForCard(card.id)
  if (lessonId !== null) recordLessonAttempt(lessonId, result.correct)

  return Response.json({
    result,
    explanation: exercise.explanation ?? null,
    review: {
      due: review.card.due,
      xpEarned: review.xpEarned,
      streak: review.streak.current ?? null,
    },
  })
})

/**
 * /api/curriculum/exam — set an exam date, get the countdown plan, build and
 * submit mock exams.
 * POST { action: 'set', title, date, courseId? }
 * POST { action: 'plan' } → countdown plan (weakest-first, cram warning)
 * POST { action: 'mock', minutes?, formatMatch? } → exam paper from cards
 * POST { action: 'submit', results: [{ cardId, outcome }] } → mastery (BKT) + elo events
 */
import { and, desc, eq, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, examDates, mastery, eloEvents, skills } from '@learning-hub/db'
import {
  applyReviewToMastery,
  buildMockExam,
  eloUpdate,
  examCountdownPlan,
  outcomeFrom,
  type MockCard,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const examPostSchema = z.object({
  action: z.enum(['set', 'plan', 'mock', 'submit'], {
    message: 'action must be set|plan|mock|submit',
  }),
  title: z.string().optional(),
  date: z.string().optional(),
  courseId: z.number().int().positive().optional(),
  minutes: z.number().int().positive().max(600).optional(),
  formatMatch: z.boolean().optional(),
  results: z
    .array(
      z.object({
        cardId: z.number().int().positive(),
        outcome: z.number().min(0).max(1).optional(),
        grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
        confidence: z.union([z.literal(0), z.literal(1)]).optional(),
      }),
    )
    .optional(),
})

export async function GET() {
  const [exam] = await db.select().from(examDates).orderBy(desc(examDates.date)).limit(1)
  const plan = exam ? await buildPlan(exam) : null
  return Response.json({ exam: exam ?? null, plan })
}

async function buildPlan(exam: { date: string; title: string }) {
  const rows = await db
    .select({
      skillId: skills.id,
      name: skills.name,
      pKnown: mastery.pKnown,
      attempts: mastery.attempts,
    })
    .from(skills)
    .leftJoin(mastery, eq(mastery.skillId, skills.id))
  return {
    examTitle: exam.title,
    ...examCountdownPlan(
      exam.date,
      rows.map((r) => ({
        skillId: r.skillId,
        name: r.name,
        pKnown: r.pKnown ?? 0.1,
        attempts: r.attempts ?? 0,
      })),
    ),
  }
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, examPostSchema)
  const action = body.action

  if (action === 'set') {
    if (!body.title?.trim() || !body.date)
      return Response.json({ error: 'title and date required' }, { status: 400 })
    const [exam] = await db
      .insert(examDates)
      .values({ title: body.title.trim(), date: body.date, courseId: body.courseId ?? null })
      .returning()
    return Response.json({ ok: true, exam, plan: await buildPlan(exam) })
  }

  if (action === 'plan') {
    const [exam] = await db.select().from(examDates).orderBy(desc(examDates.date)).limit(1)
    if (!exam)
      return Response.json({ error: 'no exam set — POST action:set first' }, { status: 404 })
    return Response.json({ ok: true, plan: await buildPlan(exam) })
  }

  if (action === 'mock') {
    const cardRows = await db
      .select()
      .from(cards)
      .where(
        and(
          eq(cards.suspended, false),
          lte(cards.due, new Date(Date.now() + 365 * 86_400_000).toISOString()),
        ),
      )
      .limit(120)
    const mockCards: MockCard[] = cardRows.map((c) => ({
      id: c.id,
      type: c.type,
      content: c.content,
      skillId: c.skillId,
      deckId: c.deckId,
    }))
    const exam = buildMockExam(mockCards, {
      minutes: body.minutes ?? 30,
      formatMatch: body.formatMatch ?? true,
    })
    return Response.json({ ok: true, exam })
  }

  if (action === 'submit') {
    const results = body.results ?? []
    if (!results.length) return Response.json({ error: 'results required' }, { status: 400 })
    const graded: { cardId: number; skillId: number | null; pKnownAfter: number }[] = []
    for (const r of results) {
      const [card] = await db.select().from(cards).where(eq(cards.id, r.cardId)).limit(1)
      if (!card) continue
      const outcome = r.outcome ?? (r.grade ? outcomeFrom(r.grade, r.confidence ?? 1) : 0)
      const correct = outcome >= 0.5
      if (card.skillId) {
        const [row] = await db
          .select()
          .from(mastery)
          .where(eq(mastery.skillId, card.skillId))
          .limit(1)
        const before = row ?? { pKnown: 0.1, attempts: 0, correct: 0 }
        const after = applyReviewToMastery(before, correct)
        if (row) {
          const elo = eloUpdate(row.elo, 1000, outcome, row.attempts, 0)
          await db
            .update(mastery)
            .set({
              pKnown: after.pKnown,
              attempts: after.attempts,
              correct: after.correct,
              elo: elo.ratingAfter,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(mastery.skillId, card.skillId))
          await db.insert(eloEvents).values({
            skillId: card.skillId,
            ratingBefore: elo.ratingBefore,
            ratingAfter: elo.ratingAfter,
            itemDifficulty: elo.itemDifficultyBefore,
            outcome,
          })
        } else {
          const elo = eloUpdate(1000, 1000, outcome, 0, 0)
          await db
            .insert(mastery)
            .values({
              skillId: card.skillId,
              pKnown: after.pKnown,
              attempts: after.attempts,
              correct: after.correct,
              elo: elo.ratingAfter,
            })
            .onConflictDoNothing()
          await db.insert(eloEvents).values({
            skillId: card.skillId,
            ratingBefore: elo.ratingBefore,
            ratingAfter: elo.ratingAfter,
            itemDifficulty: elo.itemDifficultyBefore,
            outcome,
          })
        }
        graded.push({ cardId: card.id, skillId: card.skillId, pKnownAfter: after.pKnown })
      } else {
        graded.push({ cardId: card.id, skillId: null, pKnownAfter: 0 })
      }
    }
    return Response.json({ ok: true, graded })
  }

  // unreachable with the zod enum above — kept as a defensive fallback
  return Response.json({ error: 'action must be set|plan|mock|submit' }, { status: 400 })
})

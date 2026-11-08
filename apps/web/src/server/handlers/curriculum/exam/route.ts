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
import { db, cards, examDates, skills, withTransaction, applySkillResponse } from '@learning-hub/db'
import { buildMockExam, examCountdownPlan, outcomeFrom, type MockCard } from '@learning-hub/core'
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
    // Rule 7: mastery/Elo writes go through the ONE canonical path
    // (packages/db/src/mastery-service.ts) — the handler owns no grading math.
    // Async reads resolve before the (strictly synchronous) transaction.
    const cardsById = new Map<number, typeof cards.$inferSelect>()
    for (const r of results) {
      if (!cardsById.has(r.cardId)) {
        const [card] = await db.select().from(cards).where(eq(cards.id, r.cardId)).limit(1)
        if (card) cardsById.set(card.id, card)
      }
    }
    const graded = withTransaction((tx) => {
      const out: { cardId: number; skillId: number | null; pKnownAfter: number }[] = []
      for (const r of results) {
        const card = cardsById.get(r.cardId)
        if (!card) continue
        const outcome = r.outcome ?? (r.grade ? outcomeFrom(r.grade, r.confidence ?? 1) : 0)
        const correct = outcome >= 0.5
        if (card.skillId) {
          const applied = applySkillResponse(tx, { skillId: card.skillId, outcome, correct })
          out.push({ cardId: card.id, skillId: card.skillId, pKnownAfter: applied.pKnownAfter })
        } else {
          out.push({ cardId: card.id, skillId: null, pKnownAfter: 0 })
        }
      }
      return out
    })
    return Response.json({ ok: true, graded })
  }

  // unreachable with the zod enum above — kept as a defensive fallback
  return Response.json({ error: 'action must be set|plan|mock|submit' }, { status: 400 })
})

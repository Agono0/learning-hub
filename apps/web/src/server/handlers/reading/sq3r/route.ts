/**
 * /api/reading/sq3r — Guided SQ3R (Survey → Question → Read → Recite → Review)
 * study session persistence and 1-click Q&A → FSRS flashcard conversion.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractSurveyHeadings } from '@learning-hub/core'
import {
  cards,
  db,
  decks,
  sources,
  sq3rSessions,
  withTransaction,
  type Sq3rQuestionItem,
} from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const questionItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  question: z.string().trim().min(1).max(1000),
  answer: z.string().max(4000).default(''),
  cardId: z.number().int().positive().optional(),
})

const upsertSq3rSchema = z.object({
  sourceId: z.number().int().positive(),
  surveyHeadings: z.array(z.string().max(300)).max(50).optional(),
  questions: z.array(questionItemSchema).max(60).optional(),
  reciteNotes: z.string().max(40_000).optional(),
  completedSteps: z.array(z.enum(['survey', 'question', 'read', 'recite', 'review'])).optional(),
})

const convertCardsSchema = z.object({
  sourceId: z.number().int().positive(),
  deckId: z.number().int().positive().optional(),
})

export const GET = withRoute(async (req: Request) => {
  const sourceId = Number(new URL(req.url).searchParams.get('sourceId'))
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    throw new ApiError(400, 'sourceId query parameter required')
  }

  const [source] = db.select().from(sources).where(eq(sources.id, sourceId)).limit(1).all()
  if (!source) throw new ApiError(404, 'source not found')

  let [session] = db
    .select()
    .from(sq3rSessions)
    .where(eq(sq3rSessions.sourceId, sourceId))
    .limit(1)
    .all()

  if (!session) {
    const autoHeadings = extractSurveyHeadings(source.content, 15)
    ;[session] = db
      .insert(sq3rSessions)
      .values({
        sourceId,
        surveyHeadings: autoHeadings,
        questions: [],
        reciteNotes: '',
        completedSteps: [],
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .all()
  }

  return Response.json({ ok: true, session })
})

export const PUT = withRoute(async (req: Request) => {
  const body = await readJson(req, upsertSq3rSchema)
  const [source] = db.select().from(sources).where(eq(sources.id, body.sourceId)).limit(1).all()
  if (!source) throw new ApiError(404, 'source not found')

  const session = withTransaction((tx) => {
    const existing = tx
      .select()
      .from(sq3rSessions)
      .where(eq(sq3rSessions.sourceId, body.sourceId))
      .get()
    const now = new Date().toISOString()

    if (!existing) {
      const [created] = tx
        .insert(sq3rSessions)
        .values({
          sourceId: body.sourceId,
          surveyHeadings: body.surveyHeadings ?? extractSurveyHeadings(source.content, 15),
          questions: (body.questions ?? []) as Sq3rQuestionItem[],
          reciteNotes: body.reciteNotes ?? '',
          completedSteps: body.completedSteps ?? [],
          updatedAt: now,
        })
        .returning()
        .all()
      return created!
    }

    const [updated] = tx
      .update(sq3rSessions)
      .set({
        ...(body.surveyHeadings !== undefined ? { surveyHeadings: body.surveyHeadings } : {}),
        ...(body.questions !== undefined
          ? { questions: body.questions as Sq3rQuestionItem[] }
          : {}),
        ...(body.reciteNotes !== undefined ? { reciteNotes: body.reciteNotes } : {}),
        ...(body.completedSteps !== undefined ? { completedSteps: body.completedSteps } : {}),
        updatedAt: now,
      })
      .where(eq(sq3rSessions.id, existing.id))
      .returning()
      .all()
    return updated!
  })

  return Response.json({ ok: true, session })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, convertCardsSchema)

  const outcome = withTransaction((tx) => {
    const source = tx.select().from(sources).where(eq(sources.id, body.sourceId)).get()
    if (!source) throw new ApiError(404, 'source not found')

    const session = tx
      .select()
      .from(sq3rSessions)
      .where(eq(sq3rSessions.sourceId, body.sourceId))
      .get()
    if (!session) throw new ApiError(400, 'no SQ3R session found for this source')

    // Resolve or create target deck
    let targetDeckId = body.deckId ?? null
    if (targetDeckId !== null) {
      const exists = tx.select({ id: decks.id }).from(decks).where(eq(decks.id, targetDeckId)).get()
      if (!exists) throw new ApiError(404, 'deck not found')
    } else {
      const deckName = `SQ3R — ${source.title.slice(0, 60)}`
      const existingDeck = tx
        .select({ id: decks.id })
        .from(decks)
        .where(eq(decks.name, deckName))
        .get()
      if (existingDeck) {
        targetDeckId = existingDeck.id
      } else {
        const [createdDeck] = tx
          .insert(decks)
          .values({
            name: deckName,
            description: `SQ3R active-reading questions from "${source.title}"`,
            emoji: '📖',
          })
          .returning()
          .all()
        targetDeckId = createdDeck!.id
      }
    }

    const now = new Date().toISOString()
    let createdCount = 0
    const updatedQuestions: Sq3rQuestionItem[] = session.questions.map((q) => {
      if (q.cardId || !q.question.trim() || !q.answer.trim()) return q
      const [card] = tx
        .insert(cards)
        .values({
          deckId: targetDeckId!,
          type: 'basic',
          content: {
            basic: {
              front: q.question.trim(),
              back: q.answer.trim(),
            },
          },
          tags: ['sq3r'],
          source: `sq3r:${source.id}`,
          due: now,
          createdAt: now,
        })
        .returning()
        .all()
      createdCount += 1
      return { ...q, cardId: card!.id }
    })

    const nextSteps = session.completedSteps.includes('review')
      ? session.completedSteps
      : [...session.completedSteps, 'review']

    const [updatedSession] = tx
      .update(sq3rSessions)
      .set({
        questions: updatedQuestions,
        completedSteps: nextSteps,
        updatedAt: now,
      })
      .where(eq(sq3rSessions.id, session.id))
      .returning()
      .all()

    return { createdCards: createdCount, deckId: targetDeckId!, session: updatedSession! }
  })

  return Response.json({ ok: true, ...outcome })
})

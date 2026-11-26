/**
 * /api/reading/sq3r — Guided SQ3R (Survey → Question → Read → Recite → Review)
 * study session persistence and 1-click Q&A → FSRS flashcard conversion.
 */
import { queryId } from '@/lib/query-params'
import { z } from 'zod'
import {
  convertSq3rToCards,
  getOrCreateSq3rSession,
  upsertSq3rSession,
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
  const sourceId = queryId(new URL(req.url).searchParams, 'sourceId')
  if (sourceId === null) {
    throw new ApiError(400, 'sourceId query parameter required')
  }

  const session = getOrCreateSq3rSession(sourceId)
  if (!session) throw new ApiError(404, 'source not found')

  return Response.json({ ok: true, session })
})

export const PUT = withRoute(async (req: Request) => {
  const body = await readJson(req, upsertSq3rSchema)
  const session = upsertSq3rSession(body.sourceId, {
    surveyHeadings: body.surveyHeadings,
    questions: body.questions as Sq3rQuestionItem[] | undefined,
    reciteNotes: body.reciteNotes,
    completedSteps: body.completedSteps,
  })
  if (!session) throw new ApiError(404, 'source not found')

  return Response.json({ ok: true, session })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, convertCardsSchema)
  const outcome = convertSq3rToCards({
    sourceId: body.sourceId,
    deckId: body.deckId,
  })

  if (!outcome.success) {
    if (outcome.error === 'source_not_found') throw new ApiError(404, 'source not found')
    if (outcome.error === 'deck_not_found') throw new ApiError(404, 'deck not found')
    throw new ApiError(400, 'no SQ3R session found for this source')
  }

  return Response.json({
    ok: true,
    createdCards: outcome.createdCards,
    deckId: outcome.deckId,
    session: outcome.session,
  })
})

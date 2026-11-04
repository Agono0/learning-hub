/**
 * POST /api/ai/generate — one entry point for AI content generation.
 * Body: { kind: 'cloze'|'course'|'podcast'|'summary', payload }
 * Degrades to 400 + needsSetup + manualHint when no provider is configured
 * (the UI shows the prompt-transport flow instead); provider failures return
 * a sanitized 502 (raw upstream messages never reach the client).
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, cards, sources, withTransaction } from '@learning-hub/db'
import {
  CLOZE_GENERATOR_SYSTEM,
  clozeCardsSchema,
  clozeGeneratorPrompt,
  parseGeneratedCourse,
  generateCoursePrompt,
  generatedCourseSchema,
} from '@learning-hub/core'
import { podcastScript, studyGuide } from '@learning-hub/core/media'
import { requireAI, AIUnavailableError, type AIClient } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'
import { insertGeneratedCourse } from '@/lib/curriculum-server'

const generateSchema = z.object({
  kind: z.enum(['cloze', 'course', 'podcast', 'summary'], { message: 'kind required' }),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, generateSchema)
  const kind = body.kind
  const payload = body.payload ?? {}

  let ai: AIClient
  try {
    ai = await requireAI()
  } catch (e) {
    if (e instanceof AIUnavailableError) {
      return Response.json(
        {
          ok: false,
          error: e.message,
          needsSetup: true,
          manualHint:
            'No provider needed: use the prompt-transport flow (copy the envelope into any chatbot, paste the reply back) — GET /api/ai/transport?feature=cloze-generator. Hand-made cards work via the deck editor or Bulk paste.',
        },
        { status: 400 },
      )
    }
    return aiErrorResponse(e)
  }

  if (kind === 'cloze') {
    const text = String(payload.text ?? '')
    if (!text.trim()) return Response.json({ error: 'payload.text required' }, { status: 400 })
    const deckId = Number(payload.deckId ?? 0)
    if (!deckId) return Response.json({ error: 'payload.deckId required' }, { status: 400 })
    let out: z.infer<typeof clozeCardsSchema>
    try {
      out = await ai.generateJSON({
        schema: clozeCardsSchema,
        system: CLOZE_GENERATOR_SYSTEM,
        prompt: clozeGeneratorPrompt(text),
      })
    } catch (e) {
      return aiErrorResponse(e)
    }
    // one atomic insert batch for the generated card set
    const created: number[] = []
    withTransaction((tx) => {
      for (const c of out.cards.slice(0, 20)) {
        const [card] = tx
          .insert(cards)
          .values({
            deckId,
            noteId: payload.noteId ? Number(payload.noteId) : null,
            type: 'cloze',
            content: { cloze: { text: c.text, answers: c.answers, mode: 'basic', hint: c.hint } },
            tags: ['ai', 'cloze'],
            source: 'ai',
            due: new Date().toISOString(),
          })
          .returning()
          .all()
        created.push(card!.id)
      }
    })
    return Response.json({ ok: true, cards: created })
  }

  if (kind === 'course') {
    const topic = payload.topic ? String(payload.topic) : undefined
    const pdfId = payload.pdfId ? Number(payload.pdfId) : undefined
    const depth = payload.depth ? String(payload.depth) : undefined
    let pdfText: string | undefined
    if (pdfId) {
      const [src] = await db.select().from(sources).where(eq(sources.id, pdfId)).limit(1)
      if (!src) return Response.json({ error: 'source not found' }, { status: 404 })
      pdfText = src.content
    }
    if (!topic && !pdfText)
      return Response.json({ error: 'topic or pdfId required' }, { status: 400 })
    const prompt = generateCoursePrompt({ topic, pdfText, depth })
    let raw: unknown
    try {
      raw = await ai.generateJSON({
        schema: generatedCourseSchema,
        system: prompt.system,
        prompt: prompt.prompt,
      })
    } catch (e) {
      return aiErrorResponse(e)
    }
    const parsed = parseGeneratedCourse(raw)
    const ids = insertGeneratedCourse(parsed)
    return Response.json({ ok: true, ...ids, course: parsed })
  }

  if (kind === 'podcast') {
    const summary = String(payload.summary ?? payload.text ?? '')
    if (!summary.trim())
      return Response.json({ error: 'payload.summary required' }, { status: 400 })
    const result = await podcastScript(summary, ai)
    if (!result.ok) {
      // podcastScript surfaces the raw provider message — sanitize before returning
      return aiErrorResponse(new Error(result.error))
    }
    return Response.json({ ok: true, script: result.data })
  }

  // kind === 'summary'
  const text = String(payload.text ?? '')
  if (!text.trim()) return Response.json({ error: 'payload.text required' }, { status: 400 })
  // summary is a text generation; studyGuide gives structure when wanted
  if (payload.mode === 'study-guide') {
    const guide = await studyGuide(text, ai)
    if (!guide.ok) {
      // studyGuide surfaces the raw provider message — sanitize before returning
      return aiErrorResponse(new Error(guide.error))
    }
    return Response.json({ ok: true, guide: guide.data })
  }
  let summary: string
  try {
    summary = await ai.generateText({
      system:
        'Summarize the text faithfully in 5-8 bullet sentences, preserving technical terms. No preamble.',
      prompt: text.slice(0, 16000),
    })
  } catch (e) {
    return aiErrorResponse(e)
  }
  return Response.json({ ok: true, summary })
})

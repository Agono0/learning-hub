/**
 * POST /api/ai/chat/summary — summarize a tutor session into understood/gaps
 * plus 2-5 starter flashcards for the gaps. Drafts only: the client saves the
 * picked cards via the normal /api/cards?bulk=1 path, so the learner stays the
 * editor. Works with no provider (manual mode = the raw transcript excerpt).
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import {
  TUTOR_SUMMARY_SYSTEM,
  tutorSessionSummarySchema,
  tutorSummaryPrompt,
} from '@learning-hub/core'
import { db } from '@/lib/db'
import { chatSessions } from '@learning-hub/db'
import { requireAI, AIUnavailableError, type AIClient } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'

const summarySchema = z.object({
  sessionId: z.number().int().positive(),
  mode: z.enum(['ai', 'manual']).optional().default('ai'),
})

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

function transcriptOf(messages: unknown): string {
  if (!Array.isArray(messages)) return ''
  return (messages as ChatMsg[])
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => `${m.role === 'user' ? 'LEARNER' : 'TUTOR'}: ${m.content}`)
    .join('\n')
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, summarySchema)
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, body.sessionId))
    .limit(1)
  if (!session) return Response.json({ ok: false, error: 'Session not found' }, { status: 404 })

  const transcript = transcriptOf(session.messages)
  if (!transcript.trim()) {
    return Response.json({ ok: false, error: 'This session has no messages yet' }, { status: 400 })
  }

  if (body.mode === 'ai') {
    let ai: AIClient
    try {
      ai = await requireAI()
    } catch (e) {
      if (e instanceof AIUnavailableError) {
        return Response.json({
          ok: true,
          usedAI: false,
          needsSetup: true,
          summary: transcript.slice(0, 400),
          understood: [],
          gaps: [],
          cards: [],
        })
      }
      return aiErrorResponse(e)
    }
    try {
      const out = await ai.generateJSON({
        schema: tutorSessionSummarySchema,
        system: TUTOR_SUMMARY_SYSTEM,
        prompt: tutorSummaryPrompt(transcript),
      })
      return Response.json({ ok: true, usedAI: true, needsSetup: false, ...out })
    } catch (e) {
      return aiErrorResponse(e)
    }
  }

  // Explicit manual mode — the raw transcript, structured for self-review.
  return Response.json({
    ok: true,
    usedAI: false,
    needsSetup: false,
    summary: transcript.slice(0, 400),
    understood: [],
    gaps: [],
    cards: [],
  })
})

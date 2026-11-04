/**
 * POST /api/ai/chat — streaming Socratic tutor / Feynman student chat.
 * Body: { sessionId?, kind: 'tutor'|'feynman', contextType?, contextId?, messages }
 * RAG: top-10 note snippets matching the student's last message are injected
 * into the system prompt. Persisted into chat_sessions; hintsUsed++ when the
 * student asks for a hint (mastery signal).
 *
 * Provider-agnostic: streams through the AIClient port's optional
 * `streamChat`; providers that cannot stream (custom-endpoint) fall back to a
 * single generateText chunk. No AI SDK import here — the SDK lives in
 * @learning-hub/ai-adapters, imported once via '@/lib/ai'.
 *
 * History contract: the client sends its full transcript every send, but the
 * server persists ONLY the suffix the session row does not already have
 * (`messages.slice(priorMessages.length)`) — appending the whole transcript on
 * every POST duplicated it O(n²) across a session.
 */
import { z } from 'zod'
import { eq, like, or, sql } from 'drizzle-orm'
import { db, chatSessions, notes } from '@learning-hub/db'
import { FEYNMAN_STUDENT, SOCRATIC_SYSTEM, type AIClient, type ChatMessage } from '@learning-hub/core/ai'
import { requireAI } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const HINT_ASK = /\b(hint|clue|stuck|don'?t know|no idea|just tell|give up|answer)\b/i

const chatSchema = z.object({
  sessionId: z.number().int().positive().optional(),
  kind: z.enum(['tutor', 'feynman']).optional(),
  contextType: z.enum(['lesson', 'note', 'concept', 'deck']).nullable().optional(),
  contextId: z.number().int().positive().nullable().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .min(1, 'messages required'),
})

function keywordQuery(text: string): string | null {
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'is', 'are', 'was', 'what', 'why', 'how', 'in', 'on', 'for', 'it', 'this', 'that', 'i', 'do', 'can', 'you', 'me', 'my'])
  const tokens = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 3 && !stop.has(t))
  return tokens.length ? tokens.slice(0, 4).join(' ') : null
}

/** Stream an AIClient reply as a text/plain Response (chunk = token delta). */
function streamResponse(client: AIClient, system: string, coreMessages: ChatMessage[], sessionId: number): Response {
  // Providers with streamChat stream tokens; others (custom-endpoint) emit one chunk from generateText.
  const iterator: AsyncIterable<string> = client.streamChat
    ? client.streamChat({ system, messages: coreMessages })
    : (async function* () {
        const transcript = coreMessages
          .map((m) => (m.role === 'user' ? 'Student: ' : 'Questioner: ') + m.content)
          .join('\n')
        yield await client.generateText({ system, prompt: transcript })
      })()

  const encoder = new TextEncoder()
  const it = iterator[Symbol.asyncIterator]()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(value))
      } catch (e) {
        // provider errors leak base URLs / model ids / upstream statuses — keep them server-side
        console.error('[api] AI provider failure:', e)
        controller.error(new Error('AI request failed'))
      }
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-session-id': String(sessionId) },
  })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, chatSchema)
  const kind = body.kind ?? 'tutor'
  const messages = body.messages.filter((m) => m.role !== 'system')
  if (messages.length === 0) {
    return Response.json({ error: 'messages required' }, { status: 400 })
  }
  let client: AIClient
  try {
    client = await requireAI()
  } catch (e) {
    return aiErrorResponse(e)
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const snippets: string[] = []
  const q = keywordQuery(lastUser)
  try {
    if (body.contextType === 'note' && body.contextId) {
      const [note] = await db.select().from(notes).where(eq(notes.id, body.contextId)).limit(1)
      if (note) snippets.push(`[${note.title}] ${note.content.slice(0, 600)}`)
    }
    if (q) {
      const words = q.split(' ')
      const rows = await db
        .select()
        .from(notes)
        .where(or(...words.map((w) => like(notes.content, `%${w}%`)), ...words.map((w) => like(notes.title, `%${w}%`))))
        .orderBy(sql`length(${notes.content})`)
        .limit(10)
      for (const r of rows) {
        if (body.contextType === 'note' && r.id === body.contextId) continue
        snippets.push(`[${r.title}] ${r.content.slice(0, 400)}`)
      }
    }
  } catch {
    // RAG is best-effort — never block the chat on it
  }
  const rag = snippets.length
    ? `\n\nContext notes from the learner's vault (use when relevant; do not dump them):\n${snippets.join('\n---\n')}`
    : ''
  const system = (kind === 'feynman' ? FEYNMAN_STUDENT : SOCRATIC_SYSTEM) + rag

  const coreMessages: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }))

  // persist session BEFORE streaming so the client can keep the id.
  // Only the genuinely new tail is appended — the client resends its whole
  // transcript on every send, so [...prior, ...messages] duplicated history.
  const askedForHint = HINT_ASK.test(lastUser)
  let sessionId = body.sessionId ?? null
  if (sessionId) {
    const [existing] = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).limit(1)
    if (existing) {
      const priorMessages = (existing.messages as unknown[]) ?? []
      const newMessages = messages.slice(priorMessages.length)
      await db
        .update(chatSessions)
        .set({
          ...(newMessages.length > 0 ? { messages: [...priorMessages, ...newMessages] } : {}),
          hintsUsed: existing.hintsUsed + (askedForHint && kind === 'tutor' ? 1 : 0),
        })
        .where(eq(chatSessions.id, sessionId))
    } else {
      sessionId = null
    }
  }
  if (!sessionId) {
    const [created] = await db
      .insert(chatSessions)
      .values({
        kind,
        contextType: body.contextType ?? null,
        contextId: body.contextId ?? null,
        title: lastUser.slice(0, 80),
        messages,
        hintsUsed: askedForHint && kind === 'tutor' ? 1 : 0,
      })
      .returning()
    sessionId = created!.id
  }

  try {
    return streamResponse(client, system, coreMessages, sessionId)
  } catch (e) {
    // provider errors leak base URLs / model ids / upstream statuses — keep them server-side
    return aiErrorResponse(e)
  }
})

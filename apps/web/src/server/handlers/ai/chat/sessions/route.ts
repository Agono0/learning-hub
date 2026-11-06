/**
 * /api/ai/chat/sessions — tutor session history (chat_sessions, kind='tutor').
 * GET        → the 20 most recent sessions (id, title, createdAt, score)
 * GET ?id=   → one full session with its messages
 */
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { chatSessions } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (id) {
    const parsed = z.coerce.number().int().positive().safeParse(id)
    if (!parsed.success) {
      return Response.json({ ok: false, error: 'id must be a positive integer' }, { status: 400 })
    }
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, parsed.data))
      .limit(1)
    if (!session) return Response.json({ ok: false, error: 'Session not found' }, { status: 404 })
    return Response.json({ ok: true, session })
  }

  const sessions = await db
    .select({
      id: chatSessions.id,
      kind: chatSessions.kind,
      contextType: chatSessions.contextType,
      contextId: chatSessions.contextId,
      title: chatSessions.title,
      score: chatSessions.score,
      hintsUsed: chatSessions.hintsUsed,
      createdAt: chatSessions.createdAt,
    })
    .from(chatSessions)
    .where(eq(chatSessions.kind, 'tutor'))
    .orderBy(desc(chatSessions.id))
    .limit(20)

  return Response.json({ ok: true, sessions })
})

const renameSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(120),
})

/** POST /api/ai/chat/sessions — rename a session (the title is auto-set from the first message). */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, renameSchema)
  await db.update(chatSessions).set({ title: body.title }).where(eq(chatSessions.id, body.id))
  return Response.json({ ok: true })
})

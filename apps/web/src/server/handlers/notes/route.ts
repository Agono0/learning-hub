/**
 * /api/notes — list + create notes. On create, [[wikilinks]] to existing notes
 * become note_links and markdown bullets become note_bullets rows.
 */
import { desc, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, noteBullets, noteLinks, notes } from '@learning-hub/db'
import { parseBullets, wikilinkParse } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'title required'),
  content: z.string().optional(),
  supertag: z.enum(['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK']).optional(),
  fields: z.record(z.string(), z.string()).optional(),
  status: z.enum(['inbox', 'project', 'area', 'resource', 'archive']).optional(),
  deckId: z.number().int().positive().optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')
  const rows = q
    ? await db
        .select()
        .from(notes)
        .where(or(like(notes.title, `%${q}%`), like(notes.content, `%${q}%`)))
        .orderBy(desc(notes.updatedAt))
        .limit(100)
    : await db.select().from(notes).orderBy(desc(notes.updatedAt)).limit(100)
  return Response.json({ notes: rows })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createNoteSchema)
  const content = body.content ?? ''
  const [note] = await db
    .insert(notes)
    .values({
      title: body.title,
      content,
      supertag: body.supertag ?? null,
      fields: body.fields ?? null,
      status: body.status ?? 'inbox',
      deckId: body.deckId ?? null,
    })
    .returning()

  // wikilinks → note_links (existing notes only)
  const targets = wikilinkParse(content)
  const resolved: { target: string; noteId: number }[] = []
  for (const target of targets) {
    const [hit] = await db.select().from(notes).where(eq(notes.title, target)).limit(1)
    if (hit && hit.id !== note!.id) {
      await db.insert(noteLinks).values({ fromNoteId: note!.id, toNoteId: hit.id, type: 'related' })
      resolved.push({ target, noteId: hit.id })
    }
  }
  // bullets → note_bullets
  const bullets = parseBullets(content)
  if (bullets.length) {
    await db
      .insert(noteBullets)
      .values(bullets.map((b) => ({ noteId: note!.id, content: b.content, position: b.position })))
  }
  return Response.json({ ok: true, note, links: resolved, bullets: bullets.length })
})

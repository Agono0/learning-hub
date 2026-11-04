/**
 * /api/notes/[id] — read (with backlinks + bullets), update (re-sync wikilink
 * links + bullet sync plan), delete.
 */
import { and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, noteBullets, noteLinks, notes, withTransaction } from '@learning-hub/db'
import {
  bulletSyncPlan,
  extractBacklinks,
  wikilinkParse,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const patchNoteSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  supertag: z.enum(['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK']).nullable().optional(),
  fields: z.record(z.string(), z.string()).nullable().optional(),
  status: z.enum(['inbox', 'project', 'area', 'resource', 'archive']).optional(),
})

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const noteId = Number(id)
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1)
  if (!note) return Response.json({ error: 'not found' }, { status: 404 })
  const bullets = await db.select().from(noteBullets).where(eq(noteBullets.noteId, noteId)).orderBy(noteBullets.position)
  const links = await db
    .select()
    .from(noteLinks)
    .where(or(eq(noteLinks.fromNoteId, noteId), eq(noteLinks.toNoteId, noteId)))
  const allNotes = await db.select({ id: notes.id, title: notes.title }).from(notes)
  const backlinks = extractBacklinks(allNotes, links, noteId)
  return Response.json({ note, bullets, links, backlinks })
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const noteId = Number(id)
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1)
  if (!note) return Response.json({ error: 'not found' }, { status: 404 })
  const body = await readJson(req, patchNoteSchema)

  const content = body.content ?? note.content
  const plan = withTransaction((tx) => {
    tx.update(notes)
      .set({
        title: body.title ?? note.title,
        content,
        supertag: body.supertag !== undefined ? body.supertag : note.supertag,
        fields: body.fields !== undefined ? body.fields : note.fields,
        status: body.status ?? note.status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notes.id, noteId))
      .run()

    // bullets sync (RemNote pattern)
    const rows = tx.select().from(noteBullets).where(eq(noteBullets.noteId, noteId)).all()
    const syncPlan = bulletSyncPlan(rows, content)
    for (const b of syncPlan.create) {
      tx.insert(noteBullets).values({ noteId, content: b.content, position: b.position }).run()
    }
    for (const b of syncPlan.update) {
      tx.update(noteBullets)
        .set({ content: b.content, updatedAt: new Date().toISOString() })
        .where(eq(noteBullets.id, b.id))
        .run()
    }
    for (const b of syncPlan.remove) {
      tx.delete(noteBullets).where(eq(noteBullets.id, b.id)).run()
    }

    // wikilinks: recreate missing auto-links (never delete manual links)
    const targets = wikilinkParse(content)
    const autoCreated: number[] = []
    for (const target of targets) {
      const hit = tx.select().from(notes).where(eq(notes.title, target)).limit(1).get()
      if (hit && hit.id !== noteId) {
        const existing = tx
          .select()
          .from(noteLinks)
          .where(and(eq(noteLinks.fromNoteId, noteId), eq(noteLinks.toNoteId, hit.id)))
          .limit(1)
          .get()
        if (!existing) {
          tx.insert(noteLinks).values({ fromNoteId: noteId, toNoteId: hit.id, type: 'related' }).run()
          autoCreated.push(hit.id)
        }
      }
    }

    return {
      created: syncPlan.create.length,
      updated: syncPlan.update.length,
      removed: syncPlan.remove.length,
      linksCreated: autoCreated,
    }
  })

  return Response.json({
    ok: true,
    bulletsPlan: { created: plan.created, updated: plan.updated, removed: plan.removed },
    linksCreated: plan.linksCreated,
  })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const noteId = Number(id)
  // cascade in one transaction so a failed delete never leaves orphan bullets/links
  withTransaction((tx) => {
    tx.delete(noteBullets).where(eq(noteBullets.noteId, noteId)).run()
    tx.delete(noteLinks).where(or(eq(noteLinks.fromNoteId, noteId), eq(noteLinks.toNoteId, noteId))).run()
    tx.delete(notes).where(eq(notes.id, noteId)).run()
  })
  return Response.json({ ok: true })
})

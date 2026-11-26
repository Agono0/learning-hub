/**
 * Notes repository — note catalog, backlinks, wikilinks, and bullet outliner bookkeeping.
 *
 * Implements Luhmann's Zettelkasten slip-box principles (Luhmann 1981) and
 * networked thought graphs with bi-directional wikilinks.
 */
import { rowLimit } from '../limits'
import { and, desc, eq, like, or, sql, type SQL } from 'drizzle-orm'
import { bulletSyncPlan, extractBacklinks, parseBullets, wikilinkParse } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { noteBullets, noteLinks, notes } from '../schema'
import { computeRecordNaturalKey, recordDeletionTombstone } from '../sync'
import { withTransaction } from '../transaction'

export type NoteRow = typeof notes.$inferSelect
export type NoteBulletRow = typeof noteBullets.$inferSelect
export type NoteLinkRow = typeof noteLinks.$inferSelect

export interface CreateNoteInput {
  title: string
  content?: string
  supertag?: 'BIBLIDEF' | 'DEFINITION' | 'THEOREM' | 'PERSON' | 'BOOK' | 'CORNELL' | null
  fields?: Record<string, string> | null
  status?: 'inbox' | 'project' | 'area' | 'resource' | 'archive'
  deckId?: number | null
}

export interface PatchNoteInput {
  title?: string
  content?: string
  supertag?: 'BIBLIDEF' | 'DEFINITION' | 'THEOREM' | 'PERSON' | 'BOOK' | 'CORNELL' | null
  fields?: Record<string, string> | null
  status?: 'inbox' | 'project' | 'area' | 'resource' | 'archive'
}

export interface NoteDetail {
  note: NoteRow
  bullets: NoteBulletRow[]
  links: NoteLinkRow[]
  backlinks: ReturnType<typeof extractBacklinks>
}

/**
 * List notes with optional text query filtering across title and content.
 */
export function listNotes(
  opts: {
    query?: string | null
    /** S3-93: only notes whose `fields.projectId` links to this task project. */
    projectId?: number
    limit?: number
    db?: LearningHubDB
  } = {},
): NoteRow[] {
  const db = opts.db ?? getDb()
  const q = opts.query?.trim()
  const limit = opts.limit ?? 100

  // S3-93: notes-project linking rides the typed-supertag fields JSON
  // (`fields.projectId = String(project.id)`) — no schema change, and the
  // existing PATCH fields path maintains it.
  const conditions: SQL[] = []
  if (opts.projectId !== undefined) {
    conditions.push(sql`json_extract(${notes.fields}, '$.projectId') = ${String(opts.projectId)}`)
  }

  if (q) {
    conditions.push(or(like(notes.title, `%${q}%`), like(notes.content, `%${q}%`))!)
  }

  if (conditions.length > 0) {
    return db
      .select()
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.updatedAt))
      .limit(rowLimit(limit))
      .all()
  }

  return db.select().from(notes).orderBy(desc(notes.updatedAt)).limit(rowLimit(limit)).all()
}

/**
 * Fetch a full note detail record including its bullets, links, and computed backlinks.
 */
export function getNoteDetail(id: number, opts: { db?: LearningHubDB } = {}): NoteDetail | null {
  const db = opts.db ?? getDb()
  const [note] = db.select().from(notes).where(eq(notes.id, id)).limit(1).all()
  if (!note) return null

  const bullets = db
    .select()
    .from(noteBullets)
    .where(eq(noteBullets.noteId, id))
    .orderBy(noteBullets.position)
    .all()

  const links = db
    .select()
    .from(noteLinks)
    .where(or(eq(noteLinks.fromNoteId, id), eq(noteLinks.toNoteId, id)))
    .all()

  const allNotes = db.select({ id: notes.id, title: notes.title }).from(notes).all()
  const backlinks = extractBacklinks(allNotes, links, id)

  return { note, bullets, links, backlinks }
}

/**
 * Create a new note, parse internal [[wikilinks]] into note_links, and bullet outlines.
 */
export function createNote(
  input: CreateNoteInput,
  opts: { db?: LearningHubDB } = {},
): { note: NoteRow; links: { target: string; noteId: number }[]; bulletsCount: number } {
  const db = opts.db ?? getDb()
  const content = input.content ?? ''

  const [note] = db
    .insert(notes)
    .values({
      title: input.title,
      content,
      supertag: input.supertag ?? null,
      fields: input.fields ?? null,
      status: input.status ?? 'inbox',
      deckId: input.deckId ?? null,
    })
    .returning()
    .all()

  // wikilinks -> note_links (existing notes only)
  const targets = wikilinkParse(content)
  const resolved: { target: string; noteId: number }[] = []
  for (const target of targets) {
    const [hit] = db.select().from(notes).where(eq(notes.title, target)).limit(1).all()
    if (hit && hit.id !== note!.id) {
      db.insert(noteLinks).values({ fromNoteId: note!.id, toNoteId: hit.id, type: 'related' }).run()
      resolved.push({ target, noteId: hit.id })
    }
  }

  // bullets -> note_bullets
  const bullets = parseBullets(content)
  if (bullets.length > 0) {
    db.insert(noteBullets)
      .values(bullets.map((b) => ({ noteId: note!.id, content: b.content, position: b.position })))
      .run()
  }

  return { note: note!, links: resolved, bulletsCount: bullets.length }
}

/**
 * Update an existing note, diffing bullet outlines and reconciling auto-links in a transaction.
 */
export function updateNote(
  id: number,
  input: PatchNoteInput,
  opts: { db?: LearningHubDB; nowIso?: string } = {},
): {
  note: NoteRow | null
  bulletsPlan: { created: number; updated: number; removed: number }
  linksCreated: number[]
} {
  const db = opts.db ?? getDb()
  const now = opts.nowIso ?? new Date().toISOString()
  const [existing] = db.select().from(notes).where(eq(notes.id, id)).limit(1).all()
  if (!existing) {
    return {
      note: null,
      bulletsPlan: { created: 0, updated: 0, removed: 0 },
      linksCreated: [],
    }
  }

  const content = input.content ?? existing.content

  const plan = withTransaction((tx) => {
    const [updated] = tx
      .update(notes)
      .set({
        title: input.title ?? existing.title,
        content,
        supertag: input.supertag !== undefined ? input.supertag : existing.supertag,
        fields: input.fields !== undefined ? input.fields : existing.fields,
        status: input.status ?? existing.status,
        updatedAt: now,
      })
      .where(eq(notes.id, id))
      .returning()
      .all()

    // Bullet sync
    const rows = tx.select().from(noteBullets).where(eq(noteBullets.noteId, id)).all()
    const syncPlan = bulletSyncPlan(rows, content)
    for (const b of syncPlan.create) {
      tx.insert(noteBullets).values({ noteId: id, content: b.content, position: b.position }).run()
    }
    for (const b of syncPlan.update) {
      tx.update(noteBullets)
        .set({ content: b.content, updatedAt: now })
        .where(eq(noteBullets.id, b.id))
        .run()
    }
    for (const b of syncPlan.remove) {
      tx.delete(noteBullets).where(eq(noteBullets.id, b.id)).run()
    }

    // Wikilinks auto-creation
    const targets = wikilinkParse(content)
    const autoCreated: number[] = []
    for (const target of targets) {
      const hit = tx.select().from(notes).where(eq(notes.title, target)).limit(1).get()
      if (hit && hit.id !== id) {
        const existingLink = tx
          .select()
          .from(noteLinks)
          .where(and(eq(noteLinks.fromNoteId, id), eq(noteLinks.toNoteId, hit.id)))
          .limit(1)
          .get()
        if (!existingLink) {
          tx.insert(noteLinks).values({ fromNoteId: id, toNoteId: hit.id, type: 'related' }).run()
          autoCreated.push(hit.id)
        }
      }
    }

    return {
      note: updated!,
      syncPlan: {
        created: syncPlan.create.length,
        updated: syncPlan.update.length,
        removed: syncPlan.remove.length,
      },
      linksCreated: autoCreated,
    }
  })

  return {
    note: plan.note,
    bulletsPlan: plan.syncPlan,
    linksCreated: plan.linksCreated,
  }
}

/**
 * Delete a note and cascade-delete its bullets and links atomically, recording a tombstone.
 */
export function deleteNote(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const [existing] = db
    .select({ title: notes.title })
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1)
    .all()

  if (!existing) return false

  withTransaction((tx) => {
    tx.delete(noteBullets).where(eq(noteBullets.noteId, id)).run()
    tx.delete(noteLinks)
      .where(or(eq(noteLinks.fromNoteId, id), eq(noteLinks.toNoteId, id)))
      .run()
    tx.delete(notes).where(eq(notes.id, id)).run()
  })

  const nk = computeRecordNaturalKey('notes', { title: existing.title })
  if (nk) recordDeletionTombstone('notes', nk)
  return true
}

/**
 * Associate a note bullet with an auto-generated flashcard.
 */
export function linkNoteBulletCard(
  bulletId: number,
  cardId: number,
  opts: { db?: LearningHubDB; nowIso?: string } = {},
): boolean {
  const db = opts.db ?? getDb()
  const now = opts.nowIso ?? new Date().toISOString()
  const res = db
    .update(noteBullets)
    .set({ cardId, updatedAt: now })
    .where(eq(noteBullets.id, bulletId))
    .run()
  return res.changes > 0
}

/**
 * Learning HUB — Visual Learning repository.
 *
 * Mind-maps, batch occlusion card generation, and handwritten review attempt storage.
 */
import { and, desc, eq, like } from 'drizzle-orm'
import {
  expandOcclusionToCards,
  mindmapToCards,
  type ExpandOcclusionInput,
  type MindmapData,
  type MindmapNode,
} from '@learning-hub/core/visual'
import { getDb, type LearningHubDB } from '../index'
import { cardAttemptImages, cards, decks, mindmaps } from '../schema'
import { withTransaction } from '../transaction'

export function listMindmaps(database?: LearningHubDB): (typeof mindmaps.$inferSelect)[] {
  const conn = database ?? getDb()
  return conn.select().from(mindmaps).orderBy(desc(mindmaps.updatedAt)).all()
}

export function getMindmap(
  id: number,
  database?: LearningHubDB,
): typeof mindmaps.$inferSelect | null {
  const conn = database ?? getDb()
  return conn.select().from(mindmaps).where(eq(mindmaps.id, id)).get() ?? null
}

export function createMindmap(
  input: { title: string; nodesJson: string; edgesJson?: string },
  database?: LearningHubDB,
): typeof mindmaps.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  const [created] = conn
    .insert(mindmaps)
    .values({
      title: input.title,
      nodesJson: input.nodesJson,
      edgesJson: input.edgesJson ?? '[]',
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning()
    .all()
  return created!
}

export function updateMindmap(
  id: number,
  input: { title?: string; nodesJson?: string; edgesJson?: string },
  database?: LearningHubDB,
): typeof mindmaps.$inferSelect | null {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  const patch: Partial<typeof mindmaps.$inferInsert> = {
    updatedAt: nowIso,
  }
  if (input.title !== undefined) patch.title = input.title
  if (input.nodesJson !== undefined) patch.nodesJson = input.nodesJson
  if (input.edgesJson !== undefined) patch.edgesJson = input.edgesJson

  conn.update(mindmaps).set(patch).where(eq(mindmaps.id, id)).run()
  return getMindmap(id, conn)
}

export function deleteMindmap(id: number, database?: LearningHubDB): boolean {
  const conn = database ?? getDb()
  const existing = conn.select().from(mindmaps).where(eq(mindmaps.id, id)).get()
  if (!existing) return false
  conn.delete(mindmaps).where(eq(mindmaps.id, id)).run()
  return true
}

export function logCardAttemptImage(
  entry: { cardId: number; reviewId?: number; imageData: string },
  database?: LearningHubDB,
): typeof cardAttemptImages.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  const [created] = conn
    .insert(cardAttemptImages)
    .values({
      cardId: entry.cardId,
      reviewId: entry.reviewId,
      imageData: entry.imageData,
      createdAt: nowIso,
    })
    .returning()
    .all()
  return created!
}

export function getLatestCardAttemptImage(
  cardId: number,
  database?: LearningHubDB,
): typeof cardAttemptImages.$inferSelect | null {
  const conn = database ?? getDb()
  return (
    conn
      .select()
      .from(cardAttemptImages)
      .where(eq(cardAttemptImages.cardId, cardId))
      .orderBy(desc(cardAttemptImages.id))
      .limit(1)
      .get() ?? null
  )
}

/**
 * Expands an occlusion image into N review cards and inserts them atomically into target deck.
 */
export function batchCreateOcclusionCards(
  deckId: number,
  input: ExpandOcclusionInput,
  database?: LearningHubDB,
): (typeof cards.$inferSelect)[] {
  const conn = database ?? getDb()
  const expanded = expandOcclusionToCards(input)
  const nowIso = new Date().toISOString()

  return withTransaction((tx) => {
    const createdList: (typeof cards.$inferSelect)[] = []
    for (const item of expanded) {
      const [row] = tx
        .insert(cards)
        .values({
          deckId,
          type: item.type,
          content: item.content,
          due: nowIso,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          state: 0,
          learningStep: 0,
          suspended: false,
          createdAt: nowIso,
        })
        .returning()
        .all()
      if (row) createdList.push(row)
    }
    return createdList
  }, conn)
}

/** Why a mind-map import could not run (mapped to 404 / 422 by the HTTP layer). */
export class MindmapImportError extends Error {
  constructor(
    readonly code: 'mindmap_not_found' | 'deck_not_found' | 'invalid_mindmap',
    message: string,
  ) {
    super(message)
    this.name = 'MindmapImportError'
  }
}

/** FNV-1a 32-bit — a short, stable fingerprint of a generated card's content. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Stable origin key for a card generated from mind map `mindmapId`. */
export function mindmapCardSource(mindmapId: number, content: unknown): string {
  return `mindmap:${mindmapId}:${fingerprint(JSON.stringify(content))}`
}

function parseJsonArray(text: string | null | undefined, what: string): unknown[] {
  try {
    const v: unknown = JSON.parse(text || '[]')
    if (Array.isArray(v)) return v
  } catch {
    /* fall through */
  }
  throw new MindmapImportError('invalid_mindmap', `Mind map ${what} are not valid JSON`)
}

/**
 * Converts a mindmap's concepts and hierarchy into flashcards in the target deck.
 *
 * Idempotent per deck: every generated card carries a stable `source`
 * (`mindmap:<id>:<content hash>`), and cards that already exist in the deck
 * are skipped — re-importing after editing the map adds only the new cards and
 * never resets review history. A card whose generated text changed (e.g. a
 * parent's child list) is added as a new card; the old one is kept, not
 * overwritten. Throws {@link MindmapImportError}.
 */
export function importMindmapCards(
  mindmapId: number,
  targetDeckId: number,
  database?: LearningHubDB,
): { created: (typeof cards.$inferSelect)[]; skipped: number } {
  const conn = database ?? getDb()
  const row = getMindmap(mindmapId, conn)
  if (!row) throw new MindmapImportError('mindmap_not_found', `Mind map ${mindmapId} not found`)
  if (!conn.select({ id: decks.id }).from(decks).where(eq(decks.id, targetDeckId)).get()) {
    throw new MindmapImportError('deck_not_found', `Deck ${targetDeckId} not found`)
  }

  const nodes = parseJsonArray(row.nodesJson, 'nodes') as MindmapNode[]
  const edges = parseJsonArray(row.edgesJson, 'edges') as MindmapData['edges']
  if (!nodes.every((n) => n && typeof n.id === 'string' && typeof n.text === 'string')) {
    throw new MindmapImportError('invalid_mindmap', 'Mind map nodes need string id and text')
  }

  const generated = mindmapToCards({ title: row.title, nodes, edges })
  const nowIso = new Date().toISOString()

  return withTransaction((tx) => {
    const existing = new Set(
      tx
        .select({ source: cards.source })
        .from(cards)
        .where(and(eq(cards.deckId, targetDeckId), like(cards.source, `mindmap:${mindmapId}:%`)))
        .all()
        .map((r) => r.source),
    )

    const created: (typeof cards.$inferSelect)[] = []
    let skipped = 0
    for (const card of generated) {
      const source = mindmapCardSource(mindmapId, card.content)
      if (existing.has(source)) {
        skipped++
        continue
      }
      existing.add(source) // the generator can emit the same card twice
      const [newRow] = tx
        .insert(cards)
        .values({
          deckId: targetDeckId,
          type: card.format,
          content: card.content,
          tags: card.tags,
          source,
          due: nowIso,
          createdAt: nowIso,
        })
        .returning()
        .all()
      if (newRow) created.push(newRow)
    }
    return { created, skipped }
  }, conn)
}

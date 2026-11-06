/**
 * Learning HUB — Visual Learning repository.
 *
 * Mind-maps, batch occlusion card generation, and handwritten review attempt storage.
 */
import { desc, eq } from 'drizzle-orm'
import {
  expandOcclusionToCards,
  mindmapToCards,
  type ExpandOcclusionInput,
  type MindmapData,
  type MindmapNode,
} from '@learning-hub/core/visual'
import { getDb, type LearningHubDB } from '../index'
import { cardAttemptImages, cards, mindmaps } from '../schema'
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

/**
 * Converts a mindmap's concepts and hierarchy into flashcards in the target deck.
 */
export function importMindmapCards(
  mindmapId: number,
  targetDeckId: number,
  database?: LearningHubDB,
): (typeof cards.$inferSelect)[] {
  const conn = database ?? getDb()
  const row = getMindmap(mindmapId, conn)
  if (!row) throw new Error(`Mindmap ${mindmapId} not found`)

  const nodes = JSON.parse(row.nodesJson) as MindmapNode[]
  const edges = JSON.parse(row.edgesJson || '[]')
  const mindmapData: MindmapData = {
    title: row.title,
    nodes,
    edges,
  }

  const generated = mindmapToCards(mindmapData)
  const nowIso = new Date().toISOString()

  return withTransaction((tx) => {
    const createdList: (typeof cards.$inferSelect)[] = []
    for (const card of generated) {
      const [newRow] = tx
        .insert(cards)
        .values({
          deckId: targetDeckId,
          type: card.format,
          content: card.content,
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
      if (newRow) createdList.push(newRow)
    }
    return createdList
  }, conn)
}

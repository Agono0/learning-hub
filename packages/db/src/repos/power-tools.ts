/**
 * @fileoverview Repositories for Milestone 12 Power Tools:
 * - Quick Captures (inbox thoughts, external references)
 * - Card Vector Embeddings & Similarity Search
 */
import { desc, eq } from 'drizzle-orm'
import { cosineSimilarity } from '@learning-hub/core/embeddings'
import { getDb, type LearningHubDB } from '../index'
import { cardEmbeddings, cards, quickCaptures } from '../schema'

export interface QuickCaptureRow {
  id: number
  text: string
  sourceUrl: string | null
  sourceTitle: string | null
  tags: string[] | null
  processed: boolean
  createdAt: string
}

export function createQuickCapture(data: {
  text: string
  sourceUrl?: string | null
  sourceTitle?: string | null
  tags?: string[]
}): QuickCaptureRow {
  const db = getDb()
  const [created] = db
    .insert(quickCaptures)
    .values({
      text: data.text,
      sourceUrl: data.sourceUrl ?? null,
      sourceTitle: data.sourceTitle ?? null,
      tags: data.tags ?? [],
      processed: false,
    })
    .returning()
    .all()

  return created as QuickCaptureRow
}

export function listQuickCaptures(limit = 50, includeProcessed = false): QuickCaptureRow[] {
  const db = getDb()
  if (includeProcessed) {
    return db
      .select()
      .from(quickCaptures)
      .orderBy(desc(quickCaptures.createdAt))
      .limit(limit)
      .all() as QuickCaptureRow[]
  }
  return db
    .select()
    .from(quickCaptures)
    .where(eq(quickCaptures.processed, false))
    .orderBy(desc(quickCaptures.createdAt))
    .limit(limit)
    .all() as QuickCaptureRow[]
}

export function markQuickCaptureProcessed(id: number, processed = true): boolean {
  const db = getDb()
  const result = db.update(quickCaptures).set({ processed }).where(eq(quickCaptures.id, id)).run()

  return result.changes > 0
}

export function deleteQuickCapture(id: number): boolean {
  const db = getDb()
  const result = db.delete(quickCaptures).where(eq(quickCaptures.id, id)).run()
  return result.changes > 0
}

export function upsertCardEmbedding(data: {
  cardId: number
  embedding: number[]
  model?: string
}): void {
  const db = getDb()
  db.insert(cardEmbeddings)
    .values({
      cardId: data.cardId,
      embedding: data.embedding,
      model: data.model ?? 'all-MiniLM-L6-v2',
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: cardEmbeddings.cardId,
      set: {
        embedding: data.embedding,
        model: data.model ?? 'all-MiniLM-L6-v2',
        updatedAt: new Date().toISOString(),
      },
    })
    .run()
}

export function getCardEmbedding(cardId: number) {
  const db = getDb()
  const row = db.select().from(cardEmbeddings).where(eq(cardEmbeddings.cardId, cardId)).get()
  return row ?? null
}

export function listCardEmbeddings(model = 'all-MiniLM-L6-v2') {
  const db = getDb()
  return db.select().from(cardEmbeddings).where(eq(cardEmbeddings.model, model)).all()
}

export interface SemanticCardMatch {
  cardId: number
  score: number
  front: string
  back: string
  deckId: number
}

/**
 * Searches card embeddings by cosine similarity against a query vector,
 * joining the cards table to return prompt and answer text.
 */
export function searchCardEmbeddingsCosine(
  queryVector: number[],
  topK = 5,
  minScore = 0.3,
): SemanticCardMatch[] {
  const db = getDb()
  const rows = db
    .select({
      cardId: cardEmbeddings.cardId,
      embedding: cardEmbeddings.embedding,
      deckId: cards.deckId,
      content: cards.content,
    })
    .from(cardEmbeddings)
    .innerJoin(cards, eq(cardEmbeddings.cardId, cards.id))
    .all()

  const matches: SemanticCardMatch[] = []

  for (const row of rows) {
    const emb = row.embedding
    if (!emb || emb.length !== queryVector.length) continue
    const score = cosineSimilarity(queryVector, emb)
    if (score >= minScore) {
      let front = 'Card prompt'
      let back = 'Card answer'
      if (row.content && typeof row.content === 'object') {
        const c = row.content as any
        if (c.basic) {
          front = c.basic.front || ''
          back = c.basic.back || ''
        } else if (c.typein) {
          front = c.typein.question || ''
          back = c.typein.acceptedAnswers?.[0] || ''
        } else if (c.cloze) {
          front = c.cloze.text || ''
        }
      }

      matches.push({
        cardId: row.cardId,
        deckId: row.deckId,
        score,
        front,
        back,
      })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  return matches.slice(0, topK)
}

/**
 * @fileoverview Repositories for Milestone 12 Power Tools:
 * - Quick Captures (inbox thoughts, external references)
 * - Card Vector Embeddings & Similarity Search
 */
import { desc, eq, sql } from 'drizzle-orm'
import { cosineSimilarity } from '@learning-hub/core/embeddings'
import { getDb, type LearningHubDB } from '../index'
import { cardEmbeddings, cards, quickCaptures, embeddings } from '../schema'

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

// ── Omniverse embeddings (migration 019) — generic related-content engine ────

export type EmbeddingKind =
  | 'note'
  | 'card'
  | 'lesson'
  | 'highlight'
  | 'journal'
  | 'source'
  | 'idea'
  | 'mindmap'
  | 'canvas'
  | 'palace'
  | 'goal'
  | 'capture'

export const EMBEDDING_KINDS: readonly EmbeddingKind[] = [
  'note',
  'card',
  'lesson',
  'highlight',
  'journal',
  'source',
  'idea',
  'mindmap',
  'canvas',
  'palace',
  'goal',
  'capture',
]

/** Title + deep link per kind — powers related-content hits. */
const KIND_META_SQL: Record<EmbeddingKind, { title: string; href: string }> = {
  note: { title: "coalesce(title, 'Untitled note')", href: '/notes' },
  card: {
    title:
      "substr(coalesce(json_extract(content, '$.basic.front'), coalesce(json_extract(content, '$.mcq.question'), coalesce(json_extract(content, '$.cloze.text'), 'card')), 1, 80)",
    href: '/decks',
  },
  lesson: { title: "coalesce(title, 'Lesson')", href: '/courses' },
  highlight: { title: "substr(coalesce(text, ''), 1, 80)", href: '/reading' },
  journal: { title: "'Journal — ' || coalesce(date, '')", href: '/journal' },
  source: { title: "coalesce(title, 'Source')", href: '/reading' },
  idea: { title: "coalesce(title, 'Idea')", href: '/ideas' },
  mindmap: { title: "coalesce(title, 'Mind map')", href: '/mindmap' },
  canvas: { title: "coalesce(title, 'Canvas')", href: '/canvas' },
  palace: { title: "coalesce(name, 'Palace')", href: '/palace' },
  goal: { title: "substr(coalesce(wish, 'Goal'), 1, 80)", href: '/motivation' },
  capture: { title: "substr(coalesce(text, ''), 1, 80)", href: '/' },
}

/** Physical table per kind (kind name ≠ table name in three cases). */
function tableFor(kind: EmbeddingKind): string {
  if (kind === 'capture') return 'quick_captures'
  if (kind === 'goal') return 'goals'
  if (kind === 'journal') return 'journal_entries'
  return `${kind}s`
}

/** Source text expression per kind (what gets embedded). */
const BODY_SQL: Record<EmbeddingKind, string> = {
  note: "title || ' ' || coalesce(content, '')",
  card: "coalesce(tags, '') || ' ' || coalesce(content, '')",
  lesson: "title || ' ' || coalesce(content, '')",
  highlight: "coalesce(text, '') || ' ' || coalesce(note, '')",
  journal:
    "coalesce(small_wins, '') || ' ' || coalesce(gratitude, '') || ' ' || coalesce(worry_dump, '')",
  source: "title || ' ' || coalesce(content, '')",
  idea: "title || ' ' || coalesce(content, '')",
  mindmap: "title || ' ' || coalesce(nodes_json, '')",
  canvas: "title || ' ' || coalesce(items, '')",
  palace: "name || ' ' || coalesce(description, '')",
  goal: "coalesce(wish, '') || ' ' || coalesce(outcome, '') || ' ' || coalesce(obstacle, '')",
  capture: "coalesce(text, '') || ' ' || coalesce(source_title, '')",
}

export interface UpsertEmbeddingItem {
  kind: EmbeddingKind
  refId: number
  vector: number[]
  model?: string
}

/** Upserts a batch of vectors (one transaction, last-write-wins per pair). */
export function upsertEmbeddings(items: UpsertEmbeddingItem[], model = 'all-MiniLM-L6-v2'): number {
  if (items.length === 0) return 0
  const db = getDb()
  let written = 0
  db.transaction((tx) => {
    for (const item of items) {
      if (!KIND_META_SQL[item.kind as EmbeddingKind]) continue
      if (!Array.isArray(item.vector) || item.vector.length === 0) continue
      tx.insert(embeddings)
        .values({
          kind: item.kind,
          refId: item.refId,
          dim: item.vector.length,
          vector: item.vector,
          model: item.model ?? model,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [embeddings.kind, embeddings.refId],
          set: {
            dim: item.vector.length,
            vector: item.vector,
            model: item.model ?? model,
            updatedAt: new Date().toISOString(),
          },
        })
        .run()
      written++
    }
  })
  return written
}

/** Source text rows for kinds that have no embedding yet. */
export function getPendingEmbeddingTexts(
  kinds: EmbeddingKind[],
  limit = 120,
): Array<{ kind: EmbeddingKind; refId: number; text: string }> {
  const db = getDb()
  const out: Array<{ kind: EmbeddingKind; refId: number; text: string }> = []
  for (const kind of kinds) {
    if (!KIND_META_SQL[kind]) continue
    const rows = db.all<{ id: number; text: string }>(
      sql.raw(
        `SELECT id, substr(${BODY_SQL[kind]}, 1, 2000) AS text FROM "${tableFor(kind)}" WHERE id NOT IN (SELECT ref_id FROM embeddings WHERE kind = '${kind}') LIMIT ${limit}`,
      ),
    )
    for (const r of rows) {
      if (r.text && r.text.trim().length > 0) out.push({ kind, refId: r.id, text: r.text })
    }
  }
  return out
}

export interface EmbeddingStatus {
  kind: EmbeddingKind
  indexed: number
  total: number
}

/** Index coverage per kind (indexed vs total rows). */
export function getEmbeddingStatus(): {
  model: string
  dims: number | null
  kinds: EmbeddingStatus[]
} {
  const db = getDb()
  const first = db
    .select({ dim: embeddings.dim, model: embeddings.model })
    .from(embeddings)
    .limit(1)
    .get()
  const kinds: EmbeddingStatus[] = []
  for (const kind of EMBEDDING_KINDS) {
    try {
      const total =
        db.all<{ c: number }>(sql.raw(`SELECT count(*) AS c FROM "${tableFor(kind)}"`))[0]?.c ?? 0
      const indexed =
        db.all<{ c: number }>(
          sql.raw(`SELECT count(*) AS c FROM embeddings WHERE kind = '${kind}'`),
        )[0]?.c ?? 0
      kinds.push({ kind, indexed, total })
    } catch {
      kinds.push({ kind, indexed: 0, total: 0 })
    }
  }
  return { model: first?.model ?? 'all-MiniLM-L6-v2', dims: first?.dim ?? null, kinds }
}

export interface RelatedHit {
  kind: EmbeddingKind
  refId: number
  title: string
  href: string
  score: number
}

/**
 * "Related content": cosine top-K neighbours of one item's vector across all
 * other kinds. Pure SQL + math — the vector is already stored.
 */
export function findRelatedEmbeddings(
  kind: EmbeddingKind,
  refId: number,
  topK = 6,
  minScore = 0.25,
): { found: boolean; hits: RelatedHit[] } {
  const db = getDb()
  const target = db
    .select({ vector: embeddings.vector, dim: embeddings.dim })
    .from(embeddings)
    .where(sql`${embeddings.kind} = ${kind} AND ${embeddings.refId} = ${refId}`)
    .get()
  if (!target) return { found: false, hits: [] }

  const rows = db.all<{ kind: string; ref_id: number; vector: number[] }>(
    sql`SELECT kind, ref_id, vector FROM embeddings WHERE NOT (kind = ${kind} AND ref_id = ${refId})`,
  )

  const scored: Array<{ kind: EmbeddingKind; refId: number; score: number }> = []
  for (const row of rows) {
    const k = row.kind as EmbeddingKind
    if (!KIND_META_SQL[k]) continue
    if (!Array.isArray(row.vector) || row.vector.length !== target.dim) continue
    const score = cosineSimilarity(target.vector, row.vector)
    if (score >= minScore) scored.push({ kind: k, refId: row.ref_id, score })
  }
  scored.sort((a, b) => b.score - a.score)

  const hits: RelatedHit[] = []
  for (const s of scored.slice(0, topK)) {
    const meta = KIND_META_SQL[s.kind]
    try {
      const row = db.all<{ title: string }>(
        sql.raw(`SELECT ${meta.title} AS title FROM "${tableFor(s.kind)}" WHERE id = ${s.refId}`),
      )[0]
      hits.push({
        kind: s.kind,
        refId: s.refId,
        title: row?.title ?? '(untitled)',
        href: meta.href,
        score: Math.round(s.score * 1000) / 1000,
      })
    } catch {
      // row deleted since indexing — skip
    }
  }
  return { found: true, hits }
}

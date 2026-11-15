/**
 * Reading repository — incremental reading (SuperMemo / Wozniak 1999),
 * Readwise-style highlight resurfacing and spaced triage, and Robinson's SQ3R
 * active reading sessions (Robinson 1946).
 */
import { desc, eq, inArray } from 'drizzle-orm'
import {
  extractSurveyHeadings,
  nextFragment,
  resurfaceHighlights,
  resurfaceSeen,
  triageUpdate,
  type HighlightRow as CoreHighlightRow,
  type HighlightTriage,
  type SourceKind,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards, decks, highlights, sources, sq3rSessions, type Sq3rQuestionItem } from '../schema'
import { withTransaction } from '../transaction'

export type SourceRow = typeof sources.$inferSelect
export type HighlightRow = typeof highlights.$inferSelect
export type Sq3rSessionRow = typeof sq3rSessions.$inferSelect
export type { HighlightTriage, SourceKind }

export interface CreateSourceInput {
  title: string
  content: string
  kind?: SourceKind
  url?: string | null
  priority?: number
  position?: number
  status?: string
  addedAt?: string
  lastReadAt?: string | null
}

export interface PatchSourceInput {
  title?: string
  content?: string
  url?: string | null
  position?: number
  priority?: number
  status?: string
  lastReadAt?: string | null
}

export interface SourceDetail {
  source: SourceRow
  highlights: HighlightRow[]
  fragment: ReturnType<typeof nextFragment>
}

export interface ResurfacedHighlight extends CoreHighlightRow {
  sourceTitle: string | null
}

export interface UpsertSq3rSessionInput {
  surveyHeadings?: string[]
  questions?: Sq3rQuestionItem[]
  reciteNotes?: string
  completedSteps?: string[]
}

export type ConvertSq3rCardsResult =
  | { success: true; createdCards: number; deckId: number; session: Sq3rSessionRow }
  | { success: false; error: 'source_not_found' | 'session_not_found' | 'deck_not_found' }

/**
 * List sources ordered by priority descending (SuperMemo 0-100 queue).
 */
export function listSources(
  opts: {
    status?: 'queued' | 'reading' | 'done'
    limit?: number
    db?: LearningHubDB
  } = {},
): SourceRow[] {
  const db = opts.db ?? getDb()
  const limit = opts.limit ?? 200
  let query = db.select().from(sources).$dynamic()
  if (opts.status) {
    query = query.where(eq(sources.status, opts.status))
  }
  return query.orderBy(desc(sources.priority)).limit(limit).all()
}

/**
 * Fetch a single source by id.
 */
export function getSource(id: number, opts: { db?: LearningHubDB } = {}): SourceRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(sources).where(eq(sources.id, id)).limit(1).all()
  return row ?? null
}

/**
 * Fetch source detail including child highlights and the next readable fragment.
 */
export function getSourceDetail(
  id: number,
  opts: {
    fragmentLength?: number
    db?: LearningHubDB
  } = {},
): SourceDetail | null {
  const db = opts.db ?? getDb()
  const source = getSource(id, { db })
  if (!source) return null

  const rows = db.select().from(highlights).where(eq(highlights.sourceId, id)).all()
  const fragment = nextFragment(source, opts.fragmentLength ?? 800)

  return {
    source,
    highlights: rows,
    fragment,
  }
}

/**
 * Insert a new reading source.
 */
export function createSource(
  input: CreateSourceInput,
  opts: { db?: LearningHubDB } = {},
): SourceRow {
  const db = opts.db ?? getDb()
  const [created] = db
    .insert(sources)
    .values({
      title: input.title,
      content: input.content,
      kind: input.kind ?? 'paste',
      url: input.url ?? null,
      priority: input.priority ?? 50,
      position: input.position ?? 0,
      status: input.status ?? 'queued',
      addedAt: input.addedAt ?? new Date().toISOString(),
      lastReadAt: input.lastReadAt ?? null,
    })
    .returning()
    .all()

  return created!
}

/**
 * Update an existing source's reading position, priority, or status.
 * Position updates automatically update lastReadAt and transition status
 * ('queued' -> 'reading' when position > 0, or -> 'done' when position >= 100).
 */
export function updateSource(
  id: number,
  patch: PatchSourceInput,
  opts: { now?: Date; db?: LearningHubDB } = {},
): SourceRow | null {
  const db = opts.db ?? getDb()
  const source = getSource(id, { db })
  if (!source) return null

  const now = (opts.now ?? new Date()).toISOString()
  const values: Partial<typeof sources.$inferInsert> = {}

  if (patch.title !== undefined) values.title = patch.title
  if (patch.content !== undefined) values.content = patch.content
  if (patch.url !== undefined) values.url = patch.url

  if (patch.position !== undefined) {
    values.position = Math.round(patch.position)
    values.lastReadAt = now
    if (values.position >= 100) {
      values.status = 'done'
    } else if (source.status === 'queued') {
      values.status = 'reading'
    }
  }

  if (patch.priority !== undefined) {
    values.priority = Math.round(patch.priority)
  }

  if (patch.status !== undefined) {
    values.status = patch.status
  }

  if (patch.lastReadAt !== undefined) {
    values.lastReadAt = patch.lastReadAt
  }

  const [updated] = db.update(sources).set(values).where(eq(sources.id, id)).returning().all()
  return updated ?? null
}

/**
 * Delete a reading source and all associated highlights and SQ3R sessions atomically.
 */
export function deleteSource(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  return withTransaction((tx) => {
    tx.delete(sq3rSessions).where(eq(sq3rSessions.sourceId, id)).run()
    tx.delete(highlights).where(eq(highlights.sourceId, id)).run()
    const result = tx.delete(sources).where(eq(sources.id, id)).run()
    return (result.changes ?? 0) > 0
  }, opts.db)
}

/**
 * List highlights with optional sourceId filter.
 */
export function listHighlights(
  opts: {
    sourceId?: number
    db?: LearningHubDB
  } = {},
): HighlightRow[] {
  const db = opts.db ?? getDb()
  if (opts.sourceId) {
    return db.select().from(highlights).where(eq(highlights.sourceId, opts.sourceId)).all()
  }
  return db.select().from(highlights).all()
}

/**
 * Resurface highlights using Readwise-style power decay without mutating strength.
 * Passive read: strength/lastReviewedAt are NOT touched (Rule: no hidden mutations).
 */
export function resurfaceHighlightsQuery(
  opts: {
    limit?: number
    now?: Date
    db?: LearningHubDB
  } = {},
): ResurfacedHighlight[] {
  const db = opts.db ?? getDb()
  const rows = db.select().from(highlights).all()
  const limit = opts.limit ?? 10
  const now = opts.now ?? new Date()

  const resurfaced = resurfaceHighlights(rows as CoreHighlightRow[], now, limit)
  return resurfaced.map((h) => {
    const [src] = db
      .select({ title: sources.title })
      .from(sources)
      .where(eq(sources.id, h.sourceId))
      .limit(1)
      .all()
    return {
      ...h,
      sourceTitle: src?.title ?? null,
    }
  })
}

/**
 * Explicitly promote strength for resurfaced highlights marked as seen by the user.
 */
export function markHighlightsSeen(
  seenIds: number[],
  opts: { now?: Date; db?: LearningHubDB } = {},
): number[] {
  const db = opts.db ?? getDb()
  if (seenIds.length === 0) return []

  const rows = db.select().from(highlights).where(inArray(highlights.id, seenIds)).all()
  const now = opts.now ?? new Date()
  const updated: number[] = []

  for (const h of rows) {
    const update = resurfaceSeen(h as CoreHighlightRow, now)
    db.update(highlights).set(update).where(eq(highlights.id, h.id)).run()
    updated.push(h.id)
  }

  return updated
}

/**
 * Create highlight candidates extracted from a source text.
 */
export function createHighlightCandidates(
  sourceId: number,
  candidates: string[],
  opts: { db?: LearningHubDB } = {},
): HighlightRow[] {
  return withTransaction((tx) => {
    const created: HighlightRow[] = []
    for (const text of candidates) {
      const [row] = tx
        .insert(highlights)
        .values({
          sourceId,
          text,
          strength: 0.5,
          triaged: 0 as HighlightTriage,
        })
        .returning()
        .all()
      if (row) created.push(row)
    }
    return created
  }, opts.db)
}

/**
 * Triage a highlight (keep or discard) and update its strength / review timestamp.
 */
export function triageHighlight(
  id: number,
  action: 'keep' | 'discard',
  opts: { now?: Date; db?: LearningHubDB } = {},
): { id: number; triaged: HighlightTriage; strength: number } | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(highlights).where(eq(highlights.id, id)).limit(1).all()
  if (!row) return null

  const now = opts.now ?? new Date()
  const update = triageUpdate(row as CoreHighlightRow, action, now)
  db.update(highlights).set(update).where(eq(highlights.id, id)).run()

  return { id, triaged: update.triaged, strength: update.strength }
}

/**
 * Get or create an SQ3R guided study session for a source.
 * Automatically generates survey headings from Markdown/content if session is newly created.
 */
export function getOrCreateSq3rSession(
  sourceId: number,
  opts: { now?: Date; db?: LearningHubDB } = {},
): Sq3rSessionRow | null {
  const db = opts.db ?? getDb()
  const source = getSource(sourceId, { db })
  if (!source) return null

  const [existing] = db
    .select()
    .from(sq3rSessions)
    .where(eq(sq3rSessions.sourceId, sourceId))
    .limit(1)
    .all()

  if (existing) return existing

  const now = (opts.now ?? new Date()).toISOString()
  const autoHeadings = extractSurveyHeadings(source.content, 15)

  const [created] = db
    .insert(sq3rSessions)
    .values({
      sourceId,
      surveyHeadings: autoHeadings,
      questions: [],
      reciteNotes: '',
      completedSteps: [],
      updatedAt: now,
    })
    .returning()
    .all()

  return created ?? null
}

/**
 * Upsert an SQ3R session with survey headings, questions, recite notes, or completed steps.
 */
export function upsertSq3rSession(
  sourceId: number,
  input: UpsertSq3rSessionInput,
  opts: { now?: Date; db?: LearningHubDB } = {},
): Sq3rSessionRow | null {
  const db = opts.db ?? getDb()
  const source = getSource(sourceId, { db })
  if (!source) return null

  const now = (opts.now ?? new Date()).toISOString()

  return withTransaction((tx) => {
    const existing = tx.select().from(sq3rSessions).where(eq(sq3rSessions.sourceId, sourceId)).get()

    if (!existing) {
      const [created] = tx
        .insert(sq3rSessions)
        .values({
          sourceId,
          surveyHeadings: input.surveyHeadings ?? extractSurveyHeadings(source.content, 15),
          questions: input.questions ?? [],
          reciteNotes: input.reciteNotes ?? '',
          completedSteps: input.completedSteps ?? [],
          updatedAt: now,
        })
        .returning()
        .all()
      return created ?? null
    }

    const [updated] = tx
      .update(sq3rSessions)
      .set({
        ...(input.surveyHeadings !== undefined ? { surveyHeadings: input.surveyHeadings } : {}),
        ...(input.questions !== undefined ? { questions: input.questions } : {}),
        ...(input.reciteNotes !== undefined ? { reciteNotes: input.reciteNotes } : {}),
        ...(input.completedSteps !== undefined ? { completedSteps: input.completedSteps } : {}),
        updatedAt: now,
      })
      .where(eq(sq3rSessions.id, existing.id))
      .returning()
      .all()

    return updated ?? null
  }, db)
}

/**
 * Convert SQ3R session questions & answers into basic flashcards inside an existing or new deck.
 * Marks completedSteps with 'review'.
 */
export function convertSq3rToCards(
  input: {
    sourceId: number
    deckId?: number
    now?: Date
  },
  opts: { db?: LearningHubDB } = {},
): ConvertSq3rCardsResult {
  return withTransaction((tx) => {
    const source = tx.select().from(sources).where(eq(sources.id, input.sourceId)).get()
    if (!source) return { success: false, error: 'source_not_found' }

    const session = tx
      .select()
      .from(sq3rSessions)
      .where(eq(sq3rSessions.sourceId, input.sourceId))
      .get()
    if (!session) return { success: false, error: 'session_not_found' }

    let targetDeckId = input.deckId ?? null
    if (targetDeckId !== null) {
      const exists = tx.select({ id: decks.id }).from(decks).where(eq(decks.id, targetDeckId)).get()
      if (!exists) return { success: false, error: 'deck_not_found' }
    } else {
      const deckName = `SQ3R — ${source.title.slice(0, 60)}`
      const existingDeck = tx
        .select({ id: decks.id })
        .from(decks)
        .where(eq(decks.name, deckName))
        .get()

      if (existingDeck) {
        targetDeckId = existingDeck.id
      } else {
        const [createdDeck] = tx
          .insert(decks)
          .values({
            name: deckName,
            description: `SQ3R active-reading questions from "${source.title}"`,
            emoji: '📖',
          })
          .returning()
          .all()
        targetDeckId = createdDeck!.id
      }
    }

    const now = (input.now ?? new Date()).toISOString()
    let createdCount = 0
    const updatedQuestions: Sq3rQuestionItem[] = session.questions.map((q) => {
      if (q.cardId || !q.question.trim() || !q.answer.trim()) return q
      const [card] = tx
        .insert(cards)
        .values({
          deckId: targetDeckId!,
          type: 'basic',
          content: {
            basic: {
              front: q.question.trim(),
              back: q.answer.trim(),
            },
          },
          tags: ['sq3r'],
          source: `sq3r:${source.id}`,
          due: now,
          createdAt: now,
        })
        .returning()
        .all()
      createdCount += 1
      return { ...q, cardId: card!.id }
    })

    const nextSteps = session.completedSteps.includes('review')
      ? session.completedSteps
      : [...session.completedSteps, 'review']

    const [updatedSession] = tx
      .update(sq3rSessions)
      .set({
        questions: updatedQuestions,
        completedSteps: nextSteps,
        updatedAt: now,
      })
      .where(eq(sq3rSessions.id, session.id))
      .returning()
      .all()

    return {
      success: true,
      createdCards: createdCount,
      deckId: targetDeckId!,
      session: updatedSession!,
    }
  }, opts.db)
}

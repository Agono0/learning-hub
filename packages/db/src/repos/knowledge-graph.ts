/**
 * @fileoverview Repositories for Milestone 13:
 * - Curriculum Concept Dependencies (Prerequisite Graph)
 * - Anki Note & Card Synchronization Mappings
 */
import { rowLimit } from '../limits'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import type { AnkiSyncMode } from '@learning-hub/core/anki-connect'
import { willCreateCycle } from '@learning-hub/core/knowledge-graph'
import { pendingTombstone } from '../sync'
import { getDb, type LearningHubDB } from '../index'
import {
  ankiSyncMappings,
  cards,
  conceptDependencies,
  ideaLinks,
  ideas,
  noteLinks,
  notes,
} from '../schema'
import { withTransaction } from '../transaction'

/** Thrown when an edge would make the prerequisite graph cyclic (incl. A → A). */
export class ConceptCycleError extends Error {
  constructor(from: string, to: string) {
    super(
      `Adding "${from}" → "${to}" would create a circular dependency in the prerequisite graph.`,
    )
    this.name = 'ConceptCycleError'
  }
}

export interface ConceptDependencyRow {
  id: number
  sourceConcept: string
  targetConcept: string
  strength: number
  createdAt: string
}

/**
 * Adds a prerequisite edge source → target. Names are trimmed; an existing
 * identical edge is updated (strength) instead of duplicated; and the cycle
 * check runs in the same transaction as the write, so the graph stays a DAG.
 * Throws {@link ConceptCycleError}.
 */
export function addConceptDependency(data: {
  sourceConcept: string
  targetConcept: string
  strength?: number
}): ConceptDependencyRow {
  const from = data.sourceConcept.trim()
  const to = data.targetConcept.trim()
  const strength = Math.min(1, Math.max(0, data.strength ?? 1.0))

  return withTransaction((tx) => {
    const existing = tx
      .select()
      .from(conceptDependencies)
      .where(
        and(eq(conceptDependencies.sourceConcept, from), eq(conceptDependencies.targetConcept, to)),
      )
      .get()
    if (existing) {
      tx.update(conceptDependencies)
        .set({ strength })
        .where(eq(conceptDependencies.id, existing.id))
        .run()
      return { ...existing, strength } as ConceptDependencyRow
    }

    const edges = tx
      .select({ from: conceptDependencies.sourceConcept, to: conceptDependencies.targetConcept })
      .from(conceptDependencies)
      .all()
      .map((e) => ({ ...e, strength: 1 }))
    if (willCreateCycle(edges, { from, to, strength })) throw new ConceptCycleError(from, to)

    const [created] = tx
      .insert(conceptDependencies)
      .values({ sourceConcept: from, targetConcept: to, strength })
      .returning()
      .all()
    return created as ConceptDependencyRow
  }, getDb())
}

export function listConceptDependencies(concept?: string): ConceptDependencyRow[] {
  const db = getDb()
  if (concept) {
    return db
      .select()
      .from(conceptDependencies)
      .where(
        or(
          eq(conceptDependencies.sourceConcept, concept),
          eq(conceptDependencies.targetConcept, concept),
        ),
      )
      .all() as ConceptDependencyRow[]
  }
  return db.select().from(conceptDependencies).all() as ConceptDependencyRow[]
}

export function removeConceptDependency(id: number): boolean {
  const db = getDb()
  const commit = pendingTombstone('concept_dependencies', id)
  const res = db.delete(conceptDependencies).where(eq(conceptDependencies.id, id)).run()
  if (res.changes > 0) commit()
  return res.changes > 0
}

export function upsertAnkiMapping(data: {
  cardId: number
  ankiNoteId: number
  ankiCardId?: number
  syncMode?: AnkiSyncMode
}): void {
  const db = getDb()
  db.insert(ankiSyncMappings)
    .values({
      cardId: data.cardId,
      ankiNoteId: data.ankiNoteId,
      ankiCardId: data.ankiCardId ?? null,
      syncMode: data.syncMode ?? 'live_loopback',
      lastSyncAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: ankiSyncMappings.cardId,
      set: {
        ankiNoteId: data.ankiNoteId,
        ankiCardId: data.ankiCardId ?? null,
        syncMode: data.syncMode ?? 'live_loopback',
        lastSyncAt: new Date().toISOString(),
      },
    })
    .run()
}

export function getAnkiMappingByCard(cardId: number) {
  const db = getDb()
  return db.select().from(ankiSyncMappings).where(eq(ankiSyncMappings.cardId, cardId)).get() ?? null
}

export function listAnkiMappings(limit = 100) {
  const db = getDb()
  return db
    .select()
    .from(ankiSyncMappings)
    .orderBy(desc(ankiSyncMappings.lastSyncAt))
    .limit(rowLimit(limit))
    .all()
}

// ─── Graph overview resource ────────────────────────────────────────────────

/** Node counts and the most-connected notes/ideas of the knowledge graph. */
export interface GraphOverview {
  counts: {
    notes: number
    ideas: number
    cards: number
    noteLinks: number
    ideaLinks: number
  }
  topNotes: { id: number; title: string; links: number }[]
  topIdeas: { id: number; title: string; links: number }[]
}

/**
 * The `graph://overview` payload — per-node-type counts plus the five most
 * connected notes and ideas (link degree counts both directions). One
 * definition, every host: the MCP server previously carried this five-count +
 * top-list aggregate inline in its resource handler.
 */
export function graphOverview(opts: { db?: LearningHubDB } = {}): GraphOverview {
  const db = opts.db ?? getDb()

  const [noteCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(notes)
    .all()
  const [ideaCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(ideas)
    .all()
  const [cardCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(cards)
    .all()
  const [noteLinkCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(noteLinks)
    .all()
  const [ideaLinkCount] = db
    .select({ n: sql<number>`count(*)` })
    .from(ideaLinks)
    .all()

  const topNotes = db
    .select({ id: notes.id, title: notes.title, links: sql<number>`count(note_links.id)` })
    .from(notes)
    .leftJoin(noteLinks, or(eq(noteLinks.fromNoteId, notes.id), eq(noteLinks.toNoteId, notes.id)))
    .groupBy(notes.id, notes.title)
    .orderBy(desc(sql`count(note_links.id)`))
    .limit(5)
    .all()

  const topIdeas = db
    .select({ id: ideas.id, title: ideas.title, links: sql<number>`count(idea_links.id)` })
    .from(ideas)
    .leftJoin(ideaLinks, or(eq(ideaLinks.fromIdeaId, ideas.id), eq(ideaLinks.toIdeaId, ideas.id)))
    .groupBy(ideas.id, ideas.title)
    .orderBy(desc(sql`count(idea_links.id)`))
    .limit(5)
    .all()

  return {
    counts: {
      notes: Number(noteCount?.n ?? 0),
      ideas: Number(ideaCount?.n ?? 0),
      cards: Number(cardCount?.n ?? 0),
      noteLinks: Number(noteLinkCount?.n ?? 0),
      ideaLinks: Number(ideaLinkCount?.n ?? 0),
    },
    topNotes: topNotes.map((r) => ({ id: r.id, title: r.title, links: Number(r.links) })),
    topIdeas: topIdeas.map((r) => ({ id: r.id, title: r.title, links: Number(r.links) })),
  }
}

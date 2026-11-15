/**
 * @fileoverview Repositories for Milestone 13:
 * - Curriculum Concept Dependencies (Prerequisite Graph)
 * - Anki Note & Card Synchronization Mappings
 */
import { and, desc, eq, or } from 'drizzle-orm'
import type { AnkiSyncMode } from '@learning-hub/core/anki-connect'
import { willCreateCycle } from '@learning-hub/core/knowledge-graph'
import { getDb } from '../index'
import { ankiSyncMappings, conceptDependencies } from '../schema'
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
  const res = db.delete(conceptDependencies).where(eq(conceptDependencies.id, id)).run()
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
    .limit(limit)
    .all()
}

/**
 * @fileoverview Repositories for Milestone 13:
 * - Curriculum Concept Dependencies (Prerequisite Graph)
 * - Anki Note & Card Synchronization Mappings
 */
import { desc, eq, or } from 'drizzle-orm'
import type { AnkiSyncMode } from '@learning-hub/core/anki-connect'
import { getDb } from '../index'
import { ankiSyncMappings, conceptDependencies } from '../schema'

export interface ConceptDependencyRow {
  id: number
  sourceConcept: string
  targetConcept: string
  strength: number
  createdAt: string
}

export function addConceptDependency(data: {
  sourceConcept: string
  targetConcept: string
  strength?: number
}): ConceptDependencyRow {
  const db = getDb()
  const [created] = db
    .insert(conceptDependencies)
    .values({
      sourceConcept: data.sourceConcept,
      targetConcept: data.targetConcept,
      strength: data.strength ?? 1.0,
    })
    .returning()
    .all()

  return created as ConceptDependencyRow
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

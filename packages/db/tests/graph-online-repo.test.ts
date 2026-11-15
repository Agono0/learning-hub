import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  ConceptCycleError,
  addConceptDependency,
  addInboxMessage,
  ankiSyncMappings,
  cards,
  conceptDependencies,
  decks,
  getAnkiMappingByCard,
  getDefaultOnlineServer,
  getOnlineIdentity,
  getOnlinePrefs,
  initDb,
  listAnkiMappings,
  listConceptDependencies,
  listInboxMessages,
  markInboxRead,
  onlineInbox,
  onlineServers,
  removeConceptDependency,
  setDb,
  setOnlineServer,
  updateOnlineIdentity,
  updateOnlinePrefs,
  upsertAnkiMapping,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-graph-online-'))
  db = await initDb({ path: join(tmp, 'g.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(conceptDependencies).run()
  db.delete(onlineServers).run()
  db.delete(onlineInbox).run()
  db.delete(ankiSyncMappings).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('concept prerequisite graph', () => {
  it('adds trimmed edges and filters by concept on either end', () => {
    addConceptDependency({ sourceConcept: ' Algebra ', targetConcept: 'Calculus' })
    addConceptDependency({ sourceConcept: 'Calculus', targetConcept: 'Physics', strength: 0.5 })
    expect(listConceptDependencies()).toHaveLength(2)
    expect(listConceptDependencies('Calculus')).toHaveLength(2)
    expect(listConceptDependencies('Algebra')[0]).toMatchObject({
      sourceConcept: 'Algebra',
      strength: 1,
    })
  })

  it('updates an existing edge instead of duplicating it', () => {
    const a = addConceptDependency({ sourceConcept: 'A', targetConcept: 'B', strength: 0.2 })
    const b = addConceptDependency({ sourceConcept: 'A ', targetConcept: 'B', strength: 0.9 })
    expect(b.id).toBe(a.id)
    expect(listConceptDependencies()).toEqual([expect.objectContaining({ strength: 0.9 })])
  })

  it('rejects self-loops and cycles, keeping the graph a DAG', () => {
    addConceptDependency({ sourceConcept: 'A', targetConcept: 'B' })
    addConceptDependency({ sourceConcept: 'B', targetConcept: 'C' })
    expect(() => addConceptDependency({ sourceConcept: 'C', targetConcept: 'A' })).toThrow(
      ConceptCycleError,
    )
    expect(() => addConceptDependency({ sourceConcept: 'X', targetConcept: ' X' })).toThrow(
      ConceptCycleError,
    )
    expect(listConceptDependencies()).toHaveLength(2)
  })

  it('removes edges by id', () => {
    const e = addConceptDependency({ sourceConcept: 'A', targetConcept: 'B' })
    expect(removeConceptDependency(e.id)).toBe(true)
    expect(removeConceptDependency(e.id)).toBe(false)
  })
})

describe('anki mappings', () => {
  it('upserts one mapping per card', () => {
    const deckId = db.insert(decks).values({ name: 'Anki' }).returning().all()[0]!.id
    const cardId = db
      .insert(cards)
      .values({
        deckId,
        type: 'basic',
        content: { basic: { front: 'f', back: 'b' } },
        due: new Date().toISOString(),
      })
      .returning()
      .all()[0]!.id
    upsertAnkiMapping({ cardId, ankiNoteId: 1 })
    upsertAnkiMapping({ cardId, ankiNoteId: 2, ankiCardId: 20 })
    expect(getAnkiMappingByCard(cardId)).toMatchObject({ ankiNoteId: 2, ankiCardId: 20 })
    expect(listAnkiMappings()).toHaveLength(1)
    expect(getAnkiMappingByCard(99_999)).toBeNull()
  })
})

describe('online identity, prefs and servers', () => {
  it('creates one identity/prefs row lazily and updates it', () => {
    const id = getOnlineIdentity()
    expect(getOnlineIdentity().id).toBe(id.id)
    expect(updateOnlineIdentity({ alias: 'Ada' }).alias).toBe('Ada')
    const prefs = getOnlinePrefs()
    expect(updateOnlinePrefs({ sharePresence: false })).toMatchObject({
      id: prefs.id,
      sharePresence: false,
    })
  })

  it('keeps one default server and never duplicates a URL', () => {
    const fallback = getDefaultOnlineServer()
    expect(fallback).toMatch(/^https?:\/\//)
    setOnlineServer('A', 'https://a.example/', true)
    setOnlineServer('B', 'https://b.example', true)
    expect(getDefaultOnlineServer()).toBe('https://b.example')
    setOnlineServer('A again', 'https://a.example', true)
    expect(getDefaultOnlineServer()).toBe('https://a.example')
    const rows = db.select().from(onlineServers).all()
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1)
  })
})

describe('inbox', () => {
  it('lists newest first and reports whether a message was marked read', async () => {
    const a = addInboxMessage({ kind: 'nudge', senderAlias: 'Bo', content: 'hi' })
    await new Promise((r) => setTimeout(r, 5))
    addInboxMessage({ kind: 'invite', senderAlias: 'Cy', content: 'join', meta: { room: 1 } })
    const list = listInboxMessages()
    expect(list.map((m) => m.senderAlias)).toEqual(['Cy', 'Bo'])
    expect(list[0]!.meta).toEqual({ room: 1 })
    expect(markInboxRead(a.id)).toBe(true)
    expect(markInboxRead(99_999)).toBe(false)
    expect(listInboxMessages().find((m) => m.id === a.id)?.read).toBe(true)
  })
})

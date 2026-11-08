import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  MindmapImportError,
  cardAttemptImages,
  cards,
  createMindmap,
  decks,
  deleteMindmap,
  getLatestCardAttemptImage,
  getMindmap,
  importMindmapCards,
  initDb,
  listMindmaps,
  logCardAttemptImage,
  mindmapCardSource,
  mindmaps,
  setDb,
  updateMindmap,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
let deckId: number

const NODES = [
  { id: 'root', text: 'Biology' },
  { id: 'a', text: 'Mitochondria: powerhouse of the cell', parentId: 'root' },
  { id: 'b', text: 'Ribosome: makes proteins', parentId: 'root' },
]

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-visual-'))
  db = await initDb({ path: join(tmp, 'visual.db') })
  setDb(db)
  deckId = db.insert(decks).values({ name: 'Bio' }).returning().all()[0]!.id
})

beforeEach(() => {
  db.delete(cardAttemptImages).run()
  db.delete(cards).run()
  db.delete(mindmaps).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('mind map CRUD', () => {
  it('creates, updates (partial), lists newest first and deletes', async () => {
    const a = createMindmap({ title: 'A', nodesJson: '[]' })
    expect(a.edgesJson).toBe('[]')
    await new Promise((r) => setTimeout(r, 5))
    const b = createMindmap({ title: 'B', nodesJson: '[]' })
    expect(listMindmaps().map((m) => m.id)).toEqual([b.id, a.id])

    await new Promise((r) => setTimeout(r, 5))
    const upd = updateMindmap(a.id, { title: 'A2' })!
    expect(upd).toMatchObject({ title: 'A2', nodesJson: '[]' })
    expect(listMindmaps()[0]!.id).toBe(a.id)
    expect(updateMindmap(99_999, { title: 'x' })).toBeNull()

    expect(deleteMindmap(a.id)).toBe(true)
    expect(deleteMindmap(a.id)).toBe(false)
    expect(getMindmap(a.id)).toBeNull()
  })
})

describe('importMindmapCards', () => {
  it('generates cards with tags and a stable source key', () => {
    const m = createMindmap({ title: 'Cell Bio', nodesJson: JSON.stringify(NODES) })
    const { created, skipped } = importMindmapCards(m.id, deckId)
    expect(created.length).toBeGreaterThan(0)
    expect(skipped).toBe(0)
    for (const c of created) {
      expect(c.source).toBe(mindmapCardSource(m.id, c.content))
      expect(c.tags).toContain('mindmap:cell-bio')
    }
  })

  it('re-import is idempotent and keeps review history (regression: duplicated every time)', () => {
    const m = createMindmap({ title: 'Cell Bio', nodesJson: JSON.stringify(NODES) })
    const first = importMindmapCards(m.id, deckId).created
    db.update(cards).set({ reps: 7, state: 2 }).where(eq(cards.id, first[0]!.id)).run()

    const again = importMindmapCards(m.id, deckId)
    expect(again.created).toHaveLength(0)
    expect(again.skipped).toBe(first.length)
    expect(db.select().from(cards).all()).toHaveLength(first.length)
    expect(db.select().from(cards).where(eq(cards.id, first[0]!.id)).get()?.reps).toBe(7)

    // editing the map adds only the new cards
    updateMindmap(m.id, {
      nodesJson: JSON.stringify([
        ...NODES,
        { id: 'c', text: 'Nucleus: stores DNA', parentId: 'root' },
      ]),
    })
    const delta = importMindmapCards(m.id, deckId)
    // only the new definition is added; the two untouched definitions are skipped
    const newDefs = delta.created.filter((c) => c.tags.includes('definition'))
    expect(newDefs.map((c) => JSON.stringify(c.content))).toEqual([
      expect.stringContaining('Nucleus'),
    ])
    expect(delta.skipped).toBeGreaterThanOrEqual(2)
  })

  it('imports into a different deck independently', () => {
    const other = db.insert(decks).values({ name: 'Other' }).returning().all()[0]!.id
    const m = createMindmap({ title: 'X', nodesJson: JSON.stringify(NODES) })
    const n = importMindmapCards(m.id, deckId).created.length
    expect(importMindmapCards(m.id, other).created).toHaveLength(n)
  })

  it('throws typed errors for missing map, missing deck and corrupt JSON', () => {
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (e) {
        return e instanceof MindmapImportError ? e.code : 'other'
      }
      return 'none'
    }
    const ok = createMindmap({ title: 'ok', nodesJson: '[]' })
    expect(code(() => importMindmapCards(99_999, deckId))).toBe('mindmap_not_found')
    expect(code(() => importMindmapCards(ok.id, 99_999))).toBe('deck_not_found')
    const bad = createMindmap({ title: 'bad', nodesJson: '{not json' })
    expect(code(() => importMindmapCards(bad.id, deckId))).toBe('invalid_mindmap')
    const shape = createMindmap({ title: 'shape', nodesJson: '[{"id":1}]' })
    expect(code(() => importMindmapCards(shape.id, deckId))).toBe('invalid_mindmap')
    expect(importMindmapCards(ok.id, deckId)).toEqual({ created: [], skipped: 0 })
  })
})

describe('handwritten attempt images', () => {
  it('returns the latest attempt per card', () => {
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
    expect(getLatestCardAttemptImage(cardId)).toBeNull()
    logCardAttemptImage({ cardId, imageData: 'data:1' })
    logCardAttemptImage({ cardId, imageData: 'data:2' })
    expect(getLatestCardAttemptImage(cardId)?.imageData).toBe('data:2')
  })
})

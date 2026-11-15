import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cardEmbeddings,
  cardPreview,
  cards,
  createQuickCapture,
  decks,
  deleteQuickCapture,
  embeddings,
  findRelatedEmbeddings,
  getCardEmbedding,
  getEmbeddingStatus,
  getPendingEmbeddingTexts,
  ideas,
  initDb,
  listCardEmbeddings,
  listQuickCaptures,
  markQuickCaptureProcessed,
  notes,
  quickCaptures,
  searchCardEmbeddingsCosine,
  setDb,
  upsertCardEmbedding,
  upsertEmbeddings,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
let deckId: number

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-power-'))
  db = await initDb({ path: join(tmp, 'power.db') })
  setDb(db)
  deckId = db.insert(decks).values({ name: 'D' }).returning().all()[0]!.id
})

beforeEach(() => {
  db.delete(embeddings).run()
  db.delete(cardEmbeddings).run()
  db.delete(cards).run()
  db.delete(notes).run()
  db.delete(ideas).run()
  db.delete(quickCaptures).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

const addCard = (content: object) =>
  db
    .insert(cards)
    .values({ deckId, type: 'basic', content: content as never, due: new Date().toISOString() })
    .returning()
    .all()[0]!.id
const addNote = (title: string, content = '') =>
  db.insert(notes).values({ title, content }).returning().all()[0]!.id

describe('quick captures', () => {
  it('creates, lists unprocessed by default, marks processed and deletes', () => {
    const a = createQuickCapture({ text: 'first', sourceUrl: 'https://x.dev', tags: ['t'] })
    const b = createQuickCapture({ text: 'second' })
    expect(a).toMatchObject({ text: 'first', sourceUrl: 'https://x.dev', processed: false })
    expect(b.tags).toEqual([])
    expect(listQuickCaptures()).toHaveLength(2)

    expect(markQuickCaptureProcessed(a.id)).toBe(true)
    expect(listQuickCaptures().map((c) => c.id)).toEqual([b.id])
    expect(listQuickCaptures(50, true)).toHaveLength(2)
    expect(listQuickCaptures(1, true)).toHaveLength(1)

    expect(markQuickCaptureProcessed(99_999)).toBe(false)
    expect(deleteQuickCapture(b.id)).toBe(true)
    expect(deleteQuickCapture(b.id)).toBe(false)
  })
})

describe('card embeddings', () => {
  it('upserts per card and filters by model', () => {
    const id = addCard({ basic: { front: 'f', back: 'b' } })
    upsertCardEmbedding({ cardId: id, embedding: [1, 0] })
    upsertCardEmbedding({ cardId: id, embedding: [0, 1] })
    expect(getCardEmbedding(id)?.embedding).toEqual([0, 1])
    expect(getCardEmbedding(99_999)).toBeNull()
    expect(listCardEmbeddings()).toHaveLength(1)
    expect(listCardEmbeddings('other-model')).toHaveLength(0)
  })

  it('ranks by cosine, applies minScore/topK, skips dimension mismatches', () => {
    const near = addCard({ basic: { front: 'near', back: 'n' } })
    const mid = addCard({ mcq: { question: 'Q?', options: ['a', 'b'], correctIndex: 1 } })
    const far = addCard({ basic: { front: 'far', back: 'f' } })
    const wrongDim = addCard({ basic: { front: 'dim', back: 'd' } })
    upsertCardEmbedding({ cardId: near, embedding: [1, 0, 0] })
    upsertCardEmbedding({ cardId: mid, embedding: [1, 1, 0] })
    upsertCardEmbedding({ cardId: far, embedding: [0, 0, 1] })
    upsertCardEmbedding({ cardId: wrongDim, embedding: [1, 0] })

    const hits = searchCardEmbeddingsCosine([1, 0, 0], 5, 0.3)
    expect(hits.map((h) => h.cardId)).toEqual([near, mid])
    expect(hits[0]!.score).toBeCloseTo(1)
    expect(hits[1]).toMatchObject({ front: 'Q?', back: 'b', deckId })
    expect(searchCardEmbeddingsCosine([1, 0, 0], 1)).toHaveLength(1)
  })
})

describe('cardPreview', () => {
  it('handles every card shape and junk input', () => {
    expect(cardPreview({ basic: { front: 'F', back: 'B' } })).toEqual({ front: 'F', back: 'B' })
    expect(cardPreview({ typein: { question: 'Q', acceptedAnswers: ['A', 'a'] } })).toEqual({
      front: 'Q',
      back: 'A',
    })
    expect(cardPreview({ cloze: { text: '{{c1::x}}' } })).toEqual({ front: '{{c1::x}}', back: '' })
    expect(cardPreview({ mcq: { question: 'Q', options: ['x'], correctIndex: 5 } })).toEqual({
      front: 'Q',
      back: '',
    })
    expect(cardPreview(null)).toEqual({ front: '', back: '' })
    expect(cardPreview({ basic: { front: 3 } })).toEqual({ front: '', back: '' })
  })
})

describe('omniverse embeddings', () => {
  it('upserts batches, skipping unknown kinds and empty vectors', () => {
    const n = addNote('A')
    const written = upsertEmbeddings([
      { kind: 'note', refId: n, vector: [1, 0] },
      { kind: 'note', refId: n, vector: [0, 1] }, // last write wins
      { kind: 'bogus' as never, refId: 1, vector: [1] },
      { kind: 'idea', refId: 1, vector: [] },
    ])
    expect(written).toBe(2)
    const rows = db.select().from(embeddings).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.vector).toEqual([0, 1])
    expect(upsertEmbeddings([])).toBe(0)
  })

  it('finds related items across kinds with titles (regression: JSON vectors were never decoded)', () => {
    const a = addNote('Neurons')
    const b = addNote('Synapses')
    const c = addNote('Cooking')
    const idea = db.insert(ideas).values({ title: 'Brain idea' }).returning().all()[0]!.id
    upsertEmbeddings([
      { kind: 'note', refId: a, vector: [1, 0, 0] },
      { kind: 'note', refId: b, vector: [0.9, 0.1, 0] },
      { kind: 'note', refId: c, vector: [0, 0, 1] },
      { kind: 'idea', refId: idea, vector: [0.8, 0.2, 0] },
    ])

    const { found, hits } = findRelatedEmbeddings('note', a)
    expect(found).toBe(true)
    expect(hits.map((h) => `${h.kind}:${h.title}`)).toEqual(['note:Synapses', 'idea:Brain idea'])
    expect(hits[0]!.href).toBe('/notes')
    expect(findRelatedEmbeddings('note', a, 1).hits).toHaveLength(1)
    expect(findRelatedEmbeddings('note', 99_999)).toEqual({ found: false, hits: [] })
  })

  it('drops hits whose source row was deleted instead of returning dead links', () => {
    const a = addNote('Keep')
    const b = addNote('Gone')
    const d = addNote('Also related')
    upsertEmbeddings([
      { kind: 'note', refId: a, vector: [1, 0] },
      { kind: 'note', refId: b, vector: [1, 0.05] },
      { kind: 'note', refId: d, vector: [1, 0.1] },
    ])
    db.delete(notes).where(eq(notes.id, b)).run()
    // topK=1 must still be filled by the next live row
    expect(findRelatedEmbeddings('note', a, 1).hits.map((h) => h.title)).toEqual(['Also related'])
  })

  it('lists pending texts, excluding indexed and blank rows before the limit', () => {
    addNote('  ', '')
    addNote('', '   ')
    const real = addNote('Real', 'body')
    const indexed = addNote('Indexed', 'x')
    upsertEmbeddings([{ kind: 'note', refId: indexed, vector: [1] }])

    const pending = getPendingEmbeddingTexts(['note'], 1)
    expect(pending).toEqual([{ kind: 'note', refId: real, text: 'Real body' }])
  })

  it('reports index coverage per kind', () => {
    const n = addNote('A')
    addNote('B')
    upsertEmbeddings([{ kind: 'note', refId: n, vector: [1, 2, 3] }])
    const status = getEmbeddingStatus()
    expect(status.dims).toBe(3)
    expect(status.kinds.find((k) => k.kind === 'note')).toEqual({
      kind: 'note',
      indexed: 1,
      total: 2,
    })
    expect(status.kinds).toHaveLength(12)
  })
})

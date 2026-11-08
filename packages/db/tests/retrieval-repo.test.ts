/**
 * Retrieval-coverage repo (the "Read but never tested" panel): listUntestedMaterial
 * returns sources/notes that have content but ZERO linked cards — most-recently
 -opened first, capped — against a REAL temp database (initDb). Covers every
 * link-back path: cards.source = 'sq3r:<id>', highlights.card_id, cards.note_id
 * and minted note_bullets.card_id.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cards,
  decks,
  highlights,
  initDb,
  listUntestedMaterial,
  noteBullets,
  notes,
  setDb,
  sources,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
let tmp: string

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'lh-retrieval-'))
  db = await initDb({ path: join(tmp, 'retrieval.db') })
  setDb(db)
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

/** Insert one card in a fresh deck and return its id. */
async function mintCard(over: Partial<typeof cards.$inferInsert> = {}): Promise<number> {
  const [deck] = await db
    .insert(decks)
    .values({ name: `retrieval-test-deck-${Math.random().toString(36).slice(2)}` })
    .returning()
  const [card] = await db
    .insert(cards)
    .values({
      deckId: deck!.id,
      type: 'basic',
      due: '2026-01-01T00:00:00.000Z',
      content: { basic: { front: 'front', back: 'back' } },
      ...over,
    })
    .returning()
  return card!.id
}

async function addSource(over: Partial<typeof sources.$inferInsert>): Promise<number> {
  const [row] = await db
    .insert(sources)
    .values({ kind: 'article', title: 'source', content: 'some content', ...over })
    .returning()
  return row!.id
}

async function addNote(over: Partial<typeof notes.$inferInsert>): Promise<number> {
  const [row] = await db
    .insert(notes)
    .values({ title: 'note', content: 'some content', ...over })
    .returning()
  return row!.id
}

const titles = (kind: 'source' | 'note') =>
  listUntestedMaterial(50, db)
    .filter((r) => r.kind === kind)
    .map((r) => r.title)

describe('listUntestedMaterial — the zero-card filter', () => {
  it('lists a source and a note with content and no cards', async () => {
    await addSource({ title: 'Untested reading', content: 'Expanding intervals beat cramming.' })
    await addNote({ title: 'Untested note', content: 'The FFT is divide and conquer.' })
    expect(titles('source')).toContain('Untested reading')
    expect(titles('note')).toContain('Untested note')
  })

  it('excludes a source once a SQ3R card references it (cards.source = sq3r:<id>)', async () => {
    const id = await addSource({ title: 'SQ3R-mined source' })
    await mintCard({ source: `sq3r:${id}` })
    expect(titles('source')).not.toContain('SQ3R-mined source')
  })

  it('excludes a source whose highlight was triaged into a card, keeps untriaged ones', async () => {
    const id = await addSource({ title: 'Highlight-triaged source' })
    const cardId = await mintCard()
    await db.insert(highlights).values({ sourceId: id, text: 'a kept highlight', cardId })
    await addSource({ title: 'Only untriaged highlights' })
    await db.insert(highlights).values({ sourceId: id, text: 'not yet triaged', cardId: null })

    expect(titles('source')).not.toContain('Highlight-triaged source')
    expect(titles('source')).toContain('Only untriaged highlights')
  })

  it('excludes a note linked by cards.note_id and by a minted note bullet', async () => {
    const directId = await addNote({ title: 'Note with a direct card' })
    await mintCard({ noteId: directId })

    const bulletId = await addNote({ title: 'Note with a bullet card' })
    const cardId = await mintCard()
    await db.insert(noteBullets).values({ noteId: bulletId, content: 'a bullet', cardId })

    expect(titles('note')).not.toContain('Note with a direct card')
    expect(titles('note')).not.toContain('Note with a bullet card')
  })

  it('skips blank-content rows (a note defaulting to "" is not readable material)', async () => {
    await addSource({ title: 'Blank source', content: '   ' })
    await addNote({ title: 'Blank note', content: '' })
    expect(titles('source')).not.toContain('Blank source')
    expect(titles('note')).not.toContain('Blank note')
  })
})

describe('listUntestedMaterial — ranking, excerpt, cap', () => {
  it('orders most-recently-opened first (sources by lastReadAt, notes by updatedAt)', async () => {
    const listed = listUntestedMaterial(50, db)
    const recencyOf = (r: { lastOpenedAt: string | null }) =>
      r.lastOpenedAt == null ? -1 : Date.parse(r.lastOpenedAt)
    for (let i = 1; i < listed.length; i++) {
      expect(recencyOf(listed[i - 1]!)).toBeGreaterThanOrEqual(recencyOf(listed[i]!))
    }

    // a freshly-opened source jumps ahead of everything opened earlier
    await addSource({
      title: 'Opened just now',
      content: 'fresh',
      lastReadAt: '2030-01-01T00:00:00.000Z',
    })
    expect(listUntestedMaterial(50, db)[0]!.title).toBe('Opened just now')
  })

  it('carries a trimmed excerpt and the deep link for each surface', async () => {
    const noteId = await addNote({ title: 'Excerpt note', content: '  line one\nline two  \n' })
    const item = listUntestedMaterial(50, db).find((r) => r.id === noteId && r.kind === 'note')
    expect(item).toBeDefined()
    expect(item!.excerpt).toBe('line one\nline two')
    expect(item!.href).toBe('/notes')
    expect(item!.lastOpenedAt).toBeTypeOf('string')

    const sourceItem = listUntestedMaterial(50, db).find((r) => r.kind === 'source')
    expect(sourceItem!.href).toBe('/reading')
  })

  it('caps the list at the requested limit (default 20)', async () => {
    const seeded = titles('note').length
    for (let i = 0; i < 25 - seeded; i++) {
      await addNote({ title: `Bulk note ${i}`, content: `bulk ${i}` })
    }
    expect(listUntestedMaterial(50, db).length).toBeGreaterThan(20)
    expect(listUntestedMaterial(20, db)).toHaveLength(20)
    expect(listUntestedMaterial(3, db)).toHaveLength(3)
    // no-arg call uses the process-wide db (setDb above) and the default cap
    expect(listUntestedMaterial()).toHaveLength(20)
  })
})

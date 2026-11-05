/**
 * FTS5 global search (M5): the 003 migration creates shadow tables + triggers
 * on a REAL database (initDb), triggers keep them synced, searchAll answers
 * with FTS5 and falls back to LIKE when FTS5 is absent.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  initDb,
  notes,
  cards,
  decks,
  getDb,
  searchAll,
  setDb,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
let tmp: string

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'lh-search-'))
  db = await initDb({ path: join(tmp, 'search.db') })
  setDb(db)
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('fts search', () => {
  it('the migration created the shadow tables', () => {
    const tables = db
      .all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'fts_%'`,
      )
      .map((r) => r.name)
    expect(tables).toContain('fts_notes')
    expect(tables).toContain('fts_cards')
    expect(tables).toContain('fts_lessons')
    expect(tables).toContain('fts_highlights')
    expect(tables).toContain('fts_ideas')
  })

  it('indexes notes on insert and finds them (trigger sync)', async () => {
    const { notes: notesRepo } = await import('../src/index')
    await db
      .insert(notesRepo)
      .values({ title: 'Fourier transforms explained', content: 'The FFT is divide and conquer.' })
    const res = searchAll(db, 'fourier')
    expect(res.mode).toBe('fts5')
    expect(res.hits.some((h) => h.kind === 'note' && h.title.includes('Fourier'))).toBe(true)

    // update keeps the index fresh
    const [row] = await db.select().from(notesRepo).limit(1)
    await db.update(notesRepo).set({ title: 'Wavelets explained' }).where(sqlEq(row!.id))
    const after = searchAll(db, 'wavelets')
    expect(after.hits.some((h) => h.kind === 'note')).toBe(true)
    const stale = searchAll(db, 'fourier')
    expect(stale.hits.some((h) => h.kind === 'note' && h.title.includes('Wavelets'))).toBe(false)
  })

  it('indexes card text (json_extract) and matches on the front', async () => {
    const [deck] = await db.insert(decks).values({ name: 'search-test-deck' }).returning()
    await db.insert(cards).values({
      deckId: deck!.id,
      type: 'basic',
      due: new Date().toISOString(),
      content: { basic: { front: 'Capital of Assyria', back: 'Nineveh' } },
    })
    const res = searchAll(db, 'assyria')
    expect(res.hits.some((h) => h.kind === 'card')).toBe(true)
  })

  it('returns empty for empty queries and non-matches', () => {
    expect(searchAll(db, '').hits).toEqual([])
    expect(searchAll(db, 'zzzqqqxxx').hits).toEqual([])
  })

  it('ftsExpression sanitizes FTS5 syntax characters', () => {
    // user quotes/parens/asterisks are stripped; one phrase-prefix per token
    expect(ftsExpression('fourier "fast" (transform)')).toBe(
      '"fourier"* OR "fast"* OR "transform"*',
    )
    expect(ftsExpression('  ')).toBe('')
  })
})

import { ftsExpression } from '../src/repos/search'

// tiny helper — drizzle eq without importing at top (keeps the diff focused)
function sqlEq(id: number) {
  return eq(notes.id, id)
}

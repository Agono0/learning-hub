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
    // 018 omniverse kinds
    expect(tables).toContain('fts_journal')
    expect(tables).toContain('fts_quotes')
    expect(tables).toContain('fts_sources')
    expect(tables).toContain('fts_projects')
    expect(tables).toContain('fts_mindmaps')
    expect(tables).toContain('fts_canvases')
    expect(tables).toContain('fts_palaces')
    expect(tables).toContain('fts_goals')
    expect(tables).toContain('fts_habits')
    expect(tables).toContain('fts_captures')
    expect(tables).toContain('fts_sq3r')
    expect(tables).toContain('fts_chats')
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

  it('searches the 018 omniverse kinds via their triggers', async () => {
    const {
      journalEntries,
      quotes,
      sources,
      projects,
      mindmaps,
      canvases,
      palaces,
      goals,
      habits,
      quickCaptures,
      sq3rSessions,
      chatSessions,
    } = await import('../src/index')

    await db.insert(journalEntries).values({
      date: '2026-01-15',
      mood: 4,
      smallWins: 'hippocampus notes finished',
      gratitude: '',
      worryDump: '',
    })
    await db.insert(quotes).values({ text: 'We are what we repeatedly do.', author: 'Aristotle' })
    await db.insert(sources).values({
      kind: 'article',
      title: 'Spaced repetition deep dive',
      url: 'https://example.com/srs',
      content: 'Expanding intervals beat cramming.',
    })
    await db.insert(projects).values({ title: 'Thesis on memory consolidation' })
    await db.insert(mindmaps).values({
      title: 'Neuroplasticity map',
      nodesJson: '[]',
      edgesJson: '[]',
    })
    await db.insert(canvases).values({ title: 'Thesis storyboard', items: '[]', edges: '[]' })
    await db.insert(palaces).values({ name: 'Childhood home', description: 'Method of loci route' })
    await db.insert(goals).values({ wish: 'Read 30 books this year' })
    await db.insert(habits).values({ name: 'Morning pages', cue: 'wake up' })
    await db.insert(quickCaptures).values({ text: 'idea: hippocampus pun for memory palace' })
    await db.insert(sq3rSessions).values({
      sourceId: 1,
      surveyHeadings: 'consolidation sections',
      questions: 'how does sleep consolidate memory?',
      reciteNotes: '',
      completedSteps: '[]',
    })
    await db.insert(chatSessions).values({
      kind: 'tutor',
      title: 'long-term potentiation chat',
      messages: '[]',
    })

    const res = searchAll(db, 'hippocampus')
    expect(res.mode).toBe('fts5')
    expect(res.hits.filter((h) => h.kind === 'journal').length).toBeGreaterThan(0)
    expect(res.hits.filter((h) => h.kind === 'capture').length).toBeGreaterThan(0)

    for (const [query, kind] of [
      ['aristotle', 'quote'],
      ['cramming', 'source'],
      ['consolidation', 'project'],
      ['neuroplasticity', 'mindmap'],
      ['storyboard', 'canvas'],
      ['loci', 'palace'],
      ['30 books', 'goal'],
      ['morning pages', 'habit'],
      ['potentiation', 'chat'],
      ['sleep consolidate', 'sq3r'],
    ] as const) {
      const r = searchAll(db, query)
      expect(
        r.hits.some((h) => h.kind === kind),
        `expected ${kind} hit for "${query}" (got: ${r.hits.map((h) => h.kind).join(',')})`,
      ).toBe(true)
    }
  })
})

import { ftsExpression } from '../src/repos/search'

// tiny helper — drizzle eq without importing at top (keeps the diff focused)
function sqlEq(id: number) {
  return eq(notes.id, id)
}

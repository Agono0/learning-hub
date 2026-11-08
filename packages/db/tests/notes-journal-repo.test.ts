import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createNote,
  deleteNote,
  getJournalEntry,
  getNoteDetail,
  initDb,
  journalEntries,
  linkNoteBulletCard,
  listJournalEntries,
  listJournalEntriesSince,
  listNotes,
  noteBullets,
  noteLinks,
  notes,
  setDb,
  setJournalAiInsight,
  updateNote,
  upsertJournalEntry,
  xpEvents,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-notes-journal-'))
  db = await initDb({ path: join(tmp, 'notes-journal.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(noteBullets).run()
  db.delete(noteLinks).run()
  db.delete(notes).run()
  db.delete(journalEntries).run()
  db.delete(xpEvents).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('Notes repository (B1)', () => {
  it('creates notes, extracts wikilinks to existing notes, and parses bullet outlines', () => {
    // 1. Create target note first
    const target = createNote({ title: 'Neuroplasticity' }, { db })
    expect(target.note.id).toBeDefined()

    // 2. Create linking note with wikilink and bullets
    const content =
      'Overview of [[Neuroplasticity]] mechanisms:\n- Synaptic potentiation\n- Dendritic spine growth'
    const source = createNote({ title: 'Brain Plasticity', content }, { db })

    expect(source.links).toHaveLength(1)
    expect(source.links[0]).toEqual({ target: 'Neuroplasticity', noteId: target.note.id })
    expect(source.bulletsCount).toBe(2)

    // 3. Inspect target note detail to verify backlinks
    const targetDetail = getNoteDetail(target.note.id, { db })
    expect(targetDetail).toBeDefined()
    expect(targetDetail?.backlinks).toHaveLength(1)
    expect(targetDetail?.backlinks[0]!.fromTitle).toBe('Brain Plasticity')
  })

  it('lists notes with search query filtering', () => {
    createNote({ title: 'Calculus I', content: 'Derivatives and integrals' }, { db })
    createNote({ title: 'Linear Algebra', content: 'Vectors and matrices' }, { db })
    createNote({ title: 'Quantum Mechanics', content: 'Wavefunctions' }, { db })

    const mathSearch = listNotes({ query: 'calculus', db })
    expect(mathSearch).toHaveLength(1)
    expect(mathSearch[0]!.title).toBe('Calculus I')

    const matrixSearch = listNotes({ query: 'matrices', db })
    expect(matrixSearch).toHaveLength(1)
    expect(matrixSearch[0]!.title).toBe('Linear Algebra')

    const all = listNotes({ db })
    expect(all).toHaveLength(3)
  })

  it('updates notes and synchronizes bullet outlines with diffing plan', () => {
    const created = createNote(
      {
        title: 'Draft',
        content: '- First point\n- Second point',
      },
      { db },
    )

    const updated = updateNote(
      created.note.id,
      {
        content: '- First point (updated)\n- Second point\n- Third point added',
      },
      { db },
    )

    expect(updated.note?.content).toContain('Third point added')
    expect(updated.bulletsPlan.updated).toBe(1)
    expect(updated.bulletsPlan.created).toBe(1)
    expect(updated.bulletsPlan.removed).toBe(0)
  })

  it('deletes notes and cascade-deletes bullets and links', () => {
    const target = createNote({ title: 'Target' }, { db })
    const source = createNote(
      { title: 'Source', content: 'Links to [[Target]]\n- A bullet' },
      { db },
    )

    const ok = deleteNote(source.note.id, { db })
    expect(ok).toBe(true)

    expect(getNoteDetail(source.note.id, { db })).toBeNull()
    const targetDetail = getNoteDetail(target.note.id, { db })
    expect(targetDetail?.backlinks).toHaveLength(0)
  })

  it('links note bullets to flashcards', () => {
    const created = createNote({ title: 'Study', content: '- An important fact' }, { db })
    const detail = getNoteDetail(created.note.id, { db })
    const bulletId = detail!.bullets[0]!.id

    const linked = linkNoteBulletCard(bulletId, 999, { db })
    expect(linked).toBe(true)

    const updatedDetail = getNoteDetail(created.note.id, { db })
    expect(updatedDetail!.bullets[0]!.cardId).toBe(999)
  })
})

describe('Journal repository (B1)', () => {
  it('upserts journal entries, awarding XP only on first creation of the day', () => {
    // First creation -> awards XP
    const res1 = upsertJournalEntry(
      {
        date: '2026-11-09',
        mood: 4,
        smallWins: 'Completed master plan commit',
      },
      { db },
    )
    expect(res1.created).toBe(true)
    expect(res1.xpAwarded).toBe(15)

    // Repeat write -> updates without duplicate XP
    const res2 = upsertJournalEntry(
      {
        date: '2026-11-09',
        mood: 5,
        smallWins: 'Completed master plan commit and shipped feature',
      },
      { db },
    )
    expect(res2.created).toBe(false)
    expect(res2.xpAwarded).toBe(0)
    expect(res2.entry.mood).toBe(5)
    expect(res2.entry.smallWins).toContain('shipped feature')
  })

  it('queries entries in date range and retrieves single entry by day key', () => {
    upsertJournalEntry({ date: '2026-11-01', mood: 3 }, { db })
    upsertJournalEntry({ date: '2026-11-02', mood: 4 }, { db })
    upsertJournalEntry({ date: '2026-11-03', mood: 5 }, { db })

    const range = listJournalEntries({ from: '2026-11-01', to: '2026-11-02', db })
    expect(range).toHaveLength(2)
    expect(range[0]!.date).toBe('2026-11-02')

    const single = getJournalEntry('2026-11-03', { db })
    expect(single?.mood).toBe(5)

    const missing = getJournalEntry('2026-11-04', { db })
    expect(missing).toBeNull()

    const since = listJournalEntriesSince('2026-11-02', { db })
    expect(since.map((e) => e.date)).toEqual(['2026-11-02', '2026-11-03'])
  })

  it('sets AI reflection insights on existing or unjournaled dates', () => {
    const entry = setJournalAiInsight(
      '2026-11-09',
      'Consistent focus observed across deep work blocks.',
      { db },
    )
    expect(entry.aiInsight).toContain('Consistent focus')

    const readBack = getJournalEntry('2026-11-09', { db })
    expect(readBack?.aiInsight).toContain('Consistent focus')
  })
})

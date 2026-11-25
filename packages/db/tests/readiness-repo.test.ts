import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initDb, setDb, type LearningHubDB } from '../src/index'
import { cards, decks, examDates, skills } from '../src/schema'
import { getReadinessExam, listReadinessExams, loadReadinessInputs } from '../src/repos/readiness'

let db: LearningHubDB

beforeAll(async () => {
  db = await initDb({ path: join(mkdtempSync(join(tmpdir(), 'lh-readiness-')), 'r.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(cards).run()
  db.delete(decks).run()
  db.delete(skills).run()
  db.delete(examDates).run()
})

const addDeck = (name: string) => db.insert(decks).values({ name }).returning().get()
const addCard = (deckId: number, over: Partial<typeof cards.$inferInsert> = {}) =>
  db
    .insert(cards)
    .values({
      deckId,
      type: 'basic',
      content: { front: 'f', back: 'b' } as never,
      due: '2026-11-02T00:00:00.000Z',
      ...over,
    })
    .returning()
    .get()

describe('loadReadinessInputs', () => {
  it('returns an empty snapshot for an empty database', () => {
    const r = loadReadinessInputs()
    expect(r.cards).toEqual([])
    expect(r.deckNames.size).toBe(0)
  })

  it('returns memory-state columns and names', () => {
    const d = addDeck('Biology')
    const s = db.insert(skills).values({ name: 'Cell cycle' }).returning().get()
    addCard(d.id, {
      skillId: s.id,
      state: 2,
      stability: 12.5,
      difficulty: 4.2,
      reps: 5,
      lapses: 1,
      lastReview: '2026-10-30T10:00:00.000Z',
    })
    const r = loadReadinessInputs()
    expect(r.cards).toHaveLength(1)
    expect(r.cards[0]).toMatchObject({
      deckId: d.id,
      skillId: s.id,
      state: 2,
      stability: 12.5,
      reps: 5,
      lapses: 1,
      suspended: false,
      lastReview: '2026-10-30T10:00:00.000Z',
    })
    expect(r.deckNames.get(d.id)).toBe('Biology')
    expect(r.skillNames.get(s.id)).toBe('Cell cycle')
  })

  it('keeps suspended cards so the caller decides', () => {
    const d = addDeck('D')
    addCard(d.id, { suspended: true })
    expect(loadReadinessInputs().cards[0]!.suspended).toBe(true)
  })

  it('limits to the requested decks and treats an empty list as no decks', () => {
    const a = addDeck('A')
    const b = addDeck('B')
    addCard(a.id)
    addCard(b.id)
    addCard(b.id)
    expect(loadReadinessInputs({ deckIds: [b.id] }).cards).toHaveLength(2)
    expect(loadReadinessInputs({ deckIds: [a.id, a.id] }).cards).toHaveLength(1)
    expect(loadReadinessInputs({ deckIds: [] }).cards).toHaveLength(0)
    expect(loadReadinessInputs({ deckIds: [999] }).cards).toHaveLength(0)
  })

  it('is read-only: loading twice changes nothing', () => {
    const d = addDeck('D')
    addCard(d.id)
    const once = loadReadinessInputs()
    const twice = loadReadinessInputs()
    expect(twice.cards).toEqual(once.cards)
  })
})

describe('exam anchors', () => {
  it('lists soonest first and fetches by id', () => {
    const late = db
      .insert(examDates)
      .values({ title: 'Final', date: '2026-12-20' })
      .returning()
      .get()
    const early = db
      .insert(examDates)
      .values({ title: 'Midterm', date: '2026-11-20', courseId: 3 })
      .returning()
      .get()
    expect(listReadinessExams().map((e) => e.title)).toEqual(['Midterm', 'Final'])
    expect(getReadinessExam(early.id)).toMatchObject({ title: 'Midterm', courseId: 3 })
    expect(getReadinessExam(late.id)!.date).toBe('2026-12-20')
    expect(getReadinessExam(9999)).toBeNull()
  })

  it('returns an empty list when there are no anchors', () => {
    expect(listReadinessExams()).toEqual([])
  })
})

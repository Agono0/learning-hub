/**
 * Regression + coverage tests for the cognitive-expansion repositories: audio
 * card text, TMR minting, GKT persistence, debate verdict XP, 3D palace sources
 * and untested-material titles. Hermetic temp database (zero-mutation invariant,
 * docs/TEST_INFRA.md) — the developer DB is never opened.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addConceptDagEdge,
  cards,
  courses,
  decks,
  getConceptDag,
  getConceptDagNode,
  getDueCardsForAudio,
  getPalaceForScene,
  getTmrCuesForSleepReplay,
  initDb,
  listPalaceLociSources,
  listUntestedMaterial,
  mintTmrCuesForRecentReviews,
  notes,
  palaceItems,
  palaces,
  recordDialecticDebate,
  revlog,
  setDb,
  submitDialecticVerdict,
  tracks,
  updateNodeMasteries,
  upsertConceptDagNode,
  xpEvents,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
let deckId: number

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-cog-reg-'))
  db = await initDb({ path: join(tmp, 'cog-reg.db') })
  setDb(db)
  deckId = db.insert(decks).values({ name: 'Regression Deck' }).returning().all()[0]!.id
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

function addCard(
  content: Record<string, unknown>,
  due = '2020-01-01T00:00:00.000Z',
  stability = 0,
) {
  return db
    .insert(cards)
    .values({ deckId, type: 'basic', due, stability, content: content as never })
    .returning()
    .all()[0]!
}

describe('getDueCardsForAudio', () => {
  it('reads nested card content (basic, cloze) instead of placeholders', () => {
    const basic = addCard({ basic: { front: 'Capital of France?', back: 'Paris' } }, undefined, 12)
    const cloze = addCard({
      cloze: { text: 'Water boils at {{c1::100}} °C', answers: ['100'], mode: 'basic' },
    })
    const rows = getDueCardsForAudio(50, deckId, db)
    const b = rows.find((r) => r.id === basic.id)!
    expect(b.front).toBe('Capital of France?')
    expect(b.back).toBe('Paris')
    expect(b.stability).toBe(12)
    const c = rows.find((r) => r.id === cloze.id)!
    expect(c.front).toBe('Water boils at ___ °C')
    expect(c.spokenFront).toBe('Water boils at blank °C')
    expect(c.back).toBe('100')
    expect(rows.some((r) => r.front === 'Card Prompt')).toBe(false)
  })

  it('still supports legacy flat rows, skips textless/malformed rows and future cards', () => {
    const legacy = addCard({ front: 'Legacy Q', back: 'Legacy A' })
    const broken = addCard({ cloze: { answers: ['x'] } }) // no text: must not throw
    const future = addCard({ basic: { front: 'Later', back: 'x' } }, '2999-01-01T00:00:00.000Z')
    const rows = getDueCardsForAudio(50, deckId, db)
    expect(rows.find((r) => r.id === legacy.id)?.back).toBe('Legacy A')
    expect(rows.find((r) => r.id === broken.id)).toBeUndefined()
    expect(rows.find((r) => r.id === future.id)).toBeUndefined()
  })

  it('returns most overdue first and sanitises the limit', () => {
    const rows = getDueCardsForAudio(Number.NaN, deckId, db)
    expect(rows.length).toBeGreaterThan(0)
    expect(getDueCardsForAudio(1, deckId, db)).toHaveLength(1)
  })
})

describe('mintTmrCuesForRecentReviews', () => {
  it("mints cues for today's reviewed cards only, skipping deleted cards", () => {
    const fresh = addCard({ basic: { front: 'F1', back: 'B1' } })
    const old = addCard({ basic: { front: 'F2', back: 'B2' } })
    const base = {
      rating: 3,
      state: 0,
      elapsedDays: 0,
      scheduledDays: 1,
      timeMs: 3000,
    }
    db.insert(revlog)
      .values([
        {
          id: 1_900_000_000_001,
          cardId: fresh.id,
          reviewedAt: '2026-11-08T10:00:00.000Z',
          ...base,
        },
        { id: 1_900_000_000_002, cardId: old.id, reviewedAt: '2026-10-01T10:00:00.000Z', ...base },
        // revlog for a card that no longer exists
        { id: 1_900_000_000_003, cardId: 987654, reviewedAt: '2026-11-08T11:00:00.000Z', ...base },
      ])
      .run()

    const minted = mintTmrCuesForRecentReviews('2026-11-08T00:00:00.000Z', 40, db)
    expect(minted).toBe(1)
    const cues = getTmrCuesForSleepReplay(100, db)
    expect(cues.some((c) => c.cardId === fresh.id)).toBe(true)
    expect(cues.some((c) => c.cardId === old.id)).toBe(false)

    // re-minting refreshes instead of duplicating
    expect(mintTmrCuesForRecentReviews('2026-11-08T00:00:00.000Z', 40, db)).toBe(1)
    const again = getTmrCuesForSleepReplay(100, db).filter((c) => c.cardId === fresh.id)
    expect(again).toHaveLength(1)
    expect(again[0]!.timesCuedAwake).toBe(2)
  })

  it('returns 0 when nothing was reviewed', () => {
    expect(mintTmrCuesForRecentReviews('2999-01-01T00:00:00.000Z', 40, db)).toBe(0)
  })
})

describe('GKT repo', () => {
  it('only the assessed node gets last_assessed_at; probabilities are clamped', () => {
    upsertConceptDagNode({ id: 'reg-a', title: 'A' }, db)
    upsertConceptDagNode({ id: 'reg-b', title: 'B' }, db)
    updateNodeMasteries({ 'reg-a': 1.5, 'reg-b': 0.4, 'reg-missing': 0.3 }, db, 'reg-b')
    const a = getConceptDagNode('reg-a', db)!
    const b = getConceptDagNode('reg-b', db)!
    expect(a.masteryProb).toBe(0.999)
    expect(a.lastAssessedAt).toBeNull()
    expect(b.masteryProb).toBe(0.4)
    expect(b.lastAssessedAt).not.toBeNull()
    expect(getConceptDagNode('nope', db)).toBeUndefined()
  })

  it('ignores non-finite probabilities', () => {
    updateNodeMasteries({ 'reg-a': Number.NaN }, db)
    expect(getConceptDagNode('reg-a', db)!.masteryProb).toBe(0.999)
  })

  it('a course-scoped DAG excludes edges into other courses', () => {
    const track = db.insert(tracks).values({ title: 'Reg Track' }).returning().all()[0]!
    const [c1] = db.insert(courses).values({ trackId: track.id, title: 'C1' }).returning().all()
    upsertConceptDagNode({ id: 'reg-in', title: 'In', courseId: c1!.id }, db)
    upsertConceptDagNode({ id: 'reg-in2', title: 'In2', courseId: c1!.id }, db)
    upsertConceptDagNode({ id: 'reg-out', title: 'Out' }, db)
    addConceptDagEdge({ prerequisiteId: 'reg-in', dependentId: 'reg-in2' }, db)
    addConceptDagEdge({ prerequisiteId: 'reg-in', dependentId: 'reg-out' }, db)
    const dag = getConceptDag(c1!.id, db)
    expect(dag.nodes.map((n) => n.id).sort()).toEqual(['reg-in', 'reg-in2'])
    expect(dag.edges).toHaveLength(1)
    expect(dag.edges[0]!.dependentId).toBe('reg-in2')
  })
})

describe('dialectic verdicts', () => {
  const xpTotal = () =>
    db
      .select()
      .from(xpEvents)
      .where(eq(xpEvents.source, 'debate'))
      .all()
      .reduce((s, e) => s + e.amount, 0)

  it('stores the ruling and awards XP once, atomically', () => {
    const debate = recordDialecticDebate(
      { topic: 'T', thesisAgentRole: 'A', antithesisAgentRole: 'B', transcript: [] },
      db,
    )
    const before = xpTotal()
    const first = submitDialecticVerdict(debate.id, 'It depends on team size.', 140, 35, db)!
    expect(first.debate.learnerVerdict).toBe('It depends on team size.')
    expect(first.debate.learnerScore).toBe(100) // clamped
    expect(first.xpAwarded).toBe(35)
    expect(xpTotal()).toBe(before + 35)

    const second = submitDialecticVerdict(debate.id, 'Revised ruling.', 60, 35, db)!
    expect(second.xpAwarded).toBe(0) // no XP farming
    expect(second.debate.learnerVerdict).toBe('Revised ruling.')
    expect(xpTotal()).toBe(before + 35)
  })

  it('returns undefined for an unknown debate and writes nothing', () => {
    const before = xpTotal()
    expect(submitDialecticVerdict(999_999, 'x', 50, 35, db)).toBeUndefined()
    expect(xpTotal()).toBe(before)
  })

  it('awards no XP when the caller passes none', () => {
    const debate = recordDialecticDebate(
      { topic: 'T2', thesisAgentRole: 'A', antithesisAgentRole: 'B', transcript: [] },
      db,
    )
    const before = xpTotal()
    expect(submitDialecticVerdict(debate.id, 'Short.', 10, 0, db)!.xpAwarded).toBe(0)
    expect(xpTotal()).toBe(before)
  })
})

describe('3D palace sources', () => {
  it("lists a palace's own loci in walk order with real card links", () => {
    const palace = db.insert(palaces).values({ name: 'Reg Villa' }).returning().all()[0]!
    const card = addCard({ basic: { front: 'P', back: 'Q' } })
    db.insert(palaceItems)
      .values([
        { palaceId: palace.id, lociIndex: 1, name: 'Fountain', cardId: card.id },
        { palaceId: palace.id, lociIndex: 0, name: 'Door' },
      ])
      .run()
    expect(getPalaceForScene(palace.id, db)?.name).toBe('Reg Villa')
    expect(getPalaceForScene(424242, db)).toBeUndefined()
    const sources = listPalaceLociSources(palace.id, db)
    expect(sources.map((s) => s.title)).toEqual(['Door', 'Fountain'])
    expect(sources[0]!.cardId).toBeNull()
    expect(sources[1]!.cardId).toBe(card.id)
  })
})

describe('listUntestedMaterial', () => {
  it('never returns a blank title (the response schema requires min 1)', () => {
    db.insert(notes).values({ title: '   ', content: 'Body text worth testing.' }).run()
    const items = listUntestedMaterial(100, db)
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.title.trim().length > 0)).toBe(true)
    expect(items.some((i) => i.title === 'Untitled note')).toBe(true)
  })
})

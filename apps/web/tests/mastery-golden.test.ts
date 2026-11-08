/**
 * GOLDEN behavior snapshot for exam-submit mastery/Elo updates (F-01, rule 7).
 *
 * Captured from the pre-refactor `curriculum/exam` submit handler — these
 * literals ARE the current behavior. The mastery-service refactor must keep
 * this suite passing UNCHANGED: same mastery rows, same elo_events rows.
 * Any intentional behavior change is a separate commit that edits these
 * values explicitly (never silently).
 *
 * Drives the real handler over HTTP with an isolated temp database (the
 * curriculum-api.test.ts pattern).
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-mastery-golden-')), 'golden.db')

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const url = (p: string) => `http://localhost${p}`

/** Freeze floats at 10 decimal places — exact enough to catch any drift, robust to REAL repr. */
const r10 = (n: number | null | undefined): number | null =>
  n === null || n === undefined ? null : Number(n.toFixed(10))

type Handlers = {
  exam: typeof import('@/server/handlers/curriculum/exam/route')
  db: typeof import('@learning-hub/db')
}
let H: Handlers

beforeAll(async () => {
  H = {
    exam: await import('@/server/handlers/curriculum/exam/route'),
    db: await import('@learning-hub/db'),
  }
  const { db, decks, skills, mastery, cards } = H.db
  db.insert(decks)
    .values({ id: 1, name: 'Golden Deck', createdAt: '2026-01-01T00:00:00.000Z' })
    .run()
  db.insert(skills)
    .values([
      { id: 42, name: 'Golden Skill A' },
      { id: 43, name: 'Golden Skill B' },
    ])
    .run()
  // Existing mastery for skill 42 → exercises the UPDATE branch.
  db.insert(mastery)
    .values({
      skillId: 42,
      pKnown: 0.2,
      attempts: 4,
      correct: 3,
      elo: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    .run()
  // Skill 43 has NO mastery row → exercises the INSERT branch.
  db.insert(cards)
    .values([
      {
        id: 3,
        deckId: 1,
        skillId: 42,
        type: 'basic',
        content: { basic: { front: 'a', back: 'b' } },
        due: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 4,
        deckId: 1,
        skillId: 43,
        type: 'basic',
        content: { basic: { front: 'c', back: 'd' } },
        due: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 5,
        deckId: 1,
        skillId: null,
        type: 'basic',
        content: { basic: { front: 'e', back: 'f' } },
        due: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    .run()
})

describe('GOLDEN: exam submit mastery/elo (pre-refactor behavior)', () => {
  it('records the exact mastery + elo_events produced by submit', async () => {
    const res = await H.exam.POST(
      new Request(
        url('/api/curriculum/exam'),
        json({
          action: 'submit',
          results: [
            { cardId: 3, grade: 4, confidence: 1 }, // update branch, correct (outcome 1.0)
            { cardId: 4, grade: 1, confidence: 0 }, // insert branch, wrong (outcome 0.0)
            { cardId: 5, grade: 3, confidence: 1 }, // skillId null → no mastery writes
          ],
        }),
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      graded: { cardId: number; skillId: number | null; pKnownAfter: number }[]
    }

    // Response shape (frozen)
    expect(body.ok).toBe(true)
    expect(
      body.graded.map((g) => ({
        cardId: g.cardId,
        skillId: g.skillId,
        pKnownAfter: r10(g.pKnownAfter),
      })),
    ).toEqual([
      { cardId: 3, skillId: 42, pKnownAfter: 0.6 },
      { cardId: 4, skillId: 43, pKnownAfter: 0.1616438356 },
      { cardId: 5, skillId: null, pKnownAfter: 0 },
    ])

    // Mastery rows (frozen — floats rounded to 10 dp)
    const { db, mastery, eloEvents } = H.db
    const rows = db.select().from(mastery).all()
    expect(
      rows.map((m) => ({
        skillId: m.skillId,
        pKnown: r10(m.pKnown),
        attempts: m.attempts,
        correct: m.correct,
        elo: r10(m.elo),
      })),
    ).toEqual([
      { skillId: 42, pKnown: 0.6, attempts: 5, correct: 4, elo: 1015.8415841584 },
      { skillId: 43, pKnown: 0.1616438356, attempts: 1, correct: 0, elo: 984 },
    ])

    // elo_events (append-only; frozen, createdAt excluded — wall clock)
    const events = db.select().from(eloEvents).all()
    expect(
      events.map((e) => ({
        skillId: e.skillId,
        ratingBefore: r10(e.ratingBefore),
        ratingAfter: r10(e.ratingAfter),
        itemDifficulty: r10(e.itemDifficulty),
        outcome: r10(e.outcome),
      })),
    ).toEqual([
      {
        skillId: 42,
        ratingBefore: 1000,
        ratingAfter: 1015.8415841584,
        itemDifficulty: 1000,
        outcome: 1,
      },
      { skillId: 43, ratingBefore: 1000, ratingAfter: 984, itemDifficulty: 1000, outcome: 0 },
    ])
  })
})

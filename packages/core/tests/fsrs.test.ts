/**
 * Agent A — FSRS bridge tests. All scheduler math is deterministic here:
 * fixed `now`, fixed rows, cached scheduler params (no fuzzing configured).
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  calculateRetrievability,
  cardRowToFsrs,
  dueQueueSelector,
  forecastNext30Days,
  formatRotation,
  fsrsToCardRow,
  leechCandidates,
  leitnerBox,
  leitnerHistogram,
  reviewCard,
} from '../src/fsrs'

const NOW = new Date('2026-11-04T12:00:00.000Z')

function rowFor(
  overrides: Partial<Parameters<typeof cardRowToFsrs>[0]> = {},
): Parameters<typeof cardRowToFsrs>[0] {
  return {
    id: 1,
    due: '2026-11-03T12:00:00.000Z',
    stability: 5,
    difficulty: 5,
    scheduledDays: 12,
    learningStep: 0,
    reps: 6,
    lapses: 1,
    state: 2,
    lastReview: '2026-10-22T12:00:00.000Z',
    ...overrides,
  }
}

describe('reviewCard — golden deterministic cases', () => {
  it('new card + Good → stability > 0 and due in the future', async () => {
    const row = rowFor({
      id: 7,
      due: NOW.toISOString(),
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: null,
    })
    const { card, revlogItem } = await reviewCard(row, 3, 1, 5000, 0.9, { now: NOW })
    expect(card.stability).toBeGreaterThan(0)
    expect(card.dueAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(card.reps).toBe(1)
    // revlog row is fully formed for the append-only insert
    expect(revlogItem).toEqual({
      id: NOW.getTime(),
      cardId: 7,
      rating: 3,
      state: 0,
      elapsedDays: 0,
      scheduledDays: card.scheduledDays,
      timeMs: 5000,
      confidence: 1,
      retrievability: null,
      reviewedAt: NOW.toISOString(),
    })
  })

  it('review-state card + Good → longer interval, state stays Review, deterministic', async () => {
    const row = rowFor({})
    const a = await reviewCard(row, 3, 1, 4200, 0.9, { now: NOW })
    const b = await reviewCard(row, 3, 1, 4200, 0.9, { now: NOW })
    expect(a.card.dueAt.toISOString()).toBe(b.card.dueAt.toISOString())
    expect(a.card.stability).toBeCloseTo(b.card.stability, 10)
    expect(a.card.state).toBe(2)
    expect(a.card.scheduledDays).toBeGreaterThan(row.scheduledDays)
    // revlog.state is the PRE-review state (Anki-compatible semantics)
    expect(a.revlogItem.state).toBe(2)
    expect(a.revlogItem.elapsedDays).toBe(13) // Oct 22 → Nov 4
  })

  it('Again on a review card lapses it into relearning', async () => {
    const row = rowFor({})
    const { card } = await reviewCard(row, 1, 0, 9000, 0.9, { now: NOW })
    expect(card.lapses).toBe(row.lapses + 1)
    expect(card.dueAt.getTime()).toBeGreaterThan(NOW.getTime()) // short-term relearn step
    expect([1, 3]).toContain(card.state) // Learning or Relearning
  })

  it('input row is never mutated', async () => {
    const row = rowFor({})
    const snapshot = { ...row }
    await reviewCard(row, 3, 1, 1000, 0.9, { now: NOW })
    expect(row).toEqual(snapshot)
  })
})

describe('serialization round-trip', () => {
  it('row → fsrs card → row preserves every scheduling field', () => {
    const row = rowFor({})
    const patched = fsrsToCardRow(cardRowToFsrs(row))
    expect(patched.due).toBe(row.due)
    expect(patched.stability).toBe(row.stability)
    expect(patched.difficulty).toBe(row.difficulty)
    expect(patched.scheduledDays).toBe(row.scheduledDays)
    expect(patched.learningStep).toBe(row.learningStep)
    expect(patched.reps).toBe(row.reps)
    expect(patched.lapses).toBe(row.lapses)
    expect(patched.state).toBe(row.state)
    expect(patched.lastReview).toBe(row.lastReview)
  })

  it('property: round-trip is lossless for realistic row values', () => {
    const isoArb = fc
      .integer({ min: Date.parse('2020-01-01'), max: Date.parse('2028-01-01') })
      .map((ms) => new Date(ms).toISOString())
    const rowArb = fc.record({
      id: fc.integer({ min: 1, max: 100000 }),
      due: isoArb,
      stability: fc.float({ min: 0, max: 365, noNaN: true }),
      difficulty: fc.float({ min: 1, max: 10, noNaN: true }),
      scheduledDays: fc.integer({ min: 0, max: 3650 }),
      learningStep: fc.integer({ min: 0, max: 3 }),
      reps: fc.integer({ min: 0, max: 500 }),
      lapses: fc.integer({ min: 0, max: 100 }),
      state: fc.constantFrom(0, 1, 2, 3),
      lastReview: fc.option(isoArb, { nil: null }),
    })
    fc.assert(
      fc.property(rowArb, (row) => {
        const patched = fsrsToCardRow(cardRowToFsrs(row))
        expect(patched.due).toBe(row.due)
        expect(patched.stability).toBe(row.stability)
        expect(patched.difficulty).toBe(row.difficulty)
        expect(patched.scheduledDays).toBe(row.scheduledDays)
        expect(patched.learningStep).toBe(row.learningStep)
        expect(patched.reps).toBe(row.reps)
        expect(patched.lapses).toBe(row.lapses)
        expect(patched.state).toBe(row.state)
        expect(patched.lastReview).toBe(row.lastReview)
      }),
    )
  })
})

describe('fast-check scheduling properties', () => {
  it('property: stability never decreases after a Good review', async () => {
    const rowArb = fc
      .record({
        stability: fc.float({ min: 0.5, max: 300, noNaN: true }),
        difficulty: fc.float({ min: 1, max: 10, noNaN: true }),
      })
      .map(({ stability, difficulty }) => rowFor({ stability, difficulty, state: 2, reps: 5 }))
    await fc.assert(
      fc.asyncProperty(rowArb, async (row) => {
        const { card } = await reviewCard(row, 3, 1, 3000, 0.9, { now: NOW })
        expect(card.stability).toBeGreaterThanOrEqual(row.stability)
      }),
    )
  })

  it('property: scheduled interval is monotonic in stability (Good review)', async () => {
    const stabilityArb = fc.float({ min: 0.5, max: 300, noNaN: true })
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(stabilityArb, stabilityArb).filter(([s1, s2]) => s1 < s2),
        async ([s1, s2]) => {
          const low = rowFor({ stability: s1, state: 2, reps: 5 })
          const high = rowFor({ stability: s2, state: 2, reps: 5 })
          const a = await reviewCard(low, 3, 1, 3000, 0.9, { now: NOW })
          const b = await reviewCard(high, 3, 1, 3000, 0.9, { now: NOW })
          expect(b.card.scheduledDays).toBeGreaterThanOrEqual(a.card.scheduledDays)
          expect(b.card.dueAt.getTime()).toBeGreaterThanOrEqual(a.card.dueAt.getTime())
        },
      ),
    )
  })
})

describe('leitner box view', () => {
  it('maps new/learning/relearning cards to box 1', () => {
    for (const state of [0, 1, 3]) {
      expect(leitnerBox({ state, stability: 50 })).toBe(1)
    }
  })

  it('maps review cards by stability', () => {
    expect(leitnerBox({ state: 2, stability: 0.5 })).toBe(2)
    expect(leitnerBox({ state: 2, stability: 1 })).toBe(3)
    expect(leitnerBox({ state: 2, stability: 9.9 })).toBe(3)
    expect(leitnerBox({ state: 2, stability: 10 })).toBe(4)
    expect(leitnerBox({ state: 2, stability: 100 })).toBe(5)
  })

  it('histogram counts per box, summing to the row count', () => {
    const hist = leitnerHistogram([
      { state: 0, stability: 0 },
      { state: 2, stability: 2 },
      { state: 2, stability: 50 },
      { state: 2, stability: 365 },
      { state: 2, stability: 365 },
    ])
    expect(hist).toEqual([1, 0, 1, 1, 2])
    expect(hist.reduce((a, b) => a + b, 0)).toBe(5)
  })
})

describe('queue helpers', () => {
  it('dueQueueSelector filters suspended/buried/future and sorts soonest first', () => {
    const rows = [
      { id: 3, due: '2026-11-05T00:00:00Z', suspended: false, buryUntil: null },
      { id: 1, due: '2026-11-03T00:00:00Z', suspended: false, buryUntil: null },
      { id: 2, due: '2026-11-01T00:00:00Z', suspended: true, buryUntil: null },
      { id: 4, due: '2026-11-01T00:00:00Z', suspended: false, buryUntil: '2026-11-10T00:00:00Z' },
      { id: 5, due: '2026-11-02T00:00:00Z', suspended: false, buryUntil: null },
    ]
    const queue = dueQueueSelector(rows, new Date('2026-11-04T00:00:00Z'))
    expect(queue.map((r) => r.id)).toEqual([5, 1]) // soonest due first
  })

  it('forecastNext30Days buckets dues per UTC day', () => {
    const from = new Date('2026-11-04T00:00:00Z')
    const rows = [
      { due: '2026-11-04T08:00:00Z' },
      { due: '2026-11-04T23:00:00Z' },
      { due: '2026-11-05T00:30:00Z' },
      { due: '2026-12-20T00:00:00Z' }, // beyond 30d window → ignored
    ]
    const forecast = forecastNext30Days(rows, from)
    expect(forecast).toHaveLength(30)
    expect(forecast[0]).toEqual({ date: '2026-11-04', due: 2 })
    expect(forecast[1]).toEqual({ date: '2026-11-05', due: 1 })
    expect(forecast.reduce((acc, d) => acc + d.due, 0)).toBe(3)
  })

  it('leechCandidates applies the lapse threshold', () => {
    const rows = [
      { id: 1, lapses: 7 },
      { id: 2, lapses: 8 },
      { id: 3, lapses: 12 },
    ]
    expect(leechCandidates(rows, 8).map((r) => r.id)).toEqual([2, 3])
    expect(leechCandidates(rows).map((r) => r.id)).toEqual([2, 3])
  })

  it('formatRotation graduates mcq → cloze → typein with stability', () => {
    expect(formatRotation('mcq', 1)).toBe('mcq')
    expect(formatRotation('mcq', 4.9)).toBe('mcq')
    expect(formatRotation('mcq', 6)).toBe('cloze')
    expect(formatRotation('mcq', 10)).toBe('typein')
    expect(formatRotation('cloze', 11)).toBe('typein')
    expect(formatRotation('cloze', 3)).toBe('cloze')
    expect(formatRotation('basic', 99)).toBe('basic')
  })
})

describe('calculateRetrievability (Addon 10)', () => {
  it('satisfies FSRS-6 theoretical calibration anchors', () => {
    // At t = 0, memory is fresh -> R = 1.0
    expect(calculateRetrievability(10, 0)).toBe(1)

    // At t = S, by definition of stability, R = 0.90
    expect(calculateRetrievability(10, 10)).toBeCloseTo(0.9, 5)
    expect(calculateRetrievability(30, 30)).toBeCloseTo(0.9, 5)
    expect(calculateRetrievability(100, 100)).toBeCloseTo(0.9, 5)

    // At t = 2S, decay drops below 0.9
    expect(calculateRetrievability(10, 20)).toBeCloseTo(0.84588, 4)
  })

  it('strictly bounds output in [0, 1] across all edge cases', () => {
    expect(calculateRetrievability(0, 5)).toBe(0)
    expect(calculateRetrievability(-5, 5)).toBe(0)
    expect(calculateRetrievability(10, -5)).toBe(1)
    expect(calculateRetrievability(NaN, 5)).toBe(0)
    expect(calculateRetrievability(10, NaN)).toBe(0)
    expect(calculateRetrievability(10, 1_000_000)).toBeGreaterThan(0)
    expect(calculateRetrievability(10, 1_000_000)).toBeLessThan(1)
  })

  it('property test: retrievability is always strictly in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 10000, noNaN: true }),
        fc.double({ min: 0, max: 10000, noNaN: true }),
        (s, t) => {
          const r = calculateRetrievability(s, t)
          return r >= 0 && r <= 1 && !isNaN(r)
        },
      ),
    )
  })

  it('records retrievability in revlogItem when reviewCard is called on active card', async () => {
    const row = rowFor({
      id: 99,
      stability: 10,
      difficulty: 5,
      state: 2, // Review state
      lastReview: new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
    })
    const { revlogItem } = await reviewCard(row, 3, 1, 5000, 0.9, { now: NOW })
    expect(revlogItem.retrievability).toBeDefined()
    expect(revlogItem.retrievability).toBeCloseTo(0.9, 3)
  })
})

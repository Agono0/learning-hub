/**
 * Agent A — review session tests: hypercorrection priority, mode behaviors,
 * energy system, worked-example fading, Yerkes-Dodson tuning.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_ENERGY,
  adjustDifficulty,
  applyMistake,
  buildSession,
  initialEnergy,
  refillEnergy,
  stepsToShow,
  workedExampleFade,
  type SessionRow,
} from '../src/review'

const AS_OF = new Date('2026-11-04T12:00:00Z')

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 1,
    deckId: 1,
    due: '2026-11-01T00:00:00Z',
    state: 2,
    reps: 3,
    stability: 5,
    suspended: false,
    buryUntil: null,
    recentRevlog: null,
    ...overrides,
  }
}

describe('buildSession — normal mode', () => {
  it('puts confident-wrong cards first (hypercorrection)', () => {
    const rows = [
      row({ id: 1, deckId: 1, due: '2026-10-01T00:00:00Z' }), // most overdue
      row({ id: 2, deckId: 1, due: '2026-11-01T00:00:00Z', recentRevlog: { rating: 1, confidence: 1, reviewedAt: '2026-11-04T10:00:00Z' } }),
      row({ id: 3, deckId: 1, due: '2026-11-02T00:00:00Z' }),
    ]
    const session = buildSession({ rows, limit: 10, mode: 'normal', asOf: AS_OF })
    expect(session[0]?.id).toBe(2) // confident-wrong first, despite being less overdue
    expect(session.slice(1).map((r) => r.id)).toEqual([1, 3]) // then most overdue first
  })

  it('unsure-wrong cards are NOT hypercorrection priority', () => {
    const rows = [
      row({ id: 1, due: '2026-11-01T00:00:00Z' }),
      row({ id: 2, due: '2026-11-02T00:00:00Z', recentRevlog: { rating: 1, confidence: 0, reviewedAt: '2026-11-04T10:00:00Z' } }),
    ]
    const session = buildSession({ rows, limit: 10, mode: 'normal', asOf: AS_OF })
    expect(session[0]?.id).toBe(1) // regular ordering
  })

  it('excludes suspended and buried cards', () => {
    const rows = [
      row({ id: 1, suspended: true }),
      row({ id: 2, buryUntil: '2026-11-10T00:00:00Z' }),
      row({ id: 3 }),
    ]
    const session = buildSession({ rows, limit: 10, mode: 'normal', asOf: AS_OF })
    expect(session.map((r) => r.id)).toEqual([3])
  })

  it('normal mode ignores not-yet-due cards', () => {
    const rows = [row({ id: 1 }), row({ id: 2, due: '2026-12-01T00:00:00Z' })]
    const session = buildSession({ rows, limit: 10, mode: 'normal', asOf: AS_OF })
    expect(session.map((r) => r.id)).toEqual([1])
  })

  it('respects the limit and interleaves decks', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => row({ id: i, deckId: 1, due: '2026-11-01T00:00:00Z' })),
      ...Array.from({ length: 6 }, (_, i) => row({ id: 100 + i, deckId: 2, due: '2026-11-02T00:00:00Z' })),
    ]
    const session = buildSession({ rows, limit: 8, mode: 'normal', asOf: AS_OF })
    expect(session).toHaveLength(8)
    // deck fairness: with 2 equal decks, no two adjacent cards share a deck
    for (let i = 1; i < session.length; i++) {
      expect(session[i].deckId).not.toBe(session[i - 1].deckId)
    }
  })

  it('is deterministic for the same input', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ id: i, deckId: i % 3 }))
    const a = buildSession({ rows, limit: 10, mode: 'normal', asOf: AS_OF })
    const b = buildSession({ rows, limit: 10, mode: 'normal', asOf: AS_OF })
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id))
  })
})

describe('buildSession — pretest and cram modes', () => {
  it('pretest surfaces never-reviewed cards first', () => {
    const rows = [
      row({ id: 1, reps: 5, due: '2026-10-01T00:00:00Z' }),
      row({ id: 2, reps: 0, due: '2026-11-05T00:00:00Z', state: 0, stability: 0 }),
      row({ id: 3, reps: 2, due: '2026-10-20T00:00:00Z' }),
    ]
    const session = buildSession({ rows, limit: 10, mode: 'pretest', asOf: AS_OF })
    expect(session[0]?.id).toBe(2)
  })

  it('cram ignores due dates and orders by weakest stability first', () => {
    const rows = [
      row({ id: 1, stability: 30, due: '2026-12-01T00:00:00Z' }),
      row({ id: 2, stability: 2, due: '2026-12-02T00:00:00Z' }),
      row({ id: 3, stability: 10, due: '2026-12-03T00:00:00Z' }),
    ]
    const session = buildSession({ rows, limit: 10, mode: 'cram', asOf: AS_OF })
    expect(session.map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('cram still leads with hypercorrection', () => {
    const rows = [
      row({ id: 1, stability: 30, due: '2026-12-01T00:00:00Z' }),
      row({ id: 2, stability: 2, due: '2026-12-02T00:00:00Z', recentRevlog: { rating: 1, confidence: 1, reviewedAt: '2026-11-04T10:00:00Z' } }),
    ]
    const session = buildSession({ rows, limit: 10, mode: 'cram', asOf: AS_OF })
    expect(session[0]?.id).toBe(2)
  })
})

describe('energy system', () => {
  it('max 5, mistake costs 1, refill per session', () => {
    expect(MAX_ENERGY).toBe(5)
    expect(initialEnergy()).toBe(5)
    expect(applyMistake(5)).toBe(4)
    expect(applyMistake(1)).toBe(0)
    expect(applyMistake(0)).toBe(0) // never negative
    expect(refillEnergy()).toBe(5)
  })
})

describe('worked example fading', () => {
  it('fades from full worked example to full problem', () => {
    expect(workedExampleFade(0).visibleFraction).toBe(1)
    expect(workedExampleFade(1).visibleFraction).toBeCloseTo(2 / 3)
    expect(workedExampleFade(2).visibleFraction).toBeCloseTo(1 / 3)
    expect(workedExampleFade(3).visibleFraction).toBe(0)
  })

  it('clamps out-of-range levels', () => {
    expect(workedExampleFade(-2).level).toBe(0)
    expect(workedExampleFade(9).level).toBe(3)
  })

  it('stepsToShow rounds', () => {
    expect(stepsToShow(1, 6)).toBe(4)
    expect(stepsToShow(3, 6)).toBe(0)
    expect(stepsToShow(0, 6)).toBe(6)
  })
})

describe('adjustDifficulty (Yerkes-Dodson)', () => {
  it('suggests easier in the frustration zone', () => {
    const out = adjustDifficulty({ recentAccuracy: 0.4, recentAvgTime: 20000 })
    expect(out.suggestion).toBe('easier')
  })

  it('suggests harder in the boredom zone', () => {
    const out = adjustDifficulty({ recentAccuracy: 0.97, recentAvgTime: 5000 })
    expect(out.suggestion).toBe('harder')
  })

  it('keeps in the desirable-difficulty band', () => {
    const out = adjustDifficulty({ recentAccuracy: 0.8, recentAvgTime: 12000 })
    expect(out.suggestion).toBe('keep')
  })

  it('slow answers prevent the harder suggestion even at high accuracy', () => {
    const out = adjustDifficulty({ recentAccuracy: 0.95, recentAvgTime: 45000 })
    expect(out.suggestion).toBe('keep')
  })
})

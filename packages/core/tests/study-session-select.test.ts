import { describe, expect, it } from 'vitest'
import {
  decayFromWeights,
  estimateRecall,
  parseStudySessionFilter,
  selectStudySession,
  sessionFingerprint,
  type SessionCardRow,
  type StudySessionFilter,
} from '../src/study-session'

const NOW = new Date('2026-12-01T12:00:00.000Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

function card(id: number, over: Partial<SessionCardRow> = {}): SessionCardRow {
  return {
    id,
    deckId: 1,
    tags: [],
    state: 2,
    due: day(0),
    stability: 10,
    lapses: 0,
    lastReview: day(-10),
    suspended: false,
    buryUntil: null,
    createdAt: `2026-01-${String((id % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    ...over,
  }
}

function f(input: unknown = {}): StudySessionFilter {
  const r = parseStudySessionFilter(input)
  if (!r.ok) throw new Error(r.error)
  return r.filter
}

describe('selectStudySession', () => {
  it('never picks suspended or buried cards and counts them', () => {
    const rows = [
      card(1),
      card(2, { suspended: true }),
      card(3, { buryUntil: day(1) }),
      card(4, { buryUntil: day(-1) }),
    ]
    const s = selectStudySession(rows, f(), NOW)
    expect(s.selected.map((p) => p.id)).toEqual([1, 4])
    expect(s.excluded).toEqual({ suspended: 1, buried: 1, unreadableDue: 0 })
    expect(s.scanned).toBe(4)
  })

  it('counts cards with an unreadable due date instead of crashing', () => {
    const s = selectStudySession([card(1, { due: 'nope' }), card(2)], f(), NOW)
    expect(s.excluded.unreadableDue).toBe(1)
    expect(s.selected.map((p) => p.id)).toEqual([2])
  })

  it('requires every tag, exactly', () => {
    const rows = [
      card(1, { tags: ['a', 'b'] }),
      card(2, { tags: ['a'] }),
      card(3, { tags: ['A', 'b'] }),
    ]
    expect(
      selectStudySession(rows, f({ tags: ['a', 'b'] }), NOW).selected.map((p) => p.id),
    ).toEqual([1])
  })

  it('filters by deck and state', () => {
    const rows = [card(1, { deckId: 1 }), card(2, { deckId: 2 }), card(3, { deckId: 2, state: 3 })]
    const s = selectStudySession(rows, f({ deckIds: [2], states: [3] }), NOW)
    expect(s.selected.map((p) => p.id)).toEqual([3])
  })

  it('filters by lapse range', () => {
    const rows = [card(1, { lapses: 1 }), card(2, { lapses: 5 }), card(3, { lapses: 9 })]
    expect(
      selectStudySession(rows, f({ minLapses: 4, maxLapses: 8 }), NOW).selected.map((p) => p.id),
    ).toEqual([2])
    expect(selectStudySession(rows, f({ minLapses: 5 }), NOW).matched).toBe(2)
  })

  it('treats dueByDays 0 as due now or overdue', () => {
    const rows = [card(1, { due: day(-3) }), card(2, { due: day(0) }), card(3, { due: day(2) })]
    expect(selectStudySession(rows, f({ dueByDays: 0 }), NOW).selected.map((p) => p.id)).toEqual([
      1, 2,
    ])
    expect(selectStudySession(rows, f({ dueByDays: 2 }), NOW).matched).toBe(3)
  })

  it('reports negative dueInDays for overdue cards', () => {
    const s = selectStudySession([card(1, { due: day(-3) })], f(), NOW)
    expect(s.selected[0]?.dueInDays).toBe(-3)
  })

  describe('recall', () => {
    it('has no estimate for new cards, cards without stability or without a last review', () => {
      expect(estimateRecall(card(1, { state: 0 }), NOW.getTime())).toBeNull()
      expect(estimateRecall(card(1, { stability: 0 }), NOW.getTime())).toBeNull()
      expect(estimateRecall(card(1, { lastReview: null }), NOW.getTime())).toBeNull()
      expect(estimateRecall(card(1, { lastReview: 'bad' }), NOW.getTime())).toBeNull()
    })

    it('is near 0.9 when elapsed days equal stability and falls with time', () => {
      const r10 = estimateRecall(card(1, { stability: 10, lastReview: day(-10) }), NOW.getTime())!
      const r60 = estimateRecall(card(1, { stability: 10, lastReview: day(-60) }), NOW.getTime())!
      expect(r10).toBeGreaterThan(0.89)
      expect(r10).toBeLessThan(0.91)
      expect(r60).toBeLessThan(r10)
    })

    it('recallBelow keeps weak cards, drops cards with no estimate and says how many', () => {
      const rows = [
        card(1, { lastReview: day(-100) }),
        card(2, { lastReview: day(-1) }),
        card(3, { state: 0 }),
      ]
      const s = selectStudySession(rows, f({ recallBelow: 0.7 }), NOW)
      expect(s.selected.map((p) => p.id)).toEqual([1])
      expect(s.noRecallEstimate).toBe(1)
      expect(s.funnel.at(-1)).toMatchObject({ key: 'recall', count: 1 })
    })
  })

  describe('order and limit', () => {
    it('breaks every tie by card id', () => {
      const rows = [card(5), card(2), card(9), card(1)]
      for (const sort of ['most-overdue', 'lowest-recall', 'most-lapses', 'newest'] as const) {
        const a = selectStudySession(rows, f({ sort }), NOW).selected.map((p) => p.id)
        const b = selectStudySession([...rows].reverse(), f({ sort }), NOW).selected.map(
          (p) => p.id,
        )
        expect(a).toEqual(b)
      }
    })

    it('sorts by the chosen key', () => {
      const rows = [
        card(1, { due: day(-1), lapses: 1, lastReview: day(-5) }),
        card(2, { due: day(-9), lapses: 4, lastReview: day(-9) }),
        card(3, { due: day(-4), lapses: 8, lastReview: day(-40) }),
      ]
      const ids = (sort: string) =>
        selectStudySession(rows, f({ sort }), NOW).selected.map((p) => p.id)
      expect(ids('most-overdue')).toEqual([2, 3, 1])
      expect(ids('most-lapses')).toEqual([3, 2, 1])
      expect(ids('lowest-recall')).toEqual([3, 2, 1])
    })

    it('puts cards without an estimate last when sorting by recall', () => {
      const rows = [card(1, { state: 0 }), card(2)]
      expect(
        selectStudySession(rows, f({ sort: 'lowest-recall' }), NOW).selected.map((p) => p.id),
      ).toEqual([2, 1])
    })

    it('limits the session and reports that more matched', () => {
      const rows = Array.from({ length: 30 }, (_, i) => card(i + 1))
      const s = selectStudySession(rows, f({ limit: 10 }), NOW)
      expect(s.selected).toHaveLength(10)
      expect(s.matched).toBe(30)
      expect(s.truncated).toBe(true)
      const all = selectStudySession(rows, f({ limit: 30 }), NOW)
      expect(all.truncated).toBe(false)
    })

    it('never returns more than 100 cards', () => {
      const rows = Array.from({ length: 250 }, (_, i) => card(i + 1))
      const s = selectStudySession(rows, f({ limit: 100 }), NOW)
      expect(s.selected).toHaveLength(100)
      expect(s.matched).toBe(250)
    })
  })

  describe('funnel', () => {
    it('reports the count after each active step so an empty result says why', () => {
      const rows = [card(1, { tags: ['a'] }), card(2, { tags: ['a'], lapses: 3 }), card(3)]
      const s = selectStudySession(rows, f({ tags: ['a'], minLapses: 5 }), NOW)
      expect(s.funnel.map((x) => [x.key, x.count])).toEqual([
        ['eligible', 3],
        ['tags', 2],
        ['lapses', 0],
      ])
      expect(s.selected).toEqual([])
      expect(s.truncated).toBe(false)
    })

    it('handles an empty collection', () => {
      const s = selectStudySession([], f({ recallBelow: 0.5 }), NOW)
      expect(s.matched).toBe(0)
      expect(s.selected).toEqual([])
      expect(s.funnel[0]).toMatchObject({ key: 'eligible', count: 0 })
    })
  })

  describe('fingerprint', () => {
    it('is stable for the same ordered ids and changes when the set or order changes', () => {
      expect(sessionFingerprint([1, 2, 3])).toBe(sessionFingerprint([1, 2, 3]))
      expect(sessionFingerprint([1, 2, 3])).not.toBe(sessionFingerprint([1, 2, 4]))
      expect(sessionFingerprint([1, 2, 3])).not.toBe(sessionFingerprint([3, 2, 1]))
      expect(sessionFingerprint([1, 23])).not.toBe(sessionFingerprint([12, 3]))
    })

    it('changes when a picked card gets suspended', () => {
      const rows = [card(1), card(2)]
      const a = selectStudySession(rows, f(), NOW)
      const b = selectStudySession([card(1), card(2, { suspended: true })], f(), NOW)
      expect(a.fingerprint).not.toBe(b.fingerprint)
    })
  })

  describe('forgetting-curve decay', () => {
    it('decayFromWeights accepts only a 21-value set with an in-range decay', () => {
      const w = Array.from({ length: 21 }, () => 1)
      expect(decayFromWeights(null)).toBeNull()
      expect(decayFromWeights(w.slice(0, 19))).toBeNull()
      expect(decayFromWeights([...w.slice(0, 20), 0.3])).toBe(0.3)
      expect(decayFromWeights([...w.slice(0, 20), 0.05])).toBeNull()
      expect(decayFromWeights([...w.slice(0, 20), 0.9])).toBeNull()
      expect(decayFromWeights([...w.slice(0, 20), NaN])).toBeNull()
    })

    it('a different decay changes the estimate for the same card', () => {
      const base = card(1, { stability: 10, lastReview: day(-40) })
      const a = estimateRecall({ ...base, decay: null }, NOW.getTime())!
      const b = estimateRecall({ ...base, decay: 0.5 }, NOW.getTime())!
      expect(a).not.toBeCloseTo(b, 3)
    })

    it('counts and discloses which cards used a custom decay', () => {
      const rows = [card(1, { decay: 0.3 }), card(2), card(3, { state: 0, decay: 0.3 })]
      const s = selectStudySession(rows, f({ limit: 10 }), NOW)
      expect(s.decaySource).toEqual({ custom: 1, default: 1 })
      expect(s.assumptions[0]).toMatch(/1 of 2 matching cards use the forgetting-curve decay/)
      expect(s.assumptions[0]).toMatch(/not a validated prediction/)
      const none = selectStudySession([card(1)], f(), NOW)
      expect(none.decaySource).toEqual({ custom: 0, default: 1 })
      expect(none.assumptions[0]).toMatch(/default FSRS-6 forgetting curve/)
      expect(none.assumptions[0]).not.toMatch(/personal/i)
    })
  })

  it('states its model assumptions with the date', () => {
    const s = selectStudySession([card(1)], f(), NOW)
    expect(s.assumptions[0]).toContain('as of 2026-12-01')
    expect(s.assumptions[0]).toMatch(/not a validated prediction/)
  })
})

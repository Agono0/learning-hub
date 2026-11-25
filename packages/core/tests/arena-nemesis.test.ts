import { describe, expect, it } from 'vitest'
import {
  analyzeCardPerformance,
  masteryTier,
  nemesisScore,
  rankNemeses,
  redeemedCards,
  tierBreakdown,
  type NemesisGradeEntry,
} from '../src/arena'

const E = (cardId: number, grade: number, confidence = 0, timeMs = 3000): NemesisGradeEntry => ({
  cardId,
  grade,
  confidence,
  timeMs,
})

describe('analyzeCardPerformance', () => {
  it('returns nothing for empty logs', () => {
    expect(analyzeCardPerformance([])).toEqual([])
    expect(analyzeCardPerformance([[]])).toEqual([])
  })

  it('merges a card across runs in log order', () => {
    const [s] = analyzeCardPerformance([[E(1, 1)], [E(1, 3)], [E(1, 4)]])
    expect(s!.attempts).toBe(3)
    expect(s!.correct).toBe(2)
    expect(s!.misses).toBe(1)
    expect(s!.lastGrade).toBe(4)
    expect(s!.correctStreak).toBe(2)
  })

  it('ignores out-of-range grades and non-integer ids', () => {
    const out = analyzeCardPerformance([[E(1, 0), E(1, 5), E(1.5, 3), E(2, 3)]])
    expect(out.map((s) => s.cardId)).toEqual([2])
  })

  it('counts overconfident misses and the worst miss streak', () => {
    const [s] = analyzeCardPerformance([[E(7, 1, 1), E(7, 2, 1), E(7, 1, 0), E(7, 3), E(7, 1, 1)]])
    expect(s!.overconfidentMisses).toBe(3)
    expect(s!.worstMissStreak).toBe(3)
    expect(s!.correctStreak).toBe(0)
  })

  it('averages time rounded', () => {
    const [s] = analyzeCardPerformance([[E(1, 3, 0, 1000), E(1, 3, 0, 2001)]])
    expect(s!.avgTimeMs).toBe(1501)
  })

  it('reports recentDelta only from 4 attempts', () => {
    const three = analyzeCardPerformance([[E(1, 1), E(1, 3), E(1, 3)]])[0]!
    expect(three.recentDelta).toBeNull()
    const four = analyzeCardPerformance([[E(1, 1), E(1, 3), E(1, 3), E(1, 3)]])[0]!
    expect(four.recentDelta).toBe(1)
    const worse = analyzeCardPerformance([[E(1, 3), E(1, 1), E(1, 1), E(1, 1)]])[0]!
    expect(worse.recentDelta).toBe(-1)
  })
})

describe('masteryTier', () => {
  it('needs volume for mastered', () => {
    expect(masteryTier({ attempts: 1, accuracy: 1, correctStreak: 1 })).toBe('new')
    expect(masteryTier({ attempts: 3, accuracy: 1, correctStreak: 3 })).toBe('steady')
    expect(masteryTier({ attempts: 5, accuracy: 1, correctStreak: 5 })).toBe('mastered')
  })
  it('falls through learning to shaky', () => {
    expect(masteryTier({ attempts: 4, accuracy: 0.5, correctStreak: 0 })).toBe('learning')
    expect(masteryTier({ attempts: 4, accuracy: 0.25, correctStreak: 0 })).toBe('shaky')
  })
})

describe('nemesisScore', () => {
  it('is zero below the evidence floor', () => {
    expect(
      nemesisScore({
        attempts: 1,
        misses: 1,
        overconfidentMisses: 1,
        worstMissStreak: 1,
        correctStreak: 0,
      }),
    ).toBe(0)
  })
  it('rises with confident misses and falls with recovery', () => {
    const base = {
      attempts: 6,
      misses: 4,
      overconfidentMisses: 0,
      worstMissStreak: 2,
      correctStreak: 0,
    }
    const plain = nemesisScore(base)
    expect(nemesisScore({ ...base, overconfidentMisses: 2 })).toBe(plain + 10)
    expect(nemesisScore({ ...base, correctStreak: 2 })).toBe(plain - 20)
  })
  it('never goes negative', () => {
    expect(
      nemesisScore({
        attempts: 6,
        misses: 0,
        overconfidentMisses: 0,
        worstMissStreak: 0,
        correctStreak: 6,
      }),
    ).toBe(0)
  })
})

describe('ranking helpers', () => {
  const logs = [
    [
      E(1, 1, 1),
      E(1, 1, 1),
      E(1, 2),
      E(2, 3),
      E(2, 3),
      E(3, 1),
      E(3, 1),
      E(3, 3),
      E(3, 3),
      E(3, 3),
    ],
  ]
  const stats = analyzeCardPerformance(logs)

  it('ranks the worst card first and skips clean ones', () => {
    const ranked = rankNemeses(stats)
    expect(ranked[0]!.cardId).toBe(1)
    expect(ranked.some((s) => s.cardId === 2)).toBe(false)
  })

  it('limits and handles zero', () => {
    expect(rankNemeses(stats, 1)).toHaveLength(1)
    expect(rankNemeses(stats, 0)).toEqual([])
  })

  it('finds redeemed cards (hurt, then streak)', () => {
    expect(redeemedCards(stats).map((s) => s.cardId)).toEqual([3])
  })

  it('breaks down tiers', () => {
    const b = tierBreakdown(stats)
    expect(b.new + b.shaky + b.learning + b.steady + b.mastered).toBe(stats.length)
  })

  it('is deterministic', () => {
    expect(analyzeCardPerformance(logs)).toEqual(analyzeCardPerformance(logs))
  })
})

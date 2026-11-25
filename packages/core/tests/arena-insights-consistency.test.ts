/**
 * Cross-module consistency: the nemesis ranking, per-card timeline, practice
 * rank and run share text all read the same accepted grade logs, so they must
 * never disagree about the same history. Deterministic pseudo-random logs.
 */
import { describe, expect, it } from 'vitest'
import {
  analyzeCardPerformance,
  buildCardTimeline,
  rankNemeses,
  tierBreakdown,
  type NemesisGradeEntry,
} from '../src/arena'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function makeLogs(seed: number, runs: number, cards: number): NemesisGradeEntry[][] {
  const rnd = lcg(seed)
  return Array.from({ length: runs }, () =>
    Array.from({ length: 3 + Math.floor(rnd() * 8) }, () => ({
      cardId: 1 + Math.floor(rnd() * cards),
      grade: 1 + Math.floor(rnd() * 4),
      confidence: rnd() < 0.5 ? 0 : 1,
      timeMs: Math.floor(rnd() * 9000),
    })),
  )
}

describe('arena insights stay consistent on the same logs', () => {
  for (const seed of [1, 7, 42, 2026]) {
    const logs = makeLogs(seed, 12, 6)
    const stats = analyzeCardPerformance(logs)

    it(`seed ${seed}: timeline stats equal ranking stats for every card`, () => {
      for (const s of stats) {
        const t = buildCardTimeline(logs, s.cardId)
        expect(t.stats).toEqual(s)
        expect(t.attempts).toHaveLength(s.attempts)
        expect(t.attempts.filter((a) => a.correct)).toHaveLength(s.correct)
        expect(t.attempts.filter((a) => a.overconfident)).toHaveLength(s.overconfidentMisses)
      }
    })

    it(`seed ${seed}: attempts partition the logged entries`, () => {
      const total = logs.reduce((n, l) => n + l.length, 0)
      expect(stats.reduce((n, s) => n + s.attempts, 0)).toBe(total)
    })

    it(`seed ${seed}: ranking is sorted and drawn from the stats`, () => {
      const ranked = rankNemeses(stats, 10)
      const scores = ranked.map((r) => r.nemesisScore)
      expect([...scores].sort((a, b) => b - a)).toEqual(scores)
      const ids = new Set(stats.map((s) => s.cardId))
      for (const r of ranked) expect(ids.has(r.cardId)).toBe(true)
    })

    it(`seed ${seed}: tier counts cover every card`, () => {
      const b = tierBreakdown(stats)
      expect(b.new + b.shaky + b.learning + b.steady + b.mastered).toBe(stats.length)
    })

    it(`seed ${seed}: analysis does not mutate its input`, () => {
      const copy = JSON.parse(JSON.stringify(logs))
      analyzeCardPerformance(logs)
      buildCardTimeline(logs, 1)
      expect(logs).toEqual(copy)
    })
  }
})

import { describe, expect, it } from 'vitest'
import { buildCardTimeline, speedTrendOf, type NemesisGradeEntry } from '../src/arena'

const E = (cardId: number, grade: number, confidence = 0, timeMs = 3000): NemesisGradeEntry => ({
  cardId,
  grade,
  confidence,
  timeMs,
})

describe('speedTrendOf', () => {
  it('needs at least 4 samples', () => {
    expect(speedTrendOf([1000, 900, 800])).toBe('unknown')
  })
  it('detects faster, slower and steady with a 15% dead band', () => {
    expect(speedTrendOf([4000, 4000, 2000, 2000])).toBe('faster')
    expect(speedTrendOf([2000, 2000, 4000, 4000])).toBe('slower')
    expect(speedTrendOf([3000, 3000, 3200, 3200])).toBe('steady')
  })
  it('is unknown when the early average is zero', () => {
    expect(speedTrendOf([0, 0, 1000, 1000])).toBe('unknown')
  })
})

describe('buildCardTimeline', () => {
  const logs = [
    [E(1, 1, 1, 5000), E(2, 3)],
    [E(1, 2, 0, 4000)],
    [E(2, 4), E(1, 3, 0, 2500), E(1, 3, 0, 2000)],
  ]

  it('collects only the requested card across runs, in order', () => {
    const t = buildCardTimeline(logs, 1)
    expect(t.attempts.map((a) => a.grade)).toEqual([1, 2, 3, 3])
    expect(t.attempts.map((a) => a.run)).toEqual([1, 2, 3, 3])
    expect(t.attempts.map((a) => a.attempt)).toEqual([1, 2, 3, 4])
    expect(t.runsSeen).toBe(3)
  })

  it('flags correctness and overconfidence per attempt', () => {
    const t = buildCardTimeline(logs, 1)
    expect(t.attempts[0]).toMatchObject({ correct: false, overconfident: true })
    expect(t.attempts[1]).toMatchObject({ correct: false, overconfident: false })
    expect(t.attempts[2]).toMatchObject({ correct: true, overconfident: false })
  })

  it('computes speed extremes, trend and best streak', () => {
    const t = buildCardTimeline(logs, 1)
    expect(t.fastestMs).toBe(2000)
    expect(t.slowestMs).toBe(5000)
    expect(t.speedTrend).toBe('faster')
    expect(t.bestCorrectStreak).toBe(2)
  })

  it('agrees with the nemesis stats for the same card', () => {
    const t = buildCardTimeline(logs, 1)
    expect(t.stats?.attempts).toBe(t.attempts.length)
    expect(t.stats?.misses).toBe(2)
  })

  it('returns an empty timeline for an unseen card', () => {
    const t = buildCardTimeline(logs, 99)
    expect(t.attempts).toEqual([])
    expect(t.stats).toBeNull()
    expect(t.fastestMs).toBeNull()
    expect(t.runsSeen).toBe(0)
    expect(t.speedTrend).toBe('unknown')
  })

  it('ignores invalid grades', () => {
    const t = buildCardTimeline([[E(1, 0), E(1, 5), E(1, 3)]], 1)
    expect(t.attempts).toHaveLength(1)
  })
})

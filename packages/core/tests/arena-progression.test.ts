import { describe, expect, it } from 'vitest'
import {
  PRACTICE_RANKS,
  buildActivityHeatmap,
  practiceRank,
  runPracticePoints,
  type ProgressionRun,
} from '../src/arena'

const run = (over: Partial<ProgressionRun> = {}): ProgressionRun => ({
  createdAt: '2026-11-25T10:00:00.000Z',
  result: 'victory',
  rounds: 10,
  correct: 8,
  boss: false,
  ...over,
})

describe('runPracticePoints', () => {
  it('pays correct answers plus a win bonus', () => {
    expect(runPracticePoints(run())).toBe(18)
  })
  it('a defeat still pays its correct answers', () => {
    expect(runPracticePoints(run({ result: 'defeat', correct: 5 }))).toBe(5)
  })
  it('adds the boss bonus only on a boss victory', () => {
    expect(runPracticePoints(run({ boss: true }))).toBe(33)
    expect(runPracticePoints(run({ boss: true, result: 'defeat' }))).toBe(8)
  })
  it('never goes negative', () => {
    expect(runPracticePoints(run({ correct: -4, result: 'defeat' }))).toBe(0)
  })
  it('is independent of combat score fields', () => {
    expect(runPracticePoints({ ...run(), score: 99999 } as ProgressionRun)).toBe(18)
  })
})

describe('practiceRank', () => {
  it('starts as Initiate with no runs', () => {
    const r = practiceRank([])
    expect(r.tier.key).toBe('initiate')
    expect(r.points).toBe(0)
    expect(r.next?.key).toBe('squire')
    expect(r.progressPct).toBe(0)
  })
  it('crosses a tier boundary exactly at its minimum', () => {
    const at = practiceRank([run({ correct: 50 })]) // 60
    expect(at.points).toBe(60)
    expect(at.tier.key).toBe('squire')
    const below = practiceRank([run({ correct: 49 })]) // 59
    expect(below.tier.key).toBe('initiate')
  })
  it('reports progress inside a tier', () => {
    const r = practiceRank([run({ correct: 80, result: 'defeat' })]) // 80 => squire (60..200)
    expect(r.tier.key).toBe('squire')
    expect(r.intoTier).toBe(20)
    expect(r.tierSpan).toBe(140)
    expect(r.progressPct).toBe(14)
  })
  it('tops out at the last tier with 100%', () => {
    const r = practiceRank([run({ correct: 5000, result: 'defeat' })])
    expect(r.tier.key).toBe(PRACTICE_RANKS[PRACTICE_RANKS.length - 1]!.key)
    expect(r.next).toBeNull()
    expect(r.progressPct).toBe(100)
  })
  it('ladder minimums strictly increase', () => {
    for (let i = 1; i < PRACTICE_RANKS.length; i++) {
      expect(PRACTICE_RANKS[i]!.min).toBeGreaterThan(PRACTICE_RANKS[i - 1]!.min)
    }
  })
})

describe('buildActivityHeatmap', () => {
  const now = new Date('2026-11-25T12:00:00.000Z')
  const at = (d: string) => ({ createdAt: `${d}T09:00:00.000Z` })

  it('returns span days oldest first ending today', () => {
    const h = buildActivityHeatmap([], now, 7)
    expect(h.days).toHaveLength(7)
    expect(h.days[0]!.date).toBe('2026-11-19')
    expect(h.days[6]!.date).toBe('2026-11-25')
    expect(h.totalRuns).toBe(0)
    expect(h.busiestDay).toBeNull()
  })
  it('counts runs per day and buckets levels against the busiest day', () => {
    const runs = [
      at('2026-11-25'),
      at('2026-11-25'),
      at('2026-11-25'),
      at('2026-11-25'),
      at('2026-11-24'),
      at('2026-11-23'),
      at('2026-11-23'),
    ]
    const h = buildActivityHeatmap(runs, now, 7)
    const byDate = Object.fromEntries(h.days.map((d) => [d.date, d]))
    expect(byDate['2026-11-25']!.runs).toBe(4)
    expect(byDate['2026-11-25']!.level).toBe(4)
    expect(byDate['2026-11-23']!.level).toBe(2)
    expect(byDate['2026-11-24']!.level).toBe(1)
    expect(h.busiestDay).toEqual({ date: '2026-11-25', runs: 4 })
  })
  it('current streak includes today when played', () => {
    const h = buildActivityHeatmap([at('2026-11-25'), at('2026-11-24'), at('2026-11-23')], now, 14)
    expect(h.currentStreak).toBe(3)
  })
  it('streak stays alive through yesterday when today is empty', () => {
    const h = buildActivityHeatmap([at('2026-11-24'), at('2026-11-23')], now, 14)
    expect(h.currentStreak).toBe(2)
  })
  it('streak is 0 when a full day was skipped', () => {
    const h = buildActivityHeatmap([at('2026-11-23')], now, 14)
    expect(h.currentStreak).toBe(0)
  })
  it('longest streak spans gaps correctly', () => {
    const runs = [at('2026-11-10'), at('2026-11-11'), at('2026-11-12'), at('2026-11-20')]
    const h = buildActivityHeatmap(runs, now, 30)
    expect(h.longestStreak).toBe(3)
    expect(h.activeDays).toBe(4)
  })
  it('ignores runs outside the window and invalid dates', () => {
    const h = buildActivityHeatmap([at('2026-01-01'), { createdAt: 'nope' }], now, 7)
    expect(h.totalRuns).toBe(0)
  })
  it('clamps absurd spans', () => {
    expect(buildActivityHeatmap([], now, 100000).days).toHaveLength(366)
    expect(buildActivityHeatmap([], now, 0).days).toHaveLength(1)
  })
})

import { DEFAULT_MS_PER_CARD, estimateRunMinutes, paceStats } from '../src/arena'

describe('paceStats', () => {
  it('has no sample for empty or untimed runs', () => {
    expect(paceStats([])).toEqual({ sampleRuns: 0, medianMsPerCard: null })
    expect(
      paceStats([
        { rounds: 0, durationMs: 5000 },
        { rounds: 5, durationMs: 0 },
      ]),
    ).toEqual({
      sampleRuns: 0,
      medianMsPerCard: null,
    })
  })
  it('uses the median, so one outlier does not skew it', () => {
    const runs = [
      { rounds: 10, durationMs: 80_000 },
      { rounds: 10, durationMs: 90_000 },
      { rounds: 10, durationMs: 900_000 },
    ]
    expect(paceStats(runs).medianMsPerCard).toBe(9000)
  })
  it('averages the two middle values for an even sample', () => {
    const runs = [
      { rounds: 10, durationMs: 60_000 },
      { rounds: 10, durationMs: 100_000 },
    ]
    expect(paceStats(runs).medianMsPerCard).toBe(8000)
  })
  it('only considers the most recent runs', () => {
    const old = Array.from({ length: 5 }, () => ({ rounds: 10, durationMs: 500_000 }))
    const recent = Array.from({ length: 3 }, () => ({ rounds: 10, durationMs: 50_000 }))
    expect(paceStats([...old, ...recent], 3).medianMsPerCard).toBe(5000)
  })
})

describe('estimateRunMinutes', () => {
  const none = { sampleRuns: 0, medianMsPerCard: null }
  it('falls back to the default pace', () => {
    const e = estimateRunMinutes(10, none, 15)
    expect(e.personal).toBe(false)
    expect(e.minutes).toBe(Math.round((10 * DEFAULT_MS_PER_CARD) / 60_000))
  })
  it('uses the personal pace when known', () => {
    const e = estimateRunMinutes(20, { sampleRuns: 4, medianMsPerCard: 6000 }, 15)
    expect(e.personal).toBe(true)
    expect(e.minutes).toBe(2)
  })
  it('never reports less than one minute', () => {
    expect(estimateRunMinutes(1, { sampleRuns: 1, medianMsPerCard: 1000 }, 15).minutes).toBe(1)
  })
  it('flags boss-length runs at the threshold', () => {
    expect(estimateRunMinutes(14, none, 15).boss).toBe(false)
    expect(estimateRunMinutes(15, none, 15).boss).toBe(true)
  })
  it('clamps negative counts to zero cards', () => {
    expect(estimateRunMinutes(-3, none, 15).cards).toBe(0)
  })
})

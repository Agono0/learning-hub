import { describe, expect, it } from 'vitest'
import {
  CAFFEINE_CUTOFF_HOURS_BEFORE_BED,
  EXERCISE_OPTIMAL_HOURS_AFTER,
  caffeineCutoffAdvice,
  exerciseNudge,
  sleepVsRetention,
  yerkesDodsonZone,
} from '../src/physio'

describe('sleepVsRetention', () => {
  it('reports the drop when short-sleep days retain less by >3pp', () => {
    const days = [
      { sleepHours: 5, correctRate: 0.7 },
      { sleepHours: 5.5, correctRate: 0.72 },
      { sleepHours: 8, correctRate: 0.85 },
      { sleepHours: 7, correctRate: 0.87 },
    ]
    const r = sleepVsRetention(days)
    expect(r.nShort).toBe(2)
    expect(r.nRest).toBe(2)
    expect(r.deltaPct).not.toBeNull()
    expect(r.deltaPct).toBeGreaterThan(3)
    expect(r.insight).toMatch(/retention drops/)
    expect(r.insight).toMatch(/<6h-sleep days/)
    expect(r.insight).toMatch(/1[45]/) // 15 percentage points
  })

  it('stays neutral when the gap is small', () => {
    const days = [
      { sleepHours: 5, correctRate: 0.8 },
      { sleepHours: 5.5, correctRate: 0.82 },
      { sleepHours: 8, correctRate: 0.82 },
      { sleepHours: 7, correctRate: 0.8 },
    ]
    const r = sleepVsRetention(days)
    expect(Math.abs(r.deltaPct ?? 0)).toBeLessThanOrEqual(3)
    expect(r.insight).toMatch(/No meaningful sleep effect/)
  })

  it('refuses to overclaim on tiny samples', () => {
    const r = sleepVsRetention([
      { sleepHours: 5, correctRate: 0.1 },
      { sleepHours: 8, correctRate: 0.9 },
    ])
    expect(r.nShort).toBe(1)
    expect(r.insight).toMatch(/Not enough data/)
  })

  it('handles empty input', () => {
    const r = sleepVsRetention([])
    expect(r.shortSleepMean).toBeNull()
    expect(r.restMean).toBeNull()
    expect(r.deltaPct).toBeNull()
    expect(r.insight).toMatch(/Not enough data/)
  })
})

describe('exerciseNudge', () => {
  it('suggests the T+4h window when nothing is logged', () => {
    expect(exerciseNudge(null)).toMatch(/4 hours after learning/)
    expect(exerciseNudge(undefined)).toMatch(/van Dongen/)
    expect(EXERCISE_OPTIMAL_HOURS_AFTER).toBe(4)
  })
  it('confirms the optimal window (3-5h)', () => {
    expect(exerciseNudge(4)).toMatch(/Perfect timing/)
    expect(exerciseNudge(3.5)).toMatch(/Perfect timing/)
  })
  it('nudges later when too early, earlier when too late', () => {
    expect(exerciseNudge(0.5)).toMatch(/landed early/)
    expect(exerciseNudge(9)).toMatch(/landed late/)
  })
})

describe('caffeineCutoffAdvice', () => {
  it('applies the 8h-before-bed rule with wrap-around', () => {
    expect(CAFFEINE_CUTOFF_HOURS_BEFORE_BED).toBe(8)
    expect(caffeineCutoffAdvice(23).cutoffHour).toBe(15)
    expect(caffeineCutoffAdvice(7).cutoffHour).toBe(23)
    expect(caffeineCutoffAdvice(3).cutoffHour).toBe(19)
    expect(caffeineCutoffAdvice(8).cutoffHour).toBe(0)
    expect(caffeineCutoffAdvice(23).advice).toMatch(/15:00/)
  })
  it('rejects invalid bedtimes', () => {
    expect(() => caffeineCutoffAdvice(24)).toThrow(RangeError)
    expect(() => caffeineCutoffAdvice(-1)).toThrow(RangeError)
    expect(() => caffeineCutoffAdvice(7.5)).toThrow(RangeError)
  })
})

describe('yerkesDodsonZone', () => {
  it('hard tasks need calm arousal (low band)', () => {
    expect(yerkesDodsonZone(4, 'hard').zone).toBe('optimal')
    expect(yerkesDodsonZone(9, 'hard').zone).toBe('overstimulated')
    expect(yerkesDodsonZone(1, 'hard').zone).toBe('understimulated')
  })
  it('easy tasks tolerate high arousal', () => {
    expect(yerkesDodsonZone(8, 'easy').zone).toBe('optimal')
    expect(yerkesDodsonZone(2, 'easy').zone).toBe('understimulated')
  })
  it('moderate tasks sit in the middle band', () => {
    expect(yerkesDodsonZone(6, 'moderate').zone).toBe('optimal')
    expect(yerkesDodsonZone(3, 'moderate').zone).toBe('understimulated')
    expect(yerkesDodsonZone(9, 'moderate').zone).toBe('overstimulated')
  })
  it('every zone comes with actionable advice', () => {
    for (const d of ['easy', 'moderate', 'hard'] as const) {
      for (const a of [2, 6, 10]) {
        const r = yerkesDodsonZone(a, d)
        expect(['understimulated', 'optimal', 'overstimulated']).toContain(r.zone)
        expect(r.advice.length).toBeGreaterThan(10)
      }
    }
  })
  it('rejects out-of-range arousal', () => {
    expect(() => yerkesDodsonZone(0, 'easy')).toThrow(RangeError)
    expect(() => yerkesDodsonZone(11, 'easy')).toThrow(RangeError)
  })
})

import { describe, expect, it } from 'vitest'
import {
  heatmapWeeks,
  rankCaption,
  type ProgressPayload,
} from '../src/components/arena/ArenaProgressPanel'

const rank = (over: Partial<ProgressPayload['rank']> = {}): ProgressPayload['rank'] => ({
  points: 80,
  tier: { key: 'squire', name: 'Squire', min: 60 },
  next: { key: 'knight', name: 'Knight', min: 200 },
  intoTier: 20,
  tierSpan: 140,
  progressPct: 14,
  ...over,
})

describe('rankCaption', () => {
  it('states points left to the next tier', () => {
    expect(rankCaption(rank())).toBe('80 practice points. 120 more to Knight.')
  })
  it('says so at the top of the ladder', () => {
    expect(rankCaption(rank({ next: null, points: 5000 }))).toBe(
      '5000 practice points. Top of the ladder.',
    )
  })
})

describe('heatmapWeeks', () => {
  const day = (date: string) => ({ date, runs: 0, level: 0 as const })
  it('returns nothing for no days', () => {
    expect(heatmapWeeks([])).toEqual([])
  })
  it('pads so the first column starts Monday', () => {
    // 2026-11-25 is a Wednesday: two leading blanks (Mon, Tue).
    const weeks = heatmapWeeks([day('2026-11-25'), day('2026-11-26')])
    expect(weeks).toHaveLength(1)
    expect(weeks[0]!.slice(0, 3)).toEqual([null, null, day('2026-11-25')])
  })
  it('does not pad a Monday start', () => {
    const weeks = heatmapWeeks([day('2026-11-23')])
    expect(weeks[0]![0]).toEqual(day('2026-11-23'))
  })
  it('chunks into weeks of 7', () => {
    const days = Array.from({ length: 14 }, (_, i) =>
      day(`2026-11-${String(23 + i > 30 ? 23 + i - 30 : 23 + i).padStart(2, '0')}`),
    )
    const weeks = heatmapWeeks(days)
    expect(weeks.every((w) => w.length <= 7)).toBe(true)
    expect(weeks.flat().filter(Boolean)).toHaveLength(14)
  })
})

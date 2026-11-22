/**
 * Core tests for the metrics domain (S3-30 + S3-89): per-day record
 * folding, aggregates (total/active/streaks over sparse calendar series),
 * line-chart geometry, and the Monday-aligned activity heatmap grid.
 */
import { describe, expect, it } from 'vitest'
import {
  aggregateMetricDays,
  buildActivityHeatmap,
  buildLinePoints,
  HEATMAP_LEVELS,
  metricDaysFromSessions,
  type MetricDay,
} from '../src/metrics'

const TODAY = '2026-11-22' // a Sunday
const day = (offset: number): string => {
  const d = new Date(Date.UTC(2026, 10, 22 + offset))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

describe('metricDaysFromSessions', () => {
  it('folds session rows into per-day sums, sorted ascending', () => {
    const days = metricDaysFromSessions([
      { day: '2026-11-22', sessionMs: 10 },
      { day: '2026-11-21', sessionMs: 5 },
      { day: '2026-11-22', sessionMs: 7 },
    ])
    expect(days).toEqual([
      { day: '2026-11-21', value: 5 },
      { day: '2026-11-22', value: 17 },
    ])
  })

  it('is total: negative values clamp, timestamp days truncate', () => {
    const days = metricDaysFromSessions([
      { day: '2026-11-22T09:00:00Z', sessionMs: 4 },
      { day: '2026-11-22', sessionMs: -50 },
    ])
    expect(days).toEqual([{ day: '2026-11-22', value: 4 }])
  })
})

describe('aggregateMetricDays', () => {
  it('totals, counts active days, averages per active day, finds the max', () => {
    const agg = aggregateMetricDays([
      { day: '2026-11-20', value: 30 },
      { day: '2026-11-21', value: 0 },
      { day: '2026-11-22', value: 50 },
      { day: '2026-11-23', value: 20 },
    ])
    expect(agg.total).toBe(100)
    expect(agg.activeDays).toBe(3)
    expect(agg.avgPerActiveDay).toBeCloseTo(100 / 3)
    expect(agg.maxDay).toEqual({ day: '2026-11-22', value: 50 })
  })

  it('streaks walk calendar days — gaps break, sparse series stay honest', () => {
    // Active: 20th, 21st, 22nd (gap 23rd) + 25th, 26th, 27th, 28th.
    const days: MetricDay[] = [
      { day: day(-2), value: 1 }, // 2026-11-20
      { day: day(-1), value: 1 }, // 11-21
      { day: day(0), value: 1 }, // 11-22
      { day: day(2), value: 1 }, // 11-24? — see below
      { day: day(3), value: 1 },
      { day: day(4), value: 1 },
      { day: day(5), value: 1 },
    ]
    const agg = aggregateMetricDays(days)
    expect(agg.longestStreak).toBe(4)
    expect(agg.currentStreak).toBe(4) // run ending at the LAST active day
  })

  it('empty and all-zero series produce honest zeros (maxDay null)', () => {
    expect(aggregateMetricDays([]).maxDay).toBeNull()
    const zero = aggregateMetricDays([{ day: '2026-11-22', value: 0 }])
    expect(zero.activeDays).toBe(0)
    expect(zero.maxDay).toBeNull()
    expect(zero.currentStreak).toBe(0)
    expect(zero.longestStreak).toBe(0)
  })
})

describe('buildLinePoints (hand-rolled SVG geometry)', () => {
  it('spreads points across the padded viewBox, baseline at the bottom', () => {
    const points = buildLinePoints(
      [
        { day: '2026-11-20', value: 0 },
        { day: '2026-11-21', value: 50 },
        { day: '2026-11-22', value: 100 },
      ],
      { width: 320, height: 128, padX: 8, padY: 8 },
    )
    expect(points).toHaveLength(3)
    expect(points[0].x).toBeCloseTo(8)
    expect(points[2].x).toBeCloseTo(312)
    expect(points[2].y).toBeCloseTo(8) // max value at the top pad
    expect(points[0].y).toBeCloseTo(120) // zero on the baseline
    expect(points[1].y).toBeCloseTo(64) // midpoint
  })

  it('an all-zero series sits on the baseline; empty series are empty', () => {
    const flat = buildLinePoints(
      [
        { day: '2026-11-20', value: 0 },
        { day: '2026-11-22', value: 0 },
      ],
      { width: 100, height: 100 },
    )
    expect(flat.every((p) => p.y === 92)).toBe(true)
    expect(buildLinePoints([], { width: 100, height: 100 })).toEqual([])
  })

  it('a single point centers via span guard (no divide by zero)', () => {
    const single = buildLinePoints([{ day: '2026-11-22', value: 10 }], {
      width: 100,
      height: 100,
    })
    expect(single[0].x).toBeCloseTo(8)
    expect(single[0].y).toBeCloseTo(8)
  })
})

describe('buildActivityHeatmap (S3-89)', () => {
  it('ends at today, Monday-aligned, no future cells', () => {
    const heat = buildActivityHeatmap([], 3, TODAY)
    // 2026-11-22 is a Sunday → its week's column ends at row 6.
    const last = heat.cells[heat.cells.length - 1]
    expect(last.day).toBe(TODAY)
    expect(last.row).toBe(6)
    expect(heat.columns).toBe(3)
    // First cell = Monday 3 weeks back: 2026-11-02, row 0.
    expect(heat.cells[0].day).toBe('2026-11-02')
    expect(heat.cells[0].row).toBe(0)
    // No cell beyond today.
    expect(heat.cells.every((c) => c.day <= TODAY)).toBe(true)
  })

  it('levels are quartiles of the window max (0..4)', () => {
    const heat = buildActivityHeatmap(
      [
        { day: TODAY, value: 100 },
        { day: day(-1), value: 60 },
        { day: day(-2), value: 30 },
        { day: day(-3), value: 10 },
        { day: day(-4), value: 0 },
      ],
      2,
      TODAY,
    )
    const byDay = new Map(heat.cells.map((c) => [c.day, c.level]))
    expect(byDay.get(TODAY)).toBe(4)
    expect(byDay.get(day(-1))).toBe(3)
    expect(byDay.get(day(-2))).toBe(2)
    expect(byDay.get(day(-3))).toBe(1)
    expect(byDay.get(day(-4))).toBe(0)
    expect(heat.max).toBe(100)
  })

  it('values outside the window are ignored; grid size = weeks × 7 bounded by today', () => {
    const heat = buildActivityHeatmap(
      [
        { day: '2026-09-01', value: 500 },
        { day: TODAY, value: 1 },
      ],
      2,
      TODAY,
    )
    expect(heat.cells.some((c) => c.day === '2026-09-01')).toBe(false)
    expect(heat.max).toBe(1)
    expect(heat.cells.length).toBe(2 * 7 - 0) // Monday-aligned full weeks ending Sunday(today)
  })

  it('HEATMAP_LEVELS matches the documented 0..4 scale', () => {
    expect(HEATMAP_LEVELS).toBe(4)
  })
})

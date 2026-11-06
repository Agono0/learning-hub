import { describe, expect, it } from 'vitest'
import { computeLearningInsights, pearson } from '../src/insights'
import type { DailyMetric } from '../src/insights'

function series(values: Array<number | null>): DailyMetric[] {
  return values.map((value, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, value }))
}

describe('learning insights (pure correlation math)', () => {
  it('pearson returns ~1 for a perfect positive line', () => {
    const { r, n } = pearson([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])
    expect(r).toBeCloseTo(1, 6)
    expect(n).toBe(5)
  })

  it('pearson returns ~-1 for a perfect inverse line', () => {
    const { r } = pearson([1, 2, 3, 4], [8, 6, 4, 2])
    expect(r).toBeCloseTo(-1, 6)
  })

  it('pairs only non-null samples and reports n', () => {
    const { r, n } = pearson([1, null, 3, 4], [2, 5, 6, 8])
    expect(n).toBe(3)
    expect(r).not.toBeNull()
  })

  it('refuses tiny samples and zero variance', () => {
    expect(pearson([1, 2], [1, 2]).r).toBeNull()
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4]).r).toBeNull()
  })

  it('detects a strong sleep→retention link in synthetic data', () => {
    // 12 days: more sleep -> higher retention
    const sleep = series([5, 6, 7, 8, 5.5, 6.5, 7.5, 8.5, 6, 7, 8, 9])
    const retention = series([0.6, 0.68, 0.75, 0.82, 0.62, 0.7, 0.78, 0.85, 0.65, 0.76, 0.83, 0.88])
    const report = computeLearningInsights({
      sleep,
      sleepQuality: series(new Array(12).fill(null)),
      exercise: series(new Array(12).fill(null)),
      mood: series(new Array(12).fill(null)),
      focusMinutes: series(new Array(12).fill(null)),
      reviews: series(new Array(12).fill(null)),
      retention,
    })
    const sleepInsight = report.insights.find((i) => i.id === 'sleep-retention')!
    expect(sleepInsight.r).toBeGreaterThan(0.9)
    expect(sleepInsight.direction).toBe('positive')
    expect(sleepInsight.statement).toContain('strong positive')
    expect(report.daysWithRetention).toBe(12)
  })

  it('labels small samples honestly', () => {
    const report = computeLearningInsights({
      sleep: series([7, 8, 9, null, null, null, null, null, null, null, null, null]),
      sleepQuality: series(new Array(12).fill(null)),
      exercise: series(new Array(12).fill(null)),
      mood: series(new Array(12).fill(null)),
      focusMinutes: series(new Array(12).fill(null)),
      reviews: series(new Array(12).fill(null)),
      retention: series([0.7, 0.8, 0.9, null, null, null, null, null, null, null, null, null]),
    })
    const insight = report.insights.find((i) => i.id === 'sleep-retention')!
    expect(insight.n).toBe(3)
    expect(insight.caveat).toContain('Only 3 days')
  })
})

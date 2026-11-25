import { describe, expect, it } from 'vitest'
import { DEFAULT_REVIEW_SECONDS, estimatePassMix, estimateTiming } from '../src/retention-planner'
import { makeReviews } from './retention-planner-fixtures'

describe('estimateTiming', () => {
  it('uses the default when there is too little usable data', () => {
    const t = estimateTiming(makeReviews(10))
    expect(t.source).toBe('default')
    expect(t.secondsOverall).toBe(DEFAULT_REVIEW_SECONDS)
    expect(t.note).toMatch(/default/)
  })
  it('drops zero, tiny and idle values and reports coverage', () => {
    const t = estimateTiming(
      makeReviews(300, (i) => (i % 3 === 0 ? 0 : i % 7 === 0 ? 900_000 : 5000 + i)),
    )
    expect(t.usable).toBeLessThan(t.considered)
    expect(t.coverage).toBeGreaterThan(0)
    expect(t.coverage).toBeLessThan(1)
    expect(t.secondsOverall).toBeLessThan(30)
  })
  it('treats one repeated value as imported and falls back', () => {
    const t = estimateTiming(makeReviews(300, () => 5000))
    expect(t.source).toBe('default')
    expect(t.note).toMatch(/identical/)
  })
  it('uses per-rating medians when each rating has enough rows', () => {
    const t = estimateTiming(makeReviews(600, (i) => 3000 + ((i * 97) % 6000)))
    expect(['per-rating-median', 'overall-median']).toContain(t.source)
    expect(t.secondsByRating.every((s) => s > 0)).toBe(true)
  })
  it('only the newest 2000 reviews are considered', () => {
    expect(estimateTiming(makeReviews(2500)).considered).toBe(2000)
  })
})

describe('estimatePassMix', () => {
  it('falls back to a labeled default on thin history', () => {
    expect(estimatePassMix(makeReviews(10)).source).toBe('default')
  })
  it('sums to one and ignores failures', () => {
    const m = estimatePassMix(makeReviews(500))
    expect(m.source).toBe('history')
    expect(m.hard + m.good + m.easy).toBeCloseTo(1, 6)
  })
})

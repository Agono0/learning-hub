/**
 * Simple counters core (S3-31 core / S3-90): streak durations over per-day
 * logs — the SP rules (today-untapped doesn't break the streak yet; best
 * run anywhere in history; zero-count days don't extend).
 */
import { describe, expect, it } from 'vitest'
import { counterStreak, counterTotal, counterTotalTaps } from '../src/tasks/counters'

const TODAY = '2026-11-22'
const day = (offset: number, count = 1): { day: string; count: number } => ({
  day: new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10),
  count,
})

describe('counterStreak', () => {
  it('counts a run ending today', () => {
    expect(counterStreak([day(0), day(-1), day(-2)], TODAY)).toEqual({
      current: 3,
      best: 3,
      totalDays: 3,
    })
  })

  it("an untapped today doesn't break the streak yet (day still open)", () => {
    expect(counterStreak([day(-1), day(-2), day(-3)], TODAY)).toEqual({
      current: 3,
      best: 3,
      totalDays: 3,
    })
  })

  it('an untapped yesterday DOES break it (run can no longer continue)', () => {
    expect(counterStreak([day(0), day(-2), day(-3)], TODAY)).toEqual({
      current: 1,
      best: 2,
      totalDays: 3,
    })
  })

  it('finds the best run anywhere in history', () => {
    const logs = [day(-30, 1), day(-29, 1), day(-28, 1), day(-27, 1), day(-1, 1)]
    expect(counterStreak(logs, TODAY)).toEqual({ current: 1, best: 4, totalDays: 5 })
  })

  it('zero-count days do not extend a streak', () => {
    expect(counterStreak([day(0, 1), day(-1, 0), day(-2, 1)], TODAY)).toEqual({
      current: 1,
      best: 1,
      totalDays: 2,
    })
  })

  it('tolerates duplicate days by summing (storage guarantees uniqueness anyway)', () => {
    expect(counterStreak([day(0, 1), day(0, 2)], TODAY).totalDays).toBe(1)
  })

  it('an empty log is all zeros', () => {
    expect(counterStreak([], TODAY)).toEqual({ current: 0, best: 0, totalDays: 0 })
  })
})

describe('counterTotal', () => {
  it('sums every tap', () => {
    expect(counterTotal([day(0, 3), day(-1, 2)])).toBe(5)
    expect(counterTotalTaps([day(0, 3), day(-1, 2)])).toBe(5)
  })
})

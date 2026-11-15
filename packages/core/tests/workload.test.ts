import { describe, expect, it } from 'vitest'
import {
  balanceWorkload,
  catchUpBacklog,
  forecastWorkload,
  type WorkloadCardItem,
} from '../src/workload'

describe('Workload Balancer Domain', () => {
  const asOf = new Date('2026-11-08T00:00:00.000Z') // Sunday

  const mockCards: WorkloadCardItem[] = [
    { id: 1, due: '2026-11-08T10:00:00.000Z', stability: 20, intervalDays: 14, state: 2 },
    { id: 2, due: '2026-11-08T12:00:00.000Z', stability: 30, intervalDays: 20, state: 2 },
    { id: 3, due: '2026-11-09T08:00:00.000Z', stability: 10, intervalDays: 7, state: 2 },
    { id: 4, due: '2026-11-10T08:00:00.000Z', stability: 5, intervalDays: 3, state: 2 },
    { id: 5, due: '2026-11-08T14:00:00.000Z', stability: 1, intervalDays: 1, state: 1 }, // Short interval (should not shift)
  ]

  it('forecastWorkload correctly groups cards by day for 30 days', () => {
    const forecast = forecastWorkload(mockCards, 7, asOf)
    expect(forecast.length).toBe(7)
    // 3 cards due on 2026-11-08
    expect(forecast[0]!.count).toBe(3)
    // 1 card due on 2026-11-09
    expect(forecast[1]!.count).toBe(1)
    // 1 card due on 2026-11-10
    expect(forecast[2]!.count).toBe(1)
  })

  it('balanceWorkload respects easyDays and bounded shifts', () => {
    // Make Sunday (0) an easy day
    const result = balanceWorkload(mockCards, {
      easyDays: [0],
      days: 7,
      asOf,
    })

    // Cards with interval >= 3 due on Sunday should shift away from Sunday (day 0)
    const shiftedFromSunday = result.shifts.filter((s) => s.originalDue.startsWith('2026-11-08'))
    expect(shiftedFromSunday.length).toBeGreaterThanOrEqual(1)

    for (const shift of shiftedFromSunday) {
      // Shift must be bounded by +/- 2 days
      expect(Math.abs(shift.shiftDays)).toBeLessThanOrEqual(2)
      // New due day must not be Sunday
      const newDate = new Date(shift.newDue)
      expect(newDate.getDay()).not.toBe(0)
    }

    // Short interval card (interval = 1 day) must never be shifted
    expect(result.shifts.some((s) => s.cardId === 5)).toBe(false)
  })

  it('catchUpBacklog spreads backlog over dailyCap chunks prioritising lowest stability first', () => {
    const overdue: WorkloadCardItem[] = [
      { id: 10, due: '2026-11-01T00:00:00.000Z', stability: 50, intervalDays: 30, state: 2 },
      { id: 11, due: '2026-11-01T00:00:00.000Z', stability: 2, intervalDays: 2, state: 2 }, // Fragile memory!
      { id: 12, due: '2026-11-01T00:00:00.000Z', stability: 15, intervalDays: 10, state: 2 },
      { id: 13, due: '2026-11-01T00:00:00.000Z', stability: 4, intervalDays: 3, state: 2 },
    ]

    const shifts = catchUpBacklog(overdue, 2, asOf) // cap 2 cards per day
    expect(shifts.length).toBe(4)

    // First card scheduled today (dayIndex 0) should be card 11 (lowest stability: 2)
    expect(shifts[0]!.cardId).toBe(11)
    expect(shifts[0]!.shiftDays).toBe(0)

    // Second card scheduled today should be card 13 (stability: 4)
    expect(shifts[1]!.cardId).toBe(13)
    expect(shifts[1]!.shiftDays).toBe(0)

    // Third card should be bumped to tomorrow (shiftDays 1)
    expect(shifts[2]!.cardId).toBe(12)
    expect(shifts[2]!.shiftDays).toBe(1)
  })
})

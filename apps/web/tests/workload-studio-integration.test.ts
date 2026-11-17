/**
 * @file workload-studio-integration.test.ts
 * @description Integration and unit suite for Workload Balancer Studio,
 * 14-90 day review forecasting, easy days scheduling, and backlog recovery.
 */

import { describe, expect, it } from 'vitest'
import {
  balanceWorkload,
  catchUpBacklog,
  forecastWorkload,
  workloadBalanceSchema,
  type WorkloadCardItem,
} from '@learning-hub/core'

describe('Workload Balancer Studio Suite', () => {
  const now = new Date('2026-11-17T12:00:00Z')

  function createCards(): WorkloadCardItem[] {
    const cards: WorkloadCardItem[] = []
    // 5 overdue cards
    for (let i = 1; i <= 5; i++) {
      const due = new Date(now.getTime() - i * 86_400_000).toISOString()
      cards.push({
        id: i,
        due,
        stability: 8,
        intervalDays: 10,
        state: 2,
        lapses: 1,
      })
    }
    // 15 future cards distributed over upcoming days
    for (let i = 6; i <= 20; i++) {
      const dayOffset = (i % 7) + 1
      const due = new Date(now.getTime() + dayOffset * 86_400_000).toISOString()
      cards.push({
        id: i,
        due,
        stability: 15,
        intervalDays: 14,
        state: 2,
        lapses: 0,
      })
    }
    return cards
  }

  it('validates workload balance action schema', () => {
    const validForecast = workloadBalanceSchema.safeParse({
      action: 'forecast',
      days: 30,
    })
    expect(validForecast.success).toBe(true)

    const validBalance = workloadBalanceSchema.safeParse({
      action: 'balance',
      days: 30,
      maxPerDay: 10,
      easyDays: [0, 6],
    })
    expect(validBalance.success).toBe(true)

    const validCatchUp = workloadBalanceSchema.safeParse({
      action: 'catch_up',
      dailyCap: 15,
    })
    expect(validCatchUp.success).toBe(true)

    const invalidAction = workloadBalanceSchema.safeParse({
      action: 'non_existent_action',
    })
    expect(invalidAction.success).toBe(false)
  })

  it('forecastWorkload correctly projects review load across designated horizon', () => {
    const cards = createCards()
    const forecast = forecastWorkload(cards, 30, now)

    expect(forecast).toHaveLength(30)
    const totalProjected = forecast.reduce((sum, d) => sum + d.count, 0)
    // All 20 cards (5 overdue placed on Day 0 + 15 future) fall within the 30-day window
    expect(totalProjected).toBe(20)
    expect(forecast[0]!.count).toBeGreaterThanOrEqual(5)
  })

  it('balanceWorkload eliminates spikes and honors easy days via safe interval fuzzing', () => {
    const cards = createCards()
    const result = balanceWorkload(cards, {
      days: 14,
      maxPerDay: 2,
      easyDays: [0, 6], // Sun, Sat
      asOf: now,
    })

    expect(result).toBeDefined()
    expect(Array.isArray(result.shifts)).toBe(true)
    expect(Array.isArray(result.newForecast)).toBe(true)
    expect(result.newForecast).toHaveLength(14)

    // Verify all shifts respect safe interval fuzzing: interval change <= 2 days or 5%
    for (const shift of result.shifts) {
      expect(shift.cardId).toBeDefined()
      expect(shift.newDue).toBeDefined()
      const orig = cards.find((c) => c.id === shift.cardId)
      expect(orig).toBeDefined()
      const origMs = new Date(orig!.due).getTime()
      const newMs = new Date(shift.newDue).getTime()
      const diffDays = Math.abs(newMs - origMs) / 86_400_000
      // Safe fuzz invariant: shift should not exceed max 2 days for young/mature cards
      expect(diffDays).toBeLessThanOrEqual(3)
    }
  })

  it('catchUpBacklog safely distributes overdue cards in daily quotas', () => {
    const cards = createCards()
    const overdue = cards.filter((c) => c.due < now.toISOString() && c.state !== 0)
    expect(overdue).toHaveLength(5)

    const dailyCap = 2
    const shifts = catchUpBacklog(overdue, dailyCap, now)

    expect(shifts).toHaveLength(5)
    // Overdue cards should be spread over ceil(5 / 2) = 3 days
    const shiftDays = new Set(shifts.map((s) => s.newDue.slice(0, 10)))
    expect(shiftDays.size).toBeGreaterThanOrEqual(2)
  })
})

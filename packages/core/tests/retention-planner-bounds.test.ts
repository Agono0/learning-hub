import { describe, expect, it } from 'vitest'
import { calibrateHeldOut, PlannerBoundsError, resolveOptions } from '../src/retention-planner'
import { makeReviews } from './retention-planner-fixtures'

describe('resolveOptions bounds', () => {
  it.each([
    [{ grid: [0.9] }],
    [{ grid: [0.6, 0.9] }],
    [{ grid: [0.9, 0.98] }],
    [{ grid: [0.9, 0.8] }],
    [{ grid: [0.9, Number.NaN] }],
    [{ grid: Array.from({ length: 13 }, (_, i) => 0.7 + i * 0.02) }],
    [{ horizonDays: 13 }],
    [{ horizonDays: 366 }],
    [{ horizonDays: 30.5 }],
    [{ budgetMinutes: 0 }],
    [{ budgetMinutes: 601 }],
    [{ budgetMinutes: Number.POSITIVE_INFINITY }],
    [{ maxCards: 0 }],
    [{ maxCards: 5001 }],
    [{ seed: 1.5 }],
    [{ maxCalls: 400_001 }],
  ])('rejects %j', (bad) => {
    expect(() => resolveOptions(bad)).toThrow(PlannerBoundsError)
  })
  it('accepts the documented defaults', () => {
    const o = resolveOptions({})
    expect(o.grid.length).toBe(6)
    expect(o.horizonDays).toBe(90)
    expect(o.maxCalls).toBe(400_000)
  })
})

describe('calibrateHeldOut', () => {
  it('says not validated when the held-out slice is small', () => {
    const c = calibrateHeldOut(makeReviews(100), null)
    expect(c.scored).toBe(0)
    expect(c.note).toMatch(/Not validated/)
  })
  it('scores every 5th card with full histories and labels custom weights as possibly in-sample', () => {
    const w = Array(21).fill(0.5)
    const c = calibrateHeldOut(makeReviews(1500), null)
    const all = makeReviews(1500)
    expect(c.heldOutReviews).toBe(all.filter((r) => r.cardId % 5 === 0).length)
    expect(c.note).toMatch(/not a time split/)
    expect(c.note).toMatch(/default FSRS-6/)
    const custom = calibrateHeldOut(makeReviews(1500), w)
    expect(custom.usingCustomWeights).toBe(true)
    expect(custom.note).toMatch(/in-sample/)
  })
})

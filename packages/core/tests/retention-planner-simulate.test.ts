import { describe, expect, it } from 'vitest'
import {
  resolveOptions,
  estimateTiming,
  preflightCalls,
  runRetentionPlanner,
  selectCards,
  simulateRetention,
} from '../src/retention-planner'
import { makeCards, makeInput, makeReviews, NOW } from './retention-planner-fixtures'

describe('selectCards', () => {
  it('simulates only Review-state, non-suspended cards and counts the rest', () => {
    const cards = [
      ...makeCards(10),
      ...makeCards(3, { state: 0 }).map((c) => ({ ...c, id: c.id + 100 })),
      ...makeCards(2, { state: 1 }).map((c) => ({ ...c, id: c.id + 200 })),
      ...makeCards(4, { state: 3 }).map((c) => ({ ...c, id: c.id + 300 })),
      ...makeCards(5, { suspended: true }).map((c) => ({ ...c, id: c.id + 400 })),
    ]
    const { picked, coverage } = selectCards(cards, 100)
    expect(picked).toHaveLength(10)
    expect(coverage).toMatchObject({
      total: 24,
      eligible: 10,
      excludedNew: 3,
      excludedLearning: 2,
      excludedRelearning: 4,
      excludedSuspended: 5,
      selection: 'all-eligible',
      scaleUp: 1,
    })
  })
  it('samples deterministically by id stride and reports the scale-up', () => {
    const a = selectCards(makeCards(1000), 250)
    const b = selectCards(makeCards(1000).reverse(), 250)
    expect(a.picked.map((c) => c.id)).toEqual(b.picked.map((c) => c.id))
    expect(a.coverage).toMatchObject({
      eligible: 1000,
      simulated: 250,
      stride: 4,
      selection: 'every-kth-by-id',
    })
    expect(a.coverage.scaleUp).toBeCloseTo(4, 6)
  })
})

describe('runRetentionPlanner', () => {
  it('is deterministic for a seed and varies with a different seed', async () => {
    const input = makeInput(makeCards(300))
    const a = await runRetentionPlanner(input, { maxCards: 300 })
    const b = await runRetentionPlanner(input, { maxCards: 300 })
    const c = await runRetentionPlanner(input, { maxCards: 300, seed: 7 })
    expect(a.grid).toEqual(b.grid)
    expect(JSON.stringify(c.grid)).not.toEqual(JSON.stringify(a.grid))
    expect(a.status).toBe('ok')
  })
  it('reports (does not assume) the load shape across retentions', async () => {
    const r = await runRetentionPlanner(makeInput(makeCards(400)), {
      maxCards: 400,
      grid: [0.7, 0.8, 0.9, 0.97],
    })
    const first = r.grid[0]!.meanDailyMinutes
    const last = r.grid[r.grid.length - 1]!.meanDailyMinutes
    // Property this model actually shows on a spread-out fixture: the top of the grid costs more than the bottom.
    expect(last).toBeGreaterThan(first)
  })
  it('recommends the highest tested retention within budget, or null', async () => {
    const input = makeInput(makeCards(400))
    const wide = await runRetentionPlanner(input, { maxCards: 400, budgetMinutes: 600 })
    expect(wide.recommendation?.retention).toBe(0.97)
    const tight = await runRetentionPlanner(input, { maxCards: 400, budgetMinutes: 1 })
    const fit = tight.grid.filter((p) => p.fitsBudget)
    expect(tight.recommendation?.retention ?? null).toBe(
      fit.length ? fit[fit.length - 1]!.retention : null,
    )
  })
  it('scales sampled results up to the eligible set', async () => {
    const full = await runRetentionPlanner(makeInput(makeCards(600)), {
      maxCards: 600,
      grid: [0.8, 0.9],
    })
    const sampled = await runRetentionPlanner(makeInput(makeCards(600)), {
      maxCards: 300,
      grid: [0.8, 0.9],
    })
    expect(sampled.coverage.simulated).toBe(300)
    const ratio = sampled.grid[1]!.meanDailyMinutes / full.grid[1]!.meanDailyMinutes
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(1.3)
  })
  it('stops at the runtime call ceiling and reports actual calls made', async () => {
    const cards = makeCards(200).map((c) => ({ ...c, stability: 2, due: c.lastReview! }))
    const counter = { used: 0, max: 500 }
    const out = await simulateRetention({
      cards,
      retention: 0.9,
      weights: null,
      options: { horizonDays: 90, seed: 1 },
      mix: { hard: 0.1, good: 0.8, easy: 0.1, n: 100, source: 'history' },
      timing: estimateTiming([]),
      now: NOW,
      counter,
    })
    expect(out.complete).toBe(false)
    expect(counter.used).toBe(500)
  })
  it('rejects in preflight when the conservative bound exceeds the ceiling', async () => {
    const r = await runRetentionPlanner(makeInput(makeCards(2000)), {
      maxCards: 2000,
      maxCalls: 1000,
    })
    expect(r.status).toBe('rejected')
    expect(r.schedulerCalls).toBe(0)
    expect(preflightCalls(2000, 6, 90)).toBeGreaterThan(1000)
  })
  it('returns no-eligible-cards when nothing is in Review state', async () => {
    const r = await runRetentionPlanner(makeInput(makeCards(5, { state: 0 })))
    expect(r.status).toBe('no-eligible-cards')
    expect(r.recommendation).toBeNull()
  })
  it('runs the default scenario well inside the ceiling', async () => {
    const t0 = performance.now()
    const r = await runRetentionPlanner(
      makeInput(
        makeCards(1500).map((c) => ({ ...c, stability: 1 + (c.id % 9), due: c.lastReview! })),
      ),
    )
    expect(r.status).toBe('ok')
    expect(r.schedulerCalls).toBeLessThan(r.maxCalls)
    expect(performance.now() - t0).toBeLessThan(10_000)
  })
  it('recommends exactly the last grid point that fits, never one that does not', async () => {
    const r = await runRetentionPlanner(makeInput(makeCards(300)), {
      maxCards: 300,
      budgetMinutes: 1.2,
    })
    const fits = r.grid.filter((p) => p.meanDailyMinutes <= 1.2)
    expect(r.recommendation?.retention ?? null).toBe(
      fits.length ? fits[fits.length - 1]!.retention : null,
    )
    for (const p of r.grid) expect(p.fitsBudget).toBe(p.meanDailyMinutes <= 1.2)
  })
  it('labels weights and calibration from the same input', async () => {
    const custom = await runRetentionPlanner({
      ...makeInput(makeCards(50), makeReviews(1500)),
      weights: Array(21).fill(0.5),
    })
    expect(custom.weights).toBe('custom')
    expect(custom.calibration.usingCustomWeights).toBe(true)
    const def = await runRetentionPlanner(makeInput(makeCards(50), makeReviews(1500)))
    expect(def.weights).toBe('default')
    expect(def.calibration.usingCustomWeights).toBe(false)
  })
  it('uses plain wording in bounds errors', () => {
    expect(() => resolveOptions({ horizonDays: 5 })).toThrow(
      /Look ahead must be a whole number of days between 14 and 365/,
    )
    expect(() => resolveOptions({ budgetMinutes: 0 })).toThrow(
      /Daily minutes must be between 1 and 600/,
    )
  })
})

describe('decks with their own settings', () => {
  it('leaves their cards out of a global-scope model and counts them', () => {
    const cards = [
      ...makeCards(10),
      ...makeCards(4, { ownSettings: true }).map((c) => ({ ...c, id: c.id + 500 })),
    ]
    const { picked, coverage } = selectCards(cards, 100)
    expect(picked).toHaveLength(10)
    expect(coverage.excludedOwnSettings).toBe(4)
    expect(picked.every((c) => !c.ownSettings)).toBe(true)
  })
  it('reports scope so a deck-only result is never mistaken for a global one', async () => {
    const deck = await runRetentionPlanner(
      { ...makeInput(makeCards(30)), deckId: 2 },
      { maxCards: 30 },
    )
    expect(deck.scope).toBe('deck')
    const all = await runRetentionPlanner(makeInput(makeCards(30)), { maxCards: 30 })
    expect(all.scope).toBe('all-decks')
  })
})

describe('fingerprintInput', () => {
  it('is stable and changes with retention, weights, cards or reviews', async () => {
    const { fingerprintInput } = await import('../src/retention-planner')
    const cards = makeCards(20)
    const a = makeInput(cards)
    const fp = fingerprintInput(a)
    expect(fingerprintInput(makeInput(makeCards(20)))).toBe(fp)
    expect(fingerprintInput({ ...a, currentRetention: 0.93 })).not.toBe(fp)
    expect(fingerprintInput({ ...a, weights: [1, 2, 3] })).not.toBe(fp)
    expect(fingerprintInput({ ...a, cards: cards.slice(1) })).not.toBe(fp)
    expect(
      fingerprintInput({ ...a, cards: [{ ...cards[0], stability: 99 }, ...cards.slice(1)] }),
    ).not.toBe(fp)
    expect(
      fingerprintInput({
        ...a,
        reviews: [
          ...a.reviews,
          {
            id: 9999,
            cardId: 1,
            rating: 3,
            reviewedAt: '2026-01-01T00:00:00Z',
            elapsedDays: 1,
            timeMs: 3000,
          },
        ],
      }),
    ).not.toBe(fp)
  })
})

describe('weights normalization and fingerprint width', () => {
  it('migrates 17 and 19 value vectors to 21 so scheduler and decay agree', async () => {
    const { normalizeWeights } = await import('../src/retention-planner')
    const { FSRS6_DEFAULT_WEIGHTS } = await import('../src/fsrs-optimizer')
    expect(normalizeWeights(null)).toBeNull()
    expect(normalizeWeights([1, 2, 3])).toBeNull()
    expect(normalizeWeights(FSRS6_DEFAULT_WEIGHTS.slice(0, 17))?.length).toBe(21)
    expect(normalizeWeights(FSRS6_DEFAULT_WEIGHTS.slice(0, 19))?.length).toBe(21)
    expect(normalizeWeights([...FSRS6_DEFAULT_WEIGHTS])?.length).toBe(21)
  })
  it('fingerprint is 128 bits of hex', async () => {
    const { fingerprintInput } = await import('../src/retention-planner')
    expect(fingerprintInput(makeInput(makeCards(5)))).toMatch(/^[0-9a-f]{32}$/)
  })
})

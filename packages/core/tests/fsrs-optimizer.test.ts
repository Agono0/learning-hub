import { describe, expect, it } from 'vitest'
// Optimizer symbols from their defining module (no longer re-exported through
// ./fsrs — that barrel edge made the import graph cyclic).
import {
  FSRS6_DEFAULT_WEIGHTS,
  FSRS6_WEIGHT_BOUNDS,
  evaluateFsrsWeights,
  optimizeFsrsWeights,
  parseFsrsWeights,
  rescheduleCardHistory,
  type FsrsOptimizerRevlog,
} from '../src/fsrs-optimizer'
import { formatInterval, previewGrades } from '../src/fsrs'

describe('FSRS-6 weight parser, evaluator, optimizer, and history replayer', () => {
  it('parses 21-weight arrays, Anki comma-separated strings, and migrates 17/19-weight vectors', () => {
    const exact = parseFsrsWeights([...FSRS6_DEFAULT_WEIGHTS])
    expect(exact).toHaveLength(21)
    expect(exact[20]).toBeCloseTo(FSRS6_DEFAULT_WEIGHTS[20]!, 4)

    const ankiCsv = parseFsrsWeights(FSRS6_DEFAULT_WEIGHTS.join(', '))
    expect(ankiCsv).toEqual(exact)

    const bracketed = parseFsrsWeights(`[${FSRS6_DEFAULT_WEIGHTS.join(', ')}]`)
    expect(bracketed).toEqual(exact)

    // FSRS-4.5 (17 weights) and FSRS-5 (19 weights) migrate cleanly to 21 FSRS-6 weights
    const migrated17 = parseFsrsWeights(FSRS6_DEFAULT_WEIGHTS.slice(0, 17))
    expect(migrated17).toHaveLength(21)
    const migrated19 = parseFsrsWeights(FSRS6_DEFAULT_WEIGHTS.slice(0, 19))
    expect(migrated19).toHaveLength(21)

    expect(() => parseFsrsWeights('1, 2, 3')).toThrow()
    expect(() => parseFsrsWeights('not-numbers')).toThrow()
  })

  it('evaluates Log-Loss and 10-bin calibration RMSE on review histories', () => {
    expect(evaluateFsrsWeights([]).logLoss).toBeNull()

    const logs: FsrsOptimizerRevlog[] = []
    const baseMs = Date.parse('2026-01-01T09:00:00.000Z')
    for (let c = 1; c <= 20; c++) {
      logs.push({
        cardId: c,
        rating: 3,
        reviewedAt: new Date(baseMs).toISOString(),
      })
      logs.push({
        cardId: c,
        rating: c % 5 === 0 ? 1 : 3,
        reviewedAt: new Date(baseMs + 4 * 86_400_000).toISOString(),
      })
    }

    const evalRes = evaluateFsrsWeights(logs)
    expect(evalRes.sampleCount).toBe(20)
    expect(evalRes.cardCount).toBe(20)
    expect(evalRes.logLoss).not.toBeNull()
    expect(evalRes.logLoss!).toBeGreaterThan(0)
    expect(evalRes.rmse).not.toBeNull()
    expect(evalRes.rmse!).toBeGreaterThanOrEqual(0)
  })

  it('guards against overfitting with insufficient data (< 50 spaced transitions)', () => {
    const logs: FsrsOptimizerRevlog[] = [
      { cardId: 1, rating: 3, reviewedAt: '2026-01-01T09:00:00.000Z' },
      { cardId: 1, rating: 3, reviewedAt: '2026-01-05T09:00:00.000Z' },
    ]
    const res = optimizeFsrsWeights(logs)
    expect(res.status).toBe('insufficient_data')
    expect(res.sampleCount).toBe(1)
    expect(res.weights).toHaveLength(21)
  })

  it('optimizes 21 FSRS-6 weights within model bounds without degrading baseline Log-Loss', () => {
    // Generate 30 cards × 3 reviews = 60 spaced transitions where initial stability
    // is lower than defaults (higher forgetting rate after 5 days)
    const logs: FsrsOptimizerRevlog[] = []
    const baseMs = Date.parse('2026-01-01T09:00:00.000Z')
    for (let c = 1; c <= 30; c++) {
      logs.push({
        cardId: c,
        rating: 3,
        reviewedAt: new Date(baseMs).toISOString(),
      })
      const failFirst = c % 2 === 0
      logs.push({
        cardId: c,
        rating: failFirst ? 1 : 3,
        reviewedAt: new Date(baseMs + 5 * 86_400_000).toISOString(),
      })
      logs.push({
        cardId: c,
        rating: c % 3 === 0 ? 1 : 3,
        reviewedAt: new Date(baseMs + 10 * 86_400_000).toISOString(),
      })
    }

    const res = optimizeFsrsWeights(logs, { iterations: 15 })
    expect(res.sampleCount).toBe(60)
    expect(['optimized', 'already_optimal']).toContain(res.status)
    expect(res.optimized.logLoss!).toBeLessThanOrEqual(res.baseline.logLoss! + 1e-9)

    for (let i = 0; i < 21; i++) {
      const [lo, hi] = FSRS6_WEIGHT_BOUNDS[i]!
      expect(res.weights[i]!).toBeGreaterThanOrEqual(lo - 1e-9)
      expect(res.weights[i]!).toBeLessThanOrEqual(hi + 1e-9)
    }
  })

  it('replays card revlog history via ts-fsrs Reschedule and formats live grade preview badges', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z')
    const previews = await previewGrades(
      {
        id: 1,
        due: now.toISOString(),
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: null,
        learningStep: 0,
      },
      0.9,
      { now },
    )
    expect(previews).toHaveLength(4)
    expect(previews.map((p) => p.grade)).toEqual([1, 2, 3, 4])
    expect(previews.every((p) => p.label.length > 0)).toBe(true)

    expect(formatInterval(new Date(now.getTime() + 30_000).toISOString(), now)).toBe('<1m')
    expect(formatInterval(new Date(now.getTime() + 10 * 60_000).toISOString(), now)).toBe('10m')
    expect(formatInterval(new Date(now.getTime() + 6 * 86_400_000).toISOString(), now)).toBe('6d')

    const patch90 = await rescheduleCardHistory(
      [
        { cardId: 1, rating: 4, reviewedAt: '2026-05-01T12:00:00.000Z' },
        { cardId: 1, rating: 3, reviewedAt: '2026-05-10T12:00:00.000Z' },
      ],
      { desiredRetention: 0.9 },
    )
    const patch80 = await rescheduleCardHistory(
      [
        { cardId: 1, rating: 4, reviewedAt: '2026-05-01T12:00:00.000Z' },
        { cardId: 1, rating: 3, reviewedAt: '2026-05-10T12:00:00.000Z' },
      ],
      { desiredRetention: 0.8 },
    )
    expect(patch90).not.toBeNull()
    expect(patch80).not.toBeNull()
    // Lower target retention produces a strictly longer scheduled interval
    expect(patch80!.scheduledDays).toBeGreaterThan(patch90!.scheduledDays)
  })
})

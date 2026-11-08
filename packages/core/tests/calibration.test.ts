import { describe, expect, it } from 'vitest'
import {
  computeBrierScore,
  computeCalibrationMetrics,
  type CalibrationReview,
} from '../src/analytics'

describe('Metacognitive Calibration & Brier Score (Murphy 1973; Lichtenstein 1982)', () => {
  it('computes Brier score where 0 is perfect calibration', () => {
    // 4 reviews with perfect predictions:
    // predicted 1.0 and correct (rating 3) -> (1-1)^2 = 0
    // predicted 0.0 and wrong (rating 1) -> (0-0)^2 = 0
    const reviews: CalibrationReview[] = [
      { predictedRetrievability: 1.0, rating: 3 },
      { predictedRetrievability: 1.0, rating: 4 },
      { predictedRetrievability: 0.0, rating: 1 },
      { predictedRetrievability: 0.0, rating: 1 },
    ]
    const brier = computeBrierScore(reviews)
    expect(brier).toBe(0)
  })

  it('computes Brier score for imperfect predictions', () => {
    // predicted 0.8, outcome 1 -> (0.8 - 1)^2 = 0.04
    // predicted 0.8, outcome 0 -> (0.8 - 0)^2 = 0.64
    // Mean = (0.04 + 0.64) / 2 = 0.34
    const reviews: CalibrationReview[] = [
      { predictedRetrievability: 0.8, rating: 3 },
      { predictedRetrievability: 0.8, rating: 1 },
    ]
    const brier = computeBrierScore(reviews)
    expect(brier).toBeCloseTo(0.34, 4)
  })

  it('detects overconfidence bias when predictions exceed actual outcomes', () => {
    // predicted 0.9 on all, but only 50% retained -> overconfidence bias
    const reviews: CalibrationReview[] = [
      { predictedRetrievability: 0.9, rating: 3 },
      { predictedRetrievability: 0.9, rating: 1 },
    ]
    const metrics = computeCalibrationMetrics(reviews)
    expect(metrics.status).toBe('overconfident')
    expect(metrics.bias).toBeGreaterThan(0.05)
    expect(metrics.meanPredicted).toBeCloseTo(0.9, 2)
    expect(metrics.meanActual).toBeCloseTo(0.5, 2)
  })

  it('detects well-calibrated metacognition when bias is within +/- 5%', () => {
    // predicted 0.8 on all, 8 out of 10 retained -> mean pred 0.8, mean act 0.8
    const reviews: CalibrationReview[] = [
      ...Array.from({ length: 8 }, () => ({ predictedRetrievability: 0.8, rating: 3 })),
      ...Array.from({ length: 2 }, () => ({ predictedRetrievability: 0.8, rating: 1 })),
    ]
    const metrics = computeCalibrationMetrics(reviews)
    expect(metrics.status).toBe('well-calibrated')
    expect(Math.abs(metrics.bias ?? 0)).toBeLessThanOrEqual(0.05)
    expect(metrics.brierScore).toBeCloseTo(0.16, 2)
  })
})

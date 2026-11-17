import { describe, expect, it } from 'vitest'
import {
  calculateBrierScore,
  calculateMetacognitiveBias,
  calculateMetacognitiveReport,
  metacognitiveReportSchema,
  type JudgmentOfLearning,
} from '../src/metacognition/index.js'

describe('Metacognitive Calibration & Brier Diagnostics Comprehensive Suite', () => {
  describe('Brier Score Verification (Glenn Brier 1950)', () => {
    it('calculates 0.0 for theoretically perfect calibration', () => {
      const perfectTrials: JudgmentOfLearning[] = [
        { confidence: 1.0, outcome: 1 },
        { confidence: 1.0, outcome: 1 },
        { confidence: 0.0, outcome: 0 },
        { confidence: 0.0, outcome: 0 },
      ]
      expect(calculateBrierScore(perfectTrials)).toBe(0.0)
    })

    it('calculates 1.0 for completely inverted anti-knowledge', () => {
      const invertedTrials: JudgmentOfLearning[] = [
        { confidence: 1.0, outcome: 0 },
        { confidence: 1.0, outcome: 0 },
        { confidence: 0.0, outcome: 1 },
        { confidence: 0.0, outcome: 1 },
      ]
      expect(calculateBrierScore(invertedTrials)).toBe(1.0)
    })

    it('calculates 0.25 for uncalibrated random coin flip forecasting', () => {
      const coinFlipTrials: JudgmentOfLearning[] = [
        { confidence: 0.5, outcome: 1 },
        { confidence: 0.5, outcome: 0 },
        { confidence: 0.5, outcome: 1 },
        { confidence: 0.5, outcome: 0 },
      ]
      // (0.5 - 1)^2 = 0.25; (0.5 - 0)^2 = 0.25; mean = 0.25
      expect(calculateBrierScore(coinFlipTrials)).toBe(0.25)
    })

    it('returns 0 for empty judgment cohorts', () => {
      expect(calculateBrierScore([])).toBe(0)
    })
  })

  describe('Metacognitive Bias (Koriat & Bjork 2005)', () => {
    it('detects positive overconfidence bias', () => {
      const overconfident: JudgmentOfLearning[] = [
        { confidence: 0.9, outcome: 0 },
        { confidence: 0.8, outcome: 0 },
        { confidence: 0.9, outcome: 1 },
      ]
      // Mean confidence: 0.867, Mean outcome: 0.333 -> Bias > +0.50
      const bias = calculateMetacognitiveBias(overconfident)
      expect(bias).toBeGreaterThan(0.4)
    })

    it('detects negative underconfidence bias', () => {
      const underconfident: JudgmentOfLearning[] = [
        { confidence: 0.2, outcome: 1 },
        { confidence: 0.3, outcome: 1 },
        { confidence: 0.4, outcome: 1 },
      ]
      const bias = calculateMetacognitiveBias(underconfident)
      expect(bias).toBeLessThan(-0.5)
    })

    it('returns 0 for empty trials', () => {
      expect(calculateMetacognitiveBias([])).toBe(0)
    })
  })

  describe('Metacognitive Diagnostic Report & Desirable Difficulties Protocol', () => {
    it('diagnoses fluency illusion when overconfidence bias exceeds threshold', () => {
      const fluencyIllusionTrials: JudgmentOfLearning[] = [
        { confidence: 0.95, outcome: 0 },
        { confidence: 0.9, outcome: 0 },
        { confidence: 0.85, outcome: 0 },
        { confidence: 0.9, outcome: 1 },
      ]

      const report = calculateMetacognitiveReport(fluencyIllusionTrials)
      expect(metacognitiveReportSchema.safeParse(report).success).toBe(true)
      expect(report.status).toBe('fluency_illusion')
      expect(report.difficultyAdjustment).toBe('escalate_to_free_production')
      expect(report.guidance).toContain('fluency illusion detected')
    })

    it('diagnoses expert calibration when Brier score <= 0.15 and low bias', () => {
      const expertTrials: JudgmentOfLearning[] = [
        { confidence: 0.9, outcome: 1 },
        { confidence: 0.85, outcome: 1 },
        { confidence: 0.1, outcome: 0 },
        { confidence: 0.15, outcome: 0 },
        { confidence: 0.8, outcome: 1 },
      ]

      const report = calculateMetacognitiveReport(expertTrials)
      expect(report.status).toBe('expertly_calibrated')
      expect(report.difficultyAdjustment).toBe('maintain_standard_spacing')
      expect(report.brierScore).toBeLessThanOrEqual(0.15)
    })

    it('diagnoses underconfidence bias when actual recall exceeds self-prediction', () => {
      const underconfidentTrials: JudgmentOfLearning[] = [
        { confidence: 0.2, outcome: 1 },
        { confidence: 0.3, outcome: 1 },
        { confidence: 0.3, outcome: 1 },
      ]

      const report = calculateMetacognitiveReport(underconfidentTrials)
      expect(report.status).toBe('underconfident')
      expect(report.difficultyAdjustment).toBe('support_with_cues')
      expect(report.guidance).toContain('Underconfidence bias')
    })

    it('handles empty trials gracefully with baseline safe values', () => {
      const report = calculateMetacognitiveReport([])
      expect(report.sampleSize).toBe(0)
      expect(report.status).toBe('expertly_calibrated')
      expect(report.brierScore).toBe(0)
      expect(report.accuracy).toBe(0)
      expect(report.averageConfidence).toBe(0)
    })
  })
})

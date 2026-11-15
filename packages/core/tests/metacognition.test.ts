import { describe, expect, it } from 'vitest'
import {
  calculateBrierScore,
  calculateConfidenceBias,
  evaluateMetacognitiveProfile,
  type JudgmentOfLearning,
} from '../src/metacognition/index'

describe('Metacognitive Calibration & Fluency-Illusion Diagnostic Engine', () => {
  it('calculates Brier score and confidence bias for perfectly calibrated trials', () => {
    // 100% confidence with correct outcome, 0% confidence with failed outcome
    const trials: JudgmentOfLearning[] = [
      { confidence: 1.0, outcome: 1.0 },
      { confidence: 0.0, outcome: 0.0 },
      { confidence: 0.8, outcome: 1.0 },
      { confidence: 0.2, outcome: 0.0 },
    ]

    const brier = calculateBrierScore(trials)
    const bias = calculateConfidenceBias(trials)

    expect(brier).toBeLessThan(0.05) // low error
    expect(Math.abs(bias)).toBe(0) // 0 bias (perfect alignment)
  })

  it('detects fluency illusion / overconfidence bias and recommends desirable difficulties', () => {
    // Highly confident (0.9), but failing consistently (0.0) -> typical illusion of competence
    const trials: JudgmentOfLearning[] = [
      { confidence: 0.9, outcome: 0.0 },
      { confidence: 0.85, outcome: 0.0 },
      { confidence: 0.95, outcome: 1.0 },
      { confidence: 0.8, outcome: 0.0 },
    ]

    const report = evaluateMetacognitiveProfile(trials)
    expect(report.bias).toBeGreaterThan(0.25)
    expect(report.status).toBe('fluency_illusion')
    expect(report.difficultyAdjustment).toBe('escalate_to_free_production')
    expect(report.guidance).toContain('Koriat & Bjork')
  })

  it('detects underconfidence bias and advises cue confirmation', () => {
    // Low subjective confidence (0.2), but actually succeeding (1.0)
    const trials: JudgmentOfLearning[] = [
      { confidence: 0.2, outcome: 1.0 },
      { confidence: 0.3, outcome: 1.0 },
      { confidence: 0.1, outcome: 1.0 },
    ]

    const report = evaluateMetacognitiveProfile(trials)
    expect(report.bias).toBeLessThan(-0.15)
    expect(report.status).toBe('underconfident')
    expect(report.difficultyAdjustment).toBe('support_with_cues')
  })

  it('handles empty trials gracefully', () => {
    const report = evaluateMetacognitiveProfile([])
    expect(report.sampleSize).toBe(0)
    expect(report.brierScore).toBe(0)
    expect(report.bias).toBe(0)
    expect(report.status).toBe('expertly_calibrated')
  })
})

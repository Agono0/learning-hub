import { z } from 'zod'

/**
 * @file Metacognitive Calibration & Fluency-Illusion Diagnostic Engine
 * @description Implements Glenn W. Brier's (1950) probability verification metric,
 * Asher Koriat & Robert Bjork's (2005) "Illusions of Competence" framework, and
 * Elizabeth & Robert Bjork's (2011) "Desirable Difficulties" protocol.
 *
 * Learners routinely misjudge their own recall ability (Judgments of Learning / JOL)
 * due to perceptual fluency during study. By calculating Brier calibration and bias,
 * this engine dynamically adjusts retrieval friction to puncture the fluency illusion.
 */

export const judgmentOfLearningSchema = z.object({
  cardId: z.number().int().positive().optional(),
  /** Subjective probability of correct retrieval reported before answer reveal (0 to 1) */
  confidence: z.number().min(0).max(1),
  /** Actual empirical retrieval outcome: 1 = correct / recalled, 0 = lapse / failed */
  outcome: z.number().min(0).max(1),
  /** Response latency in milliseconds */
  latencyMs: z.number().min(0).optional(),
})

export type JudgmentOfLearning = z.infer<typeof judgmentOfLearningSchema>

export const metacognitiveReportSchema = z.object({
  /** Glenn Brier (1950) calibration quadratic score: 0 = perfect forecast, 1 = maximum error */
  brierScore: z.number().min(0).max(1),
  /** Mean subjective confidence minus mean actual accuracy: > 0 = overconfident, < 0 = underconfident */
  bias: z.number().min(-1).max(1),
  /** Qualitative metacognitive alignment status */
  status: z.enum([
    'expertly_calibrated',
    'mild_overconfidence',
    'fluency_illusion',
    'underconfident',
  ]),
  /** Desirable difficulty recommendation to optimize learning friction (Bjork 2011) */
  difficultyAdjustment: z.enum([
    'escalate_to_free_production',
    'maintain_standard_spacing',
    'support_with_cues',
  ]),
  /** Actionable learning science guidance text */
  guidance: z.string(),
  /** Total judgments analyzed in this cohort */
  sampleSize: z.number().int().min(0),
  /** Average accuracy across evaluated trials */
  accuracy: z.number().min(0).max(1),
  /** Average confidence across evaluated trials */
  averageConfidence: z.number().min(0).max(1),
})

export type MetacognitiveReport = z.infer<typeof metacognitiveReportSchema>

/**
 * Calculates the mean Brier score across predictions:
 * B = (1 / N) * sum((confidence_i - outcome_i)^2)
 */
export function calculateBrierScore(items: JudgmentOfLearning[]): number {
  if (items.length === 0) return 0
  const sumSquaredDiff = items.reduce((acc, item) => {
    const diff = item.confidence - item.outcome
    return acc + diff * diff
  }, 0)
  return Math.min(1, Math.max(0, sumSquaredDiff / items.length))
}

/**
 * Calculates overconfidence / underconfidence bias:
 * Bias = Mean(Confidence) - Mean(Outcome)
 */
export function calculateConfidenceBias(items: JudgmentOfLearning[]): number {
  if (items.length === 0) return 0
  const sumConf = items.reduce((acc, i) => acc + i.confidence, 0)
  const sumOut = items.reduce((acc, i) => acc + i.outcome, 0)
  const meanConf = sumConf / items.length
  const meanOut = sumOut / items.length
  return Math.min(1, Math.max(-1, meanConf - meanOut))
}

/**
 * Evaluates full metacognitive calibration profile and prescribes desirable difficulty adjustments.
 */
export function evaluateMetacognitiveProfile(items: JudgmentOfLearning[]): MetacognitiveReport {
  if (items.length === 0) {
    return {
      brierScore: 0,
      bias: 0,
      status: 'expertly_calibrated',
      difficultyAdjustment: 'maintain_standard_spacing',
      guidance: 'No judgment trials recorded yet. Practice cards to measure calibration.',
      sampleSize: 0,
      accuracy: 0,
      averageConfidence: 0,
    }
  }

  const brierScore = calculateBrierScore(items)
  const bias = calculateConfidenceBias(items)
  const accuracy = items.reduce((acc, i) => acc + i.outcome, 0) / items.length
  const averageConfidence = items.reduce((acc, i) => acc + i.confidence, 0) / items.length

  let status: MetacognitiveReport['status'] = 'expertly_calibrated'
  let difficultyAdjustment: MetacognitiveReport['difficultyAdjustment'] =
    'maintain_standard_spacing'
  let guidance =
    'Your confidence ratings align closely with empirical recall. Memory models are well calibrated.'

  if (bias > 0.25) {
    status = 'fluency_illusion'
    difficultyAdjustment = 'escalate_to_free_production'
    guidance =
      'Significant fluency illusion detected (Koriat & Bjork 2005). Familiarity is being mistaken for mastery. Escalating to free-recall and proof steps to pierce familiarity bias.'
  } else if (bias > 0.1) {
    status = 'mild_overconfidence'
    difficultyAdjustment = 'escalate_to_free_production'
    guidance =
      'Mild overconfidence. You recall slightly less than predicted. Introducing cloze and active production drills.'
  } else if (bias < -0.15) {
    status = 'underconfident'
    difficultyAdjustment = 'support_with_cues'
    guidance =
      'Underconfidence bias detected. You possess stronger retention than your subjective confidence reflects. Reinforcing with immediate positive confirmation.'
  }

  return {
    brierScore: Number(brierScore.toFixed(3)),
    bias: Number(bias.toFixed(3)),
    status,
    difficultyAdjustment,
    guidance,
    sampleSize: items.length,
    accuracy: Number(accuracy.toFixed(3)),
    averageConfidence: Number(averageConfidence.toFixed(3)),
  }
}

export const calculateMetacognitiveBias = calculateConfidenceBias
export const calculateMetacognitiveReport = evaluateMetacognitiveProfile

export * from './hypercorrection-engine'

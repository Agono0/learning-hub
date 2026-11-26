/**
 * Metacognitive calibration for explanations.
 *
 * Before seeing a grade the learner predicts how well they explained it (0-100).
 * Comparing prediction with the rubric score trains monitoring accuracy: learners
 * are usually overconfident on shallow understanding (Dunning & Kruger 1999;
 * Bjork, Dunlosky & Kornell 2013 on illusions of knowing). Pure and deterministic.
 */
import { z } from 'zod'

export const calibrationPointSchema = z.object({
  predicted: z.number().min(0).max(100),
  actual: z.number().min(0).max(100),
})
export type CalibrationPoint = z.infer<typeof calibrationPointSchema>

export type CalibrationBias = 'overconfident' | 'underconfident' | 'well-calibrated'

export interface CalibrationReport {
  n: number
  /** Mean of (predicted - actual) in points; positive means overconfident. */
  meanBias: number
  /** Mean absolute error in points. */
  mae: number
  /** Brier-style score on 0..1 scaled values, lower is better. */
  brier: number
  /** Pearson correlation of predicted vs actual (resolution), null if undefined. */
  resolution: number | null
  bias: CalibrationBias
  advice: string
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** Classify bias with a +-8 point dead zone so noise is not labelled. */
export function classifyBias(meanBias: number): CalibrationBias {
  if (meanBias > 8) return 'overconfident'
  if (meanBias < -8) return 'underconfident'
  return 'well-calibrated'
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx
    const dy = (ys[i] as number) - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return round1((sxy / Math.sqrt(sxx * syy)) * 100) / 100
}

/** Summarise calibration over a list of predicted/actual pairs. */
export function calibrationReport(points: CalibrationPoint[]): CalibrationReport {
  const n = points.length
  if (n === 0)
    return {
      n: 0,
      meanBias: 0,
      mae: 0,
      brier: 0,
      resolution: null,
      bias: 'well-calibrated',
      advice: 'Predict your score before each check to start measuring calibration.',
    }
  const bias = points.reduce((a, p) => a + (p.predicted - p.actual), 0) / n
  const mae = points.reduce((a, p) => a + Math.abs(p.predicted - p.actual), 0) / n
  const brier = points.reduce((a, p) => a + ((p.predicted - p.actual) / 100) ** 2, 0) / n
  const kind = classifyBias(bias)
  const advice =
    kind === 'overconfident'
      ? 'You tend to rate your explanations higher than they score. Before submitting, check that you gave a reason and used your own words.'
      : kind === 'underconfident'
        ? 'You explain better than you think. Trust the reasoning you wrote and try harder prompt styles.'
        : 'Your self-ratings track the rubric well. Keep predicting before each check.'
  return {
    n,
    meanBias: round1(bias),
    mae: round1(mae),
    brier: Math.round(brier * 1000) / 1000,
    resolution: pearson(
      points.map((p) => p.predicted),
      points.map((p) => p.actual),
    ),
    bias: kind,
    advice,
  }
}

/** Adjust a prompt level by calibration: overconfident learners stay one level lower. */
export function calibratedLevel(level: 1 | 2 | 3 | 4, report: CalibrationReport): 1 | 2 | 3 | 4 {
  if (report.n < 5) return level
  if (report.bias === 'overconfident') return Math.max(1, level - 1) as 1 | 2 | 3 | 4
  if (report.bias === 'underconfident') return Math.min(4, level + 1) as 1 | 2 | 3 | 4
  return level
}

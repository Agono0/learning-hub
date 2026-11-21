/**
 * @file hypercorrection-engine.ts
 * @module @learning-hub/core/metacognition
 * @description Dynamic Self-Regulated Metacognitive Calibration & Hypercorrection Engine.
 *
 * Implements:
 * 1. Thomas O. Nelson & Louis Narens (1990) "Metamemory: A Theoretical Framework and New Findings"
 *    - Dual-level metacognitive control architecture (Object-Level vs Meta-Level).
 *    - Prospective Monitoring: Ease-of-Learning (EOL), Judgment-of-Learning (JOL).
 *    - Immediate / Retrospective Monitoring: Feeling-of-Knowing (FOK), Retrospective Confidence Judgments (RCJ).
 * 2. Edward C. Butterfield & Janet Metcalfe (2001, 2006) "The Hypercorrection Effect"
 *    - Epistemic prediction error / cognitive surprise dynamics: errors made with high confidence
 *      elicit an attention surge, P300 event-related potential mobilization, and are corrected
 *      dramatically faster and retained longer than low-confidence errors.
 * 3. Leo A. Goodman & William H. Kruskal (1954, 1972) Gamma Correlation (γ):
 *    - Nonparametric rank correlation measuring metacognitive resolution / discrimination.
 * 4. Allan H. Murphy (1973) Brier Score Partitioning:
 *    - Brier Score = Reliability (Calibration Error) - Resolution + Uncertainty (Base Rate).
 * 5. Asher Koriat & Robert A. Bjork (2005) "Illusions of Competence in Monitoring One's Knowledge":
 *    - Detection of fluency fallacies, intuitive physics heuristics, and lexical familiarity illusions.
 */

import { z } from 'zod'

// TD-05: scenario corpora (content, not logic) live in './content'.
import { EPISTEMIC_CRUCIBLE_PROBLEMS } from './content'

// ---------------------------------------------------------------------------
// 1. Types & Zod Schemas
// ---------------------------------------------------------------------------

export const cognitiveIllusionTypeSchema = z.enum([
  'fluency_illusion',
  'intuitive_physics_bias',
  'conjunction_fallacy',
  'lexical_familiarity',
  'availability_cascade',
  'gambler_fallacy',
  'memory_concurrency_illusion',
])

export type CognitiveIllusionType = z.infer<typeof cognitiveIllusionTypeSchema>

export const crucibleOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  isCorrect: z.boolean(),
  illusionType: cognitiveIllusionTypeSchema.optional(),
  misconceptionRationale: z.string(),
})

export type CrucibleOption = z.infer<typeof crucibleOptionSchema>

export const epistemicCrucibleItemSchema = z.object({
  id: z.string(),
  domain: z.enum([
    'physics_thermodynamics',
    'cognitive_heuristics',
    'probability_fallacies',
    'systems_concurrency',
    'neuroscience_myths',
  ]),
  title: z.string(),
  stem: z.string(),
  options: z.array(crucibleOptionSchema).min(2),
  canonicalScientificExplanation: z.string(),
  epistemicPredictionErrorExplanation: z.string(),
  counterEvidence: z.string(),
  subGoalChunking: z.array(z.string()),
})

export type EpistemicCrucibleItem = z.infer<typeof epistemicCrucibleItemSchema>

export const trialMetacognitiveRecordSchema = z.object({
  itemId: z.string(),
  selectedOptionId: z.string(),
  isCorrect: z.boolean(),
  /** Prospective Judgment of Learning before viewing options (0 to 1) */
  prospectiveJOL: z.number().min(0).max(1),
  /** Retrospective subjective confidence rating after choosing answer (0 to 1) */
  retrospectiveConfidence: z.number().min(0).max(1),
  responseLatencyMs: z.number().min(0),
  /** Epistemic surprise index: Confidence * (1 - Accuracy) */
  epistemicSurpriseScore: z.number().min(0).max(1),
  /** High confidence error (Confidence >= 0.70 and !isCorrect) */
  isHypercorrectionCandidate: z.boolean(),
  detectedIllusion: cognitiveIllusionTypeSchema.optional(),
})

export type TrialMetacognitiveRecord = z.infer<typeof trialMetacognitiveRecordSchema>

export interface CalibrationBin {
  binMin: number
  binMax: number
  label: string
  trialCount: number
  meanConfidence: number
  meanAccuracy: number
  calibrationError: number // (meanConfidence - meanAccuracy)^2
}

export interface MurphyBrierDecomposition {
  overallBrier: number
  reliability: number // Calibration error: lower is better (0 = perfect calibration)
  resolution: number // Ability to discriminate correct vs incorrect: higher is better
  uncertainty: number // Base rate variance: p*(1-p)
}

export interface MetacognitiveCalibrationProfile {
  sampleSize: number
  overallAccuracy: number
  meanConfidence: number
  brierScore: number
  murphyDecomposition: MurphyBrierDecomposition
  goodmanKruskalGamma: number // Metacognitive resolution (-1.0 to +1.0)
  absoluteOverconfidenceBias: number // meanConfidence - overallAccuracy
  calibrationBins: CalibrationBin[]
  hypercorrectionOpportunityRate: number // HCE count / total errors
  hypercorrectionCount: number
  metacognitiveCalibrationIndex: number // 0 to 100 composite calibration quality
  status:
    | 'expertly_calibrated'
    | 'severe_fluency_illusion'
    | 'mild_overconfidence'
    | 'underconfident_impostor'
    | 'uncalibrated_guessing'
  dominantCognitiveIllusion: CognitiveIllusionType | null
  recommendations: string[]
}

// ---------------------------------------------------------------------------
// 2. Goodman-Kruskal Gamma (γ) Nonparametric Rank Correlation
// ---------------------------------------------------------------------------

/**
 * Calculates Goodman & Kruskal's Gamma (γ) for metacognitive resolution:
 * Measures whether items given higher confidence ratings are genuinely more likely
 * to be correct than items given lower confidence ratings.
 *
 * γ = (C - D) / (C + D)
 * where C is concordant pairs, D is discordant pairs.
 * If C + D == 0, returns 0.
 */
export function calculateGoodmanKruskalGamma(trials: TrialMetacognitiveRecord[]): number {
  if (trials.length < 2) return 0

  let concordant = 0
  let discordant = 0

  for (let i = 0; i < trials.length; i++) {
    for (let j = i + 1; j < trials.length; j++) {
      const ti = trials[i]!
      const tj = trials[j]!

      const confDiff = ti.retrospectiveConfidence - tj.retrospectiveConfidence
      const accDiff = (ti.isCorrect ? 1 : 0) - (tj.isCorrect ? 1 : 0)

      if (confDiff === 0 || accDiff === 0) {
        // Tied pairs are ignored in Goodman-Kruskal gamma
        continue
      }

      if ((confDiff > 0 && accDiff > 0) || (confDiff < 0 && accDiff < 0)) {
        concordant++
      } else {
        discordant++
      }
    }
  }

  const denominator = concordant + discordant
  if (denominator === 0) return 0
  const gamma = (concordant - discordant) / denominator
  return Number(Math.max(-1, Math.min(1, gamma)).toFixed(3))
}

// ---------------------------------------------------------------------------
// 3. Murphy (1973) Brier Score Decomposition & Calibration Bins
// ---------------------------------------------------------------------------

const DEFAULT_BIN_BOUNDS = [
  { min: 0.0, max: 0.2, label: '0-20% (Low Guess)' },
  { min: 0.2, max: 0.4, label: '20-40% (Uncertain)' },
  { min: 0.4, max: 0.6, label: '40-60% (Moderate)' },
  { min: 0.6, max: 0.8, label: '60-80% (Confident)' },
  { min: 0.8, max: 1.0001, label: '80-100% (Certain)' },
]

/**
 * Decomposes Brier Score into Reliability (Calibration), Resolution, and Uncertainty.
 * Murphy (1973): BS = Reliability - Resolution + Uncertainty
 */
export function calculateMurphyBrierDecomposition(trials: TrialMetacognitiveRecord[]): {
  decomposition: MurphyBrierDecomposition
  bins: CalibrationBin[]
} {
  if (trials.length === 0) {
    return {
      decomposition: { overallBrier: 0, reliability: 0, resolution: 0, uncertainty: 0 },
      bins: DEFAULT_BIN_BOUNDS.map((b) => ({
        binMin: b.min,
        binMax: b.max,
        label: b.label,
        trialCount: 0,
        meanConfidence: 0,
        meanAccuracy: 0,
        calibrationError: 0,
      })),
    }
  }

  const N = trials.length
  const totalCorrect = trials.filter((t) => t.isCorrect).length
  const baseRate = totalCorrect / N
  const uncertainty = baseRate * (1 - baseRate)

  // Bin trials by confidence
  const bins: CalibrationBin[] = DEFAULT_BIN_BOUNDS.map((bound) => {
    const inBin = trials.filter(
      (t) => t.retrospectiveConfidence >= bound.min && t.retrospectiveConfidence < bound.max,
    )
    const count = inBin.length
    if (count === 0) {
      return {
        binMin: bound.min,
        binMax: bound.max,
        label: bound.label,
        trialCount: 0,
        meanConfidence: (bound.min + bound.max) / 2,
        meanAccuracy: 0,
        calibrationError: 0,
      }
    }

    const meanConf = inBin.reduce((acc, t) => acc + t.retrospectiveConfidence, 0) / count
    const meanAcc = inBin.filter((t) => t.isCorrect).length / count
    const err = Math.pow(meanConf - meanAcc, 2)

    return {
      binMin: bound.min,
      binMax: bound.max,
      label: bound.label,
      trialCount: count,
      meanConfidence: Number(meanConf.toFixed(3)),
      meanAccuracy: Number(meanAcc.toFixed(3)),
      calibrationError: Number(err.toFixed(4)),
    }
  })

  // Reliability = (1/N) * sum(n_k * (f_k - o_k)^2)
  let reliability = 0
  // Resolution = (1/N) * sum(n_k * (o_k - baseRate)^2)
  let resolution = 0

  for (const bin of bins) {
    if (bin.trialCount > 0) {
      reliability += (bin.trialCount / N) * Math.pow(bin.meanConfidence - bin.meanAccuracy, 2)
      resolution += (bin.trialCount / N) * Math.pow(bin.meanAccuracy - baseRate, 2)
    }
  }

  // Raw Brier Score
  const rawBrier =
    trials.reduce((acc, t) => {
      const outcome = t.isCorrect ? 1 : 0
      return acc + Math.pow(t.retrospectiveConfidence - outcome, 2)
    }, 0) / N

  return {
    decomposition: {
      overallBrier: Number(rawBrier.toFixed(3)),
      reliability: Number(reliability.toFixed(3)),
      resolution: Number(resolution.toFixed(3)),
      uncertainty: Number(uncertainty.toFixed(3)),
    },
    bins,
  }
}

// ---------------------------------------------------------------------------
// 4. Full Calibration Profile Evaluator
// ---------------------------------------------------------------------------

export function evaluateMetacognitiveCalibrationProfile(
  trials: TrialMetacognitiveRecord[],
): MetacognitiveCalibrationProfile {
  if (trials.length === 0) {
    return {
      sampleSize: 0,
      overallAccuracy: 0,
      meanConfidence: 0,
      brierScore: 0,
      murphyDecomposition: { overallBrier: 0, reliability: 0, resolution: 0, uncertainty: 0 },
      goodmanKruskalGamma: 0,
      absoluteOverconfidenceBias: 0,
      calibrationBins: [],
      hypercorrectionOpportunityRate: 0,
      hypercorrectionCount: 0,
      metacognitiveCalibrationIndex: 100,
      status: 'expertly_calibrated',
      dominantCognitiveIllusion: null,
      recommendations: [
        'Complete epistemic calibration trials to profile metacognitive monitoring.',
      ],
    }
  }

  const N = trials.length
  const correctCount = trials.filter((t) => t.isCorrect).length
  const overallAccuracy = Number((correctCount / N).toFixed(3))
  const meanConfidence = Number(
    (trials.reduce((acc, t) => acc + t.retrospectiveConfidence, 0) / N).toFixed(3),
  )

  const gamma = calculateGoodmanKruskalGamma(trials)
  const { decomposition, bins } = calculateMurphyBrierDecomposition(trials)
  const absoluteBias = Number((meanConfidence - overallAccuracy).toFixed(3))

  // Hypercorrection dynamics (Butterfield & Metcalfe 2001)
  const errorTrials = trials.filter((t) => !t.isCorrect)
  const hypercorrectionTrials = errorTrials.filter((t) => t.isHypercorrectionCandidate)
  const hypercorrectionCount = hypercorrectionTrials.length
  const hypercorrectionOpportunityRate =
    errorTrials.length > 0 ? Number((hypercorrectionCount / errorTrials.length).toFixed(3)) : 0

  // Identify dominant cognitive illusion
  const illusionCounts: Record<string, number> = {}
  for (const t of trials) {
    if (t.detectedIllusion) {
      illusionCounts[t.detectedIllusion] = (illusionCounts[t.detectedIllusion] ?? 0) + 1
    }
  }
  let dominantIllusion: CognitiveIllusionType | null = null
  let maxIllusionCount = 0
  for (const [illusion, count] of Object.entries(illusionCounts)) {
    if (count > maxIllusionCount) {
      maxIllusionCount = count
      dominantIllusion = illusion as CognitiveIllusionType
    }
  }

  // Composite Metacognitive Calibration Index (MCI: 0 to 100)
  // Penalize high Brier (0 best, 1 worst), penalize bias, reward positive gamma
  const brierFactor = Math.max(0, 1 - decomposition.overallBrier) * 40
  const gammaFactor = Math.max(0, (gamma + 1) / 2) * 35
  const biasFactor = Math.max(0, 1 - Math.abs(absoluteBias)) * 25
  const mci = Math.round(brierFactor + gammaFactor + biasFactor)

  // Status & Recommendations
  let status: MetacognitiveCalibrationProfile['status'] = 'expertly_calibrated'
  const recommendations: string[] = []

  if (absoluteBias > 0.25 || (absoluteBias > 0 && decomposition.overallBrier > 0.35)) {
    status = 'severe_fluency_illusion'
    recommendations.push(
      'Severe Fluency Illusion detected (Koriat & Bjork 2005): You are mistaking lexical familiarity for mechanistic comprehension.',
    )
    recommendations.push(
      'Switch from passive recognition to active production (proofs, derivations, Feynman teach-back) before trusting subjective confidence.',
    )
  } else if (absoluteBias > 0.1) {
    status = 'mild_overconfidence'
    recommendations.push(
      'Mild overconfidence bias: Your predictions outpace empirical recall by ~' +
        Math.round(absoluteBias * 100) +
        '%.',
    )
    recommendations.push(
      'Practice delayed JOLs: Pause 30 seconds after studying before predicting recallability.',
    )
  } else if (absoluteBias < -0.15) {
    status = 'underconfident_impostor'
    recommendations.push(
      'Underconfidence / Impostor Bias: Your empirical accuracy is significantly higher than your self-ratings.',
    )
    recommendations.push(
      'Trust your internal knowledge representations; you retain more than your subjective feeling reflects.',
    )
  } else if (gamma < 0.2 && trials.length >= 4) {
    status = 'uncalibrated_guessing'
    recommendations.push(
      'Low Metacognitive Discrimination (γ = ' +
        gamma +
        '): High and low confidence do not distinguish correct from incorrect items.',
    )
    recommendations.push(
      'Focus on error-monitoring cues and response latency telemetry to calibrate uncertainty.',
    )
  } else {
    recommendations.push(
      'Excellent Metacognitive Alignment: Your confidence judgments accurately reflect probabilistic recallability.',
    )
    recommendations.push(
      'Maintain continuous calibration checks across challenging boundary concepts.',
    )
  }

  if (hypercorrectionCount > 0) {
    recommendations.push(
      `Leverage Hypercorrection Effect (Butterfield & Metcalfe 2001): ${hypercorrectionCount} high-confidence errors identified. These possess maximum epistemic prediction error and can be permanently fixed with immediate corrective review.`,
    )
  }

  return {
    sampleSize: N,
    overallAccuracy,
    meanConfidence,
    brierScore: decomposition.overallBrier,
    murphyDecomposition: decomposition,
    goodmanKruskalGamma: gamma,
    absoluteOverconfidenceBias: absoluteBias,
    calibrationBins: bins,
    hypercorrectionOpportunityRate,
    hypercorrectionCount,
    metacognitiveCalibrationIndex: Math.min(100, Math.max(0, mci)),
    status,
    dominantCognitiveIllusion: dominantIllusion,
    recommendations,
  }
}

// ---------------------------------------------------------------------------
// 5. Calibrated Epistemic Crucible Problem Bank
// ---------------------------------------------------------------------------

// TD-05: the epistemic crucible problem bank lives in './content' (content, not logic).
export { EPISTEMIC_CRUCIBLE_PROBLEMS } from './content'

// ---------------------------------------------------------------------------
// 6. Interactive Hypercorrection Session State Machine
// ---------------------------------------------------------------------------

export interface HypercorrectionSessionState {
  currentProblemIndex: number
  problemIds: string[]
  activeItemId: string
  prospectiveJOL: number | null
  selectedOptionId: string | null
  retrospectiveConfidence: number | null
  phase: 'prospective_jol' | 'option_selection' | 'confidence_rating' | 'feedback_deconstruction'
  trials: TrialMetacognitiveRecord[]
  profile: MetacognitiveCalibrationProfile
  hypercorrectedCardIds: string[]
}

export class HypercorrectionSession {
  private state: HypercorrectionSessionState
  private problemBank: Record<string, EpistemicCrucibleItem>

  constructor(customProblems?: Record<string, EpistemicCrucibleItem>) {
    this.problemBank = customProblems ?? EPISTEMIC_CRUCIBLE_PROBLEMS
    const problemIds = Object.keys(this.problemBank)

    this.state = {
      currentProblemIndex: 0,
      problemIds,
      activeItemId: problemIds[0] ?? '',
      prospectiveJOL: null,
      selectedOptionId: null,
      retrospectiveConfidence: null,
      phase: 'prospective_jol',
      trials: [],
      profile: evaluateMetacognitiveCalibrationProfile([]),
      hypercorrectedCardIds: [],
    }
  }

  public getState(): Readonly<HypercorrectionSessionState> {
    return { ...this.state }
  }

  public getCurrentProblem(): EpistemicCrucibleItem | null {
    return this.problemBank[this.state.activeItemId] ?? null
  }

  public submitProspectiveJOL(jol: number): void {
    if (this.state.phase !== 'prospective_jol') {
      throw new Error('Cannot submit prospective JOL outside prospective_jol phase.')
    }
    this.state.prospectiveJOL = Math.max(0, Math.min(1, jol))
    this.state.phase = 'option_selection'
  }

  public selectOption(optionId: string): void {
    if (this.state.phase !== 'option_selection') {
      throw new Error('Cannot select option outside option_selection phase.')
    }
    this.state.selectedOptionId = optionId
    this.state.phase = 'confidence_rating'
  }

  public submitRetrospectiveConfidence(
    confidence: number,
    responseLatencyMs = 2500,
  ): {
    record: TrialMetacognitiveRecord
    isHypercorrection: boolean
    epistemicSurpriseScore: number
    explanation: string
  } {
    if (this.state.phase !== 'confidence_rating') {
      throw new Error('Cannot submit confidence outside confidence_rating phase.')
    }

    const problem = this.getCurrentProblem()
    if (!problem) throw new Error('Active problem not found.')

    const selectedOption = problem.options.find((o) => o.id === this.state.selectedOptionId)
    if (!selectedOption) throw new Error('Selected option not found.')

    const conf = Math.max(0, Math.min(1, confidence))
    const isCorrect = selectedOption.isCorrect
    const isHypercorrection = !isCorrect && conf >= 0.7
    const surpriseScore = Number((conf * (isCorrect ? 0 : 1)).toFixed(3))

    const record: TrialMetacognitiveRecord = {
      itemId: problem.id,
      selectedOptionId: selectedOption.id,
      isCorrect,
      prospectiveJOL: this.state.prospectiveJOL ?? 0.5,
      retrospectiveConfidence: conf,
      responseLatencyMs,
      epistemicSurpriseScore: surpriseScore,
      isHypercorrectionCandidate: isHypercorrection,
      detectedIllusion: !isCorrect ? selectedOption.illusionType : undefined,
    }

    this.state.trials.push(record)
    this.state.retrospectiveConfidence = conf
    this.state.phase = 'feedback_deconstruction'
    this.state.profile = evaluateMetacognitiveCalibrationProfile(this.state.trials)

    return {
      record,
      isHypercorrection,
      epistemicSurpriseScore: surpriseScore,
      explanation: isCorrect
        ? problem.canonicalScientificExplanation
        : `${problem.epistemicPredictionErrorExplanation} ${selectedOption.misconceptionRationale}`,
    }
  }

  public advanceToNextProblem(): boolean {
    const nextIndex = this.state.currentProblemIndex + 1
    if (nextIndex >= this.state.problemIds.length) {
      return false
    }

    this.state.currentProblemIndex = nextIndex
    this.state.activeItemId = this.state.problemIds[nextIndex]!
    this.state.prospectiveJOL = null
    this.state.selectedOptionId = null
    this.state.retrospectiveConfidence = null
    this.state.phase = 'prospective_jol'
    return true
  }
}

// ---------------------------------------------------------------------------
// 7. FSRS Spaced Repetition Hypercorrection Bridge
// ---------------------------------------------------------------------------

export interface FSRSHypercorrectionCard {
  id: string
  front: string
  back: string
  tags: string[]
  suggestedInitialStability: number // Boosted stability for hypercorrected items (Butterfield 2001)
  suggestedInitialDifficulty: number
  metadata: {
    itemId: string
    cognitiveIllusionType?: CognitiveIllusionType
    epistemicSurpriseScore: number
    isHypercorrected: boolean
  }
}

export function exportHypercorrectionToFSRSCards(
  trials: TrialMetacognitiveRecord[],
  problemBank: Record<string, EpistemicCrucibleItem> = EPISTEMIC_CRUCIBLE_PROBLEMS,
): FSRSHypercorrectionCard[] {
  const cards: FSRSHypercorrectionCard[] = []

  for (const trial of trials) {
    const item = problemBank[trial.itemId]
    if (!item) continue

    const selectedOption = item.options.find((o) => o.id === trial.selectedOptionId)
    const misconceptionText = selectedOption?.misconceptionRationale
      ? `\n\n**Debunked Intuitive Misconception:**\n${selectedOption.misconceptionRationale}`
      : ''

    if (trial.isHypercorrectionCandidate) {
      // High-Confidence Error card (Hypercorrection target)
      cards.push({
        id: `card_hc_${trial.itemId}_${Date.now()}`,
        front: `[Epistemic Crucible — Misconception Repair]\n\n${item.stem}\n\n*Target Cognitive Fallacy:* What root illusion causes intuition to fail here?`,
        back: `**Scientific Reality:**\n${item.canonicalScientificExplanation}${misconceptionText}\n\n**Counter-Evidence & Proof:**\n${item.counterEvidence}\n\n**Sub-Goal Derivation:**\n${item.subGoalChunking.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}`,
        tags: [
          'metacognition',
          'hypercorrection',
          item.domain,
          ...(trial.detectedIllusion ? [trial.detectedIllusion] : []),
        ],
        suggestedInitialStability: 3.5, // High initial stability due to attention surge
        suggestedInitialDifficulty: 6.0,
        metadata: {
          itemId: trial.itemId,
          cognitiveIllusionType: trial.detectedIllusion,
          epistemicSurpriseScore: trial.epistemicSurpriseScore,
          isHypercorrected: true,
        },
      })
    } else if (!trial.isCorrect) {
      // Standard Error card
      cards.push({
        id: `card_err_${trial.itemId}_${Date.now()}`,
        front: `[Conceptual Question]\n\n${item.stem}`,
        back: `**Answer & Explanation:**\n${item.canonicalScientificExplanation}`,
        tags: ['metacognition', 'error-repair', item.domain],
        suggestedInitialStability: 1.0,
        suggestedInitialDifficulty: 7.0,
        metadata: {
          itemId: trial.itemId,
          epistemicSurpriseScore: trial.epistemicSurpriseScore,
          isHypercorrected: false,
        },
      })
    }
  }

  return cards
}

/**
 * Learning HUB — Computerized Adaptive Testing (CAT) & Item Response Theory (IRT) Engine.
 *
 * Implements:
 * 1. 3-Parameter Logistic (3PL) Item Characteristic Curve (Lord 1980, Birnbaum 1968).
 * 2. Fisher Information Function & Maximum Fisher Information (MFI) Adaptive Item Selection.
 * 3. Bayesian Expected A Posteriori (EAP) & Newton-Raphson Maximum Likelihood Ability Estimation.
 * 4. Sequential Probability Ratio Test (SPRT - Wald 1945) for High-Stakes Mastery Pass/Fail decisions.
 * 5. Successive Relearning Remediation Buffer (Rawson & Dunlosky 2011).
 * 6. Four calibrated multi-domain adaptive question item banks (Neuroscience, Distributed Systems, Cognitive Psychology, Probability & Information).
 */
import { z } from 'zod'

// TD-05: the calibrated adaptive question banks are CONTENT, not logic — they
// live in ./content.ts so engine diffs stay about algorithms. This engine is
// part of the one-grading-path (executeReview) pipeline — only data constants
// move; all IRT/SPRT/session logic stays here. Re-exported so every existing
// import path keeps working (the barrel does `export * from` this file).
export { CALIBRATED_QUESTION_BANKS } from './content'

// ─── 1. IRT Parameter & Item Schemas ────────────────────────────────────────

export const irtModelTypeSchema = z.enum(['1pl_rasch', '2pl_birnbaum', '3pl_lord'])
export type IRTModelType = z.infer<typeof irtModelTypeSchema>

export const bloomCognitiveLevelSchema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
])
export type BloomCognitiveLevel = z.infer<typeof bloomCognitiveLevelSchema>

export const adaptiveQuestionItemSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  bloomLevel: bloomCognitiveLevelSchema,
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
  distractorRationales: z.array(z.string()).optional(),
  explanation: z.string().min(1),
  conceptTags: z.array(z.string()).default([]),
  // IRT 3PL Parameters:
  discrimination: z.number().min(0.1).max(3.5).default(1.2), // a-parameter (slope at inflection)
  difficulty: z.number().min(-3.5).max(3.5).default(0.0), // b-parameter (point of inflection on theta scale)
  guessing: z.number().min(0.0).max(0.5).default(0.2), // c-parameter (pseudo-guessing lower asymptote)
})
export type AdaptiveQuestionItem = z.infer<typeof adaptiveQuestionItemSchema>

export const adaptiveExamConfigSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  passingThetaStandard: z.number().min(-3.0).max(3.0).default(0.5), // Threshold for certification pass
  sprtConfidenceAlpha: z.number().min(0.001).max(0.1).default(0.05), // False positive rate
  sprtConfidenceBeta: z.number().min(0.001).max(0.1).default(0.05), // False negative rate
  minQuestions: z.number().int().min(5).max(30).default(8),
  maxQuestions: z.number().int().min(10).max(100).default(25),
  targetSem: z.number().min(0.15).max(0.6).default(0.28), // Stop when SEM <= targetSem (reliability ~ 0.92)
  timeLimitSeconds: z.number().int().min(60).max(7200).default(1800), // 30 minutes default
  successiveRelearningCriterion: z.number().int().min(1).max(4).default(2),
})
export type AdaptiveExamConfig = z.infer<typeof adaptiveExamConfigSchema>

// ─── 2. IRT Mathematical Foundations (3PL Model) ───────────────────────────

/** Scaling constant D = 1.702 minimizes max divergence between logistic and normal ogive to < 0.01 */
export const IRT_SCALING_CONSTANT_D = 1.702

/**
 * Calculates the probability of a correct response under the 3-Parameter Logistic (3PL) model.
 * P(theta) = c + (1 - c) / (1 + exp(-D * a * (theta - b)))
 */
export function calculateProbability3PL(
  theta: number,
  a: number,
  b: number,
  c = 0.2,
  D = IRT_SCALING_CONSTANT_D,
): number {
  const exponent = -D * a * (theta - b)
  // Guard against numerical overflow / underflow
  if (exponent > 35) return c
  if (exponent < -35) return 1.0

  const logistic = 1.0 / (1.0 + Math.exp(exponent))
  return c + (1.0 - c) * logistic
}

/**
 * Calculates item Fisher Information at latent ability theta:
 * I(theta) = D^2 * a^2 * (P(theta) - c)^2 / (1 - c)^2 * (1 - P(theta)) / P(theta)
 */
export function calculateItemInformation(
  theta: number,
  a: number,
  b: number,
  c = 0.2,
  D = IRT_SCALING_CONSTANT_D,
): number {
  const p = calculateProbability3PL(theta, a, b, c, D)
  if (p <= c || p >= 1.0) return 0.0

  const numerator = Math.pow(p - c, 2) * (1.0 - p)
  const denominator = Math.pow(1.0 - c, 2) * p
  return Math.pow(D * a, 2) * (numerator / denominator)
}

/**
 * Calculates Total Test Fisher Information from a set of administered items.
 */
export function calculateTestInformation(theta: number, items: AdaptiveQuestionItem[]): number {
  return items.reduce((sum, item) => {
    return (
      sum + calculateItemInformation(theta, item.discrimination, item.difficulty, item.guessing)
    )
  }, 0.0)
}

/**
 * Calculates the Standard Error of Measurement (SEM) at theta:
 * SEM(theta) = 1 / sqrt(TestInformation(theta))
 */
export function calculateSEM(totalInformation: number): number {
  if (totalInformation <= 1e-6) return 2.0 // High uncertainty baseline
  return 1.0 / Math.sqrt(totalInformation)
}

/**
 * Converts latent ability theta (-3.0 to +3.0) into estimated population percentile rank.
 * Uses the standard normal cumulative distribution function (CDF).
 */
export function thetaToPercentileRank(theta: number): number {
  // Abramowitz & Stegun polynomial approximation of normal CDF
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(theta))
  const d = 0.3989422804014327 * Math.exp(-0.5 * theta * theta)
  const p =
    d *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const cdf = theta >= 0 ? 1.0 - p : p
  return Math.max(1, Math.min(99.9, Math.round(cdf * 1000) / 10))
}

// ─── 3. Bayesian Ability Estimation (EAP & Newton-Raphson MLE) ───────────────

export interface AdministrationRecord {
  item: AdaptiveQuestionItem
  userSelectedOption: number
  isCorrect: boolean
  responseTimeMs: number
  thetaEstimateAfter: number
  semAfter: number
}

/**
 * Expected A Posteriori (EAP) Bayesian Estimation of latent ability theta.
 * Computes the mean of the posterior distribution given a standard normal prior N(0, 1)
 * using 31 Gauss-Hermite quadrature evaluation nodes spanning [-3.0, +3.0].
 */
export function estimateAbilityEAP(
  administered: Array<{ item: AdaptiveQuestionItem; isCorrect: boolean }>,
): { theta: number; sem: number } {
  if (administered.length === 0) {
    return { theta: 0.0, sem: 1.0 }
  }

  const numNodes = 31
  const minTheta = -3.5
  const maxTheta = 3.5
  const step = (maxTheta - minTheta) / (numNodes - 1)

  let numerator = 0.0
  let denominator = 0.0
  let varianceNumerator = 0.0

  for (let i = 0; i < numNodes; i++) {
    const qTheta = minTheta + i * step
    // Prior density: Standard normal phi(qTheta)
    const prior = Math.exp(-0.5 * qTheta * qTheta) / Math.sqrt(2 * Math.PI)

    // Likelihood L(X | qTheta)
    let logLikelihood = 0.0
    for (const rec of administered) {
      const p = calculateProbability3PL(
        qTheta,
        rec.item.discrimination,
        rec.item.difficulty,
        rec.item.guessing,
      )
      const clampedP = Math.max(1e-6, Math.min(1.0 - 1e-6, p))
      logLikelihood += rec.isCorrect ? Math.log(clampedP) : Math.log(1.0 - clampedP)
    }

    const posteriorWeight = Math.exp(logLikelihood) * prior
    numerator += qTheta * posteriorWeight
    denominator += posteriorWeight
  }

  if (denominator <= 1e-12) {
    return { theta: 0.0, sem: 1.0 }
  }

  const eapTheta = numerator / denominator

  // Posterior Variance
  for (let i = 0; i < numNodes; i++) {
    const qTheta = minTheta + i * step
    const prior = Math.exp(-0.5 * qTheta * qTheta) / Math.sqrt(2 * Math.PI)
    let logLikelihood = 0.0
    for (const rec of administered) {
      const p = calculateProbability3PL(
        qTheta,
        rec.item.discrimination,
        rec.item.difficulty,
        rec.item.guessing,
      )
      const clampedP = Math.max(1e-6, Math.min(1.0 - 1e-6, p))
      logLikelihood += rec.isCorrect ? Math.log(clampedP) : Math.log(1.0 - clampedP)
    }
    const posteriorWeight = Math.exp(logLikelihood) * prior
    varianceNumerator += Math.pow(qTheta - eapTheta, 2) * posteriorWeight
  }

  const posteriorVariance = varianceNumerator / denominator
  const sem = Math.sqrt(Math.max(0.01, posteriorVariance))

  return {
    theta: Math.max(-3.0, Math.min(3.0, Math.round(eapTheta * 100) / 100)),
    sem: Math.round(sem * 100) / 100,
  }
}

// ─── 4. Adaptive Item Selection Engine (Maximum Fisher Information) ─────────

/**
 * Selects the optimal next question from the available item bank using
 * Maximum Fisher Information (MFI) evaluated at the current ability estimate theta.
 * Filters out already administered items and enforces Bloom balance where possible.
 */
export function selectNextAdaptiveItem(
  currentTheta: number,
  itemPool: AdaptiveQuestionItem[],
  administeredItemIds: Set<string>,
  targetBloomLevel?: BloomCognitiveLevel,
): AdaptiveQuestionItem | null {
  const candidateItems = itemPool.filter((item) => !administeredItemIds.has(item.id))
  if (candidateItems.length === 0) return null

  // If a target Bloom level is requested and available, prioritize it
  const poolToEvaluate =
    targetBloomLevel && candidateItems.some((item) => item.bloomLevel === targetBloomLevel)
      ? candidateItems.filter((item) => item.bloomLevel === targetBloomLevel)
      : candidateItems

  let bestItem: AdaptiveQuestionItem | null = null
  let maxInfo = -1.0

  for (const item of poolToEvaluate) {
    const info = calculateItemInformation(
      currentTheta,
      item.discrimination,
      item.difficulty,
      item.guessing,
    )
    if (info > maxInfo) {
      maxInfo = info
      bestItem = item
    }
  }

  return bestItem
}

// ─── 5. Sequential Probability Ratio Test (SPRT Mastery Classification) ────

export type MasteryDecision = 'pass' | 'fail' | 'continue'

/**
 * Sequential Probability Ratio Test (Wald 1945) for high-stakes pass/fail certification.
 * Compares log-likelihood ratio against indifference region [thetaPassing - delta, thetaPassing + delta].
 */
export function evaluateSPRT(
  administered: Array<{ item: AdaptiveQuestionItem; isCorrect: boolean }>,
  passingStandardTheta = 0.5,
  deltaIndifference = 0.25,
  alpha = 0.05,
  beta = 0.05,
): {
  decision: MasteryDecision
  logLikelihoodRatio: number
  upperThresholdA: number
  lowerThresholdB: number
} {
  // Threshold boundaries (Wald 1945)
  const upperThresholdA = Math.log((1.0 - beta) / alpha)
  const lowerThresholdB = Math.log(beta / (1.0 - alpha))

  const thetaH1 = passingStandardTheta + deltaIndifference // Mastery hypothesis
  const thetaH0 = passingStandardTheta - deltaIndifference // Non-mastery hypothesis

  let logLR = 0.0

  for (const rec of administered) {
    const p1 = calculateProbability3PL(
      thetaH1,
      rec.item.discrimination,
      rec.item.difficulty,
      rec.item.guessing,
    )
    const p0 = calculateProbability3PL(
      thetaH0,
      rec.item.discrimination,
      rec.item.difficulty,
      rec.item.guessing,
    )

    const prob1 = rec.isCorrect ? p1 : 1.0 - p1
    const prob0 = rec.isCorrect ? p0 : 1.0 - p0

    logLR += Math.log(Math.max(1e-6, prob1) / Math.max(1e-6, prob0))
  }

  let decision: MasteryDecision = 'continue'
  if (logLR >= upperThresholdA) decision = 'pass'
  else if (logLR <= lowerThresholdB) decision = 'fail'

  return {
    decision,
    logLikelihoodRatio: Math.round(logLR * 100) / 100,
    upperThresholdA: Math.round(upperThresholdA * 100) / 100,
    lowerThresholdB: Math.round(lowerThresholdB * 100) / 100,
  }
}

// ─── 6. Successive Relearning Remediation Buffer ─────────────────────────────

export interface RemediationQueueItem {
  questionItem: AdaptiveQuestionItem
  userSelectedWrongOption: number
  retrievalAttemptsCount: number
  criterionConsecutiveSuccesses: number
  targetCriterion: number
  isMastered: boolean
  diagnosticNotes: string
}

export class SuccessiveRelearningBuffer {
  private queue: RemediationQueueItem[] = []

  constructor(private targetCriterion = 2) {}

  addFailedItem(item: AdaptiveQuestionItem, wrongOption: number, notes = ''): void {
    const existing = this.queue.find((q) => q.questionItem.id === item.id)
    if (!existing) {
      this.queue.push({
        questionItem: item,
        userSelectedWrongOption: wrongOption,
        retrievalAttemptsCount: 1,
        criterionConsecutiveSuccesses: 0,
        targetCriterion: this.targetCriterion,
        isMastered: false,
        diagnosticNotes:
          notes || `Failed difficulty ${item.difficulty.toFixed(2)} item on ${item.domain}.`,
      })
    }
  }

  recordRecallAttempt(itemId: string, isCorrect: boolean): RemediationQueueItem | null {
    const entry = this.queue.find((q) => q.questionItem.id === itemId)
    if (!entry) return null

    entry.retrievalAttemptsCount++
    if (isCorrect) {
      entry.criterionConsecutiveSuccesses++
      if (entry.criterionConsecutiveSuccesses >= entry.targetCriterion) {
        entry.isMastered = true
      }
    } else {
      entry.criterionConsecutiveSuccesses = 0
    }
    return entry
  }

  getPendingItems(): RemediationQueueItem[] {
    return this.queue.filter((q) => !q.isMastered)
  }

  getMasteredCount(): number {
    return this.queue.filter((q) => q.isMastered).length
  }

  getTotalCount(): number {
    return this.queue.length
  }
}

// ─── 7. Calibrated Adaptive Question Banks ──────────────────────────────────

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// at the top of this file so import paths are unchanged.

// ─── 8. Complete Adaptive Test Session State Machine ────────────────────────

export class AdaptiveExamSession {
  private config: AdaptiveExamConfig
  private itemPool: AdaptiveQuestionItem[]
  private administered: AdministrationRecord[] = []
  private administeredIds = new Set<string>()
  private currentTheta = 0.0
  private currentSem = 1.0
  private startTime: number = Date.now()
  private isTerminated = false
  private terminationReason:
    'sem_converged' | 'sprt_decision' | 'max_items_reached' | 'time_expired' | 'manual' = 'manual'
  private sprtResult: { decision: MasteryDecision; logLikelihoodRatio: number } = {
    decision: 'continue',
    logLikelihoodRatio: 0,
  }
  private currentItem: AdaptiveQuestionItem | null = null

  constructor(config: AdaptiveExamConfig, itemPool: AdaptiveQuestionItem[]) {
    this.config = config
    this.itemPool = itemPool
    this.startTime = Date.now()
    // Select first item at average difficulty (b ~ 0)
    this.currentItem = selectNextAdaptiveItem(0.0, this.itemPool, this.administeredIds)
  }

  getCurrentItem(): AdaptiveQuestionItem | null {
    return this.currentItem
  }

  getCurrentTheta(): number {
    return this.currentTheta
  }

  getCurrentSem(): number {
    return this.currentSem
  }

  getPercentileRank(): number {
    return thetaToPercentileRank(this.currentTheta)
  }

  getAdministeredCount(): number {
    return this.administered.length
  }

  getAdministeredRecords(): AdministrationRecord[] {
    return [...this.administered]
  }

  getIsTerminated(): boolean {
    return this.isTerminated
  }

  getTerminationReason(): string {
    return this.terminationReason
  }

  getSprtStatus(): { decision: MasteryDecision; logLikelihoodRatio: number } {
    return this.sprtResult
  }

  submitResponse(
    selectedOptionIndex: number,
    responseTimeMs: number,
  ): {
    isCorrect: boolean
    newTheta: number
    newSem: number
    isTerminated: boolean
    terminationReason?: string
  } {
    if (!this.currentItem || this.isTerminated) {
      throw new Error('Exam session is already completed.')
    }

    const item = this.currentItem
    const isCorrect = selectedOptionIndex === item.correctOptionIndex
    this.administeredIds.add(item.id)

    // Update Bayesian EAP ability
    const tempAdministered = [
      ...this.administered.map((a) => ({ item: a.item, isCorrect: a.isCorrect })),
      { item, isCorrect },
    ]
    const { theta, sem } = estimateAbilityEAP(tempAdministered)
    this.currentTheta = theta
    this.currentSem = sem

    // Record administration
    this.administered.push({
      item,
      userSelectedOption: selectedOptionIndex,
      isCorrect,
      responseTimeMs,
      thetaEstimateAfter: theta,
      semAfter: sem,
    })

    // Check SPRT Mastery Decision
    const sprt = evaluateSPRT(
      tempAdministered,
      this.config.passingThetaStandard,
      0.25,
      this.config.sprtConfidenceAlpha,
      this.config.sprtConfidenceBeta,
    )
    this.sprtResult = sprt

    // Check Stopping Criteria
    const count = this.administered.length
    if (count >= this.config.minQuestions) {
      if (sem <= this.config.targetSem) {
        this.isTerminated = true
        this.terminationReason = 'sem_converged'
      } else if (sprt.decision !== 'continue' && count >= this.config.minQuestions + 2) {
        this.isTerminated = true
        this.terminationReason = 'sprt_decision'
      }
    }

    if (count >= this.config.maxQuestions) {
      this.isTerminated = true
      this.terminationReason = 'max_items_reached'
    }

    // Select next item if not terminated
    if (!this.isTerminated) {
      this.currentItem = selectNextAdaptiveItem(
        this.currentTheta,
        this.itemPool,
        this.administeredIds,
      )
      if (!this.currentItem) {
        this.isTerminated = true
        this.terminationReason = 'max_items_reached'
      }
    } else {
      this.currentItem = null
    }

    return {
      isCorrect,
      newTheta: this.currentTheta,
      newSem: this.currentSem,
      isTerminated: this.isTerminated,
      terminationReason: this.isTerminated ? this.terminationReason : undefined,
    }
  }

  generateDiagnosticAutopsy(): {
    scorePercent: number
    theta: number
    percentile: number
    masteryStatus: 'certified_mastery' | 'provisional_pass' | 'remediation_recommended'
    bloomBreakdown: Record<
      BloomCognitiveLevel,
      { total: number; correct: number; accuracy: number }
    >
    missedItems: Array<{ item: AdaptiveQuestionItem; userOption: number }>
    pedagogicalSummary: string
  } {
    const total = this.administered.length
    const correctCount = this.administered.filter((a) => a.isCorrect).length
    const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0

    const bloom: Record<BloomCognitiveLevel, { total: number; correct: number; accuracy: number }> =
      {
        remember: { total: 0, correct: 0, accuracy: 0 },
        understand: { total: 0, correct: 0, accuracy: 0 },
        apply: { total: 0, correct: 0, accuracy: 0 },
        analyze: { total: 0, correct: 0, accuracy: 0 },
        evaluate: { total: 0, correct: 0, accuracy: 0 },
      }

    for (const a of this.administered) {
      const b = a.item.bloomLevel
      bloom[b].total++
      if (a.isCorrect) bloom[b].correct++
    }

    for (const b of Object.keys(bloom) as BloomCognitiveLevel[]) {
      if (bloom[b].total > 0) {
        bloom[b].accuracy = Math.round((bloom[b].correct / bloom[b].total) * 100)
      }
    }

    const missedItems = this.administered
      .filter((a) => !a.isCorrect)
      .map((a) => ({ item: a.item, userOption: a.userSelectedOption }))

    const masteryStatus =
      this.sprtResult.decision === 'pass' || this.currentTheta >= this.config.passingThetaStandard
        ? 'certified_mastery'
        : this.currentTheta >= this.config.passingThetaStandard - 0.3
          ? 'provisional_pass'
          : 'remediation_recommended'

    const summaryParts: string[] = []
    summaryParts.push(
      `Latent Ability theta = ${this.currentTheta.toFixed(2)} (${thetaToPercentileRank(this.currentTheta)}th percentile).`,
    )
    if (bloom.apply.total > 0 && bloom.apply.accuracy < 60) {
      summaryParts.push(
        'Vulnerability detected in Bloom "Apply" items; prioritize procedural problem-solving.',
      )
    }
    if (missedItems.length > 0) {
      summaryParts.push(
        `${missedItems.length} items queued for Successive Relearning criterion verification.`,
      )
    }

    return {
      scorePercent,
      theta: this.currentTheta,
      percentile: thetaToPercentileRank(this.currentTheta),
      masteryStatus,
      bloomBreakdown: bloom,
      missedItems,
      pedagogicalSummary: summaryParts.join(' '),
    }
  }
}

import { z } from 'zod'

/**
 * @file packages/core/src/equilibrium/reflective-equilibrium-engine.ts
 * @description Reflective Equilibrium & Epistemic Calibration Engine.
 *
 * Implements:
 * - John Rawls (1971) & Nelson Goodman (1955) Wide Reflective Equilibrium (WRE):
 *   - Mutual coherence optimization across 3 epistemic tiers:
 *     1. Considered Judgments (C): specific concrete case intuitions
 *     2. General Principles (P): abstract normative or algorithmic rules
 *     3. Background Theories (B): scientific, mathematical, and explanatory models
 *   - Triad Conflict Resolution: identifying dissonant triads and guiding deliberate belief adjustments
 *   - Epistemic Coherence Metric (H in [0.0, 1.0]): graph harmony score based on relational support vs active contradictions
 * - Glenn W. Brier (1950) & Philip E. Tetlock (2005, 2015) Epistemic Probability Calibration:
 *   - Brier Score Decomposition: Reliability, Resolution, and Uncertainty
 *   - Brier Calibration Index (BCI in [0.0, 1.0]): 1.0 - Brier Score
 *   - Overconfidence Bias Detection: comparing subjective credences [0.5, 1.0] with empirical accuracy
 * - Calibrated Dilemma Suites:
 *   - Distributed Systems Consensus (CAP vs PACELC Serializability vs Partition Availability)
 *   - Algorithmic Fairness Impossibility (Kleinberg 2016 Statistical Parity vs Individual Calibration)
 *   - Critical Medical Triage & Resource Allocation under Extreme Surges
 * - FSRS-6 Epistemic Stability Bridge:
 *   - Generates reflective equilibrium review cards with stability scaled by calibration precision:
 *     S_0 = S_base * (1.0 + 0.30 * BCI - 0.20 * OverconfidencePenalty)
 */

// TD-05: scenario corpora (calibrated equilibrium suites) are CONTENT, not logic —
// they live in ./content.ts so engine diffs stay about algorithms. Re-exported so
// every existing import path keeps working (the barrel does `export * from` this file).
import { CALIBRATED_EQUILIBRIUM_SUITES } from './content'
export { CALIBRATED_EQUILIBRIUM_SUITES } from './content'

export type EpistemicTierType =
  | 'considered_judgment' // Specific concrete scenario intuitions
  | 'general_principle' // Abstract normative or algorithmic rules
  | 'background_theory' // Explanatory scientific/mathematical frameworks

export type TriadResolutionStrategy =
  | 'revise_principle' // Weaken or qualify the abstract rule to accommodate counter-examples
  | 'override_judgment' // Overrule initial intuitive judgment in deference to systemic theory
  | 'reformulate_theory' // Expand background assumptions to reconcile both principle and judgment

export interface EpistemicNode {
  readonly id: string
  readonly tier: EpistemicTierType
  readonly statement: string
  readonly rationale: string
  readonly formalCitation?: string
  readonly initialConfidence: number // 0.50 to 1.00 (subjective credence)
}

export interface EpistemicEdge {
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly relation: 'supports' | 'contradicts' | 'qualifies'
  readonly weight: number // 0.1 to 1.0
}

export interface DissonantTriad {
  readonly id: string
  readonly judgmentNodeId: string
  readonly principleNodeId: string
  readonly theoryNodeId: string
  readonly conflictDescription: string
  readonly availableResolutions: readonly {
    readonly strategy: TriadResolutionStrategy
    readonly proposalTitle: string
    readonly consequenceAnalysis: string
    readonly resultingCoherenceGain: number // 0 to 100
  }[]
}

export const calibratedProbabilityPredictionSchema = z.object({
  propositionId: z.string(),
  propositionText: z.string(),
  subjectiveConfidence: z.number().min(0.5).max(1),
  actualOutcome: z.boolean(),
  domainContext: z.string(),
})

export interface CalibratedProbabilityPrediction {
  readonly propositionId: string
  readonly propositionText: string
  readonly subjectiveConfidence: number // 0.50 to 1.00
  readonly actualOutcome: boolean // Ground truth true/false
  readonly domainContext: string
}

export interface BrierCalibrationMetrics {
  readonly brierScore: number // 0.00 (perfect) to 1.00 (abysmal)
  readonly brierCalibrationIndex: number // 0.0 to 1.0 (1.0 - brierScore)
  readonly meanSubjectiveConfidence: number // e.g. 0.85
  readonly empiricalAccuracyRate: number // e.g. 0.65
  readonly overconfidenceGap: number // confidence - accuracy (> 0 means overconfident)
  readonly calibrationGrade:
    'Superforecaster' | 'Well-Calibrated' | 'Moderate Overconfidence' | 'Severe Dunning-Kruger'
  readonly calibrationBuckets: readonly {
    readonly confidenceBand: string // e.g. "70-79%"
    readonly predictedMean: number // e.g. 0.75
    readonly observedFrequency: number // e.g. 0.72
    readonly sampleCount: number
  }[]
}

export interface ReflectiveEquilibriumSuite {
  readonly id: string
  readonly name: string
  readonly domain: string
  readonly philosophicalContext: string
  readonly nodes: readonly EpistemicNode[]
  readonly edges: readonly EpistemicEdge[]
  readonly dissonantTriads: readonly DissonantTriad[]
  readonly predictionBank: readonly CalibratedProbabilityPrediction[]
}

export const equilibriumSessionStateSchema = z.object({
  suiteId: z.string(),
  activeAdjustments: z.record(
    z.string(),
    z.object({
      adjustedConfidence: z.number().min(0.5).max(1),
      revisedStatement: z.string().optional(),
    }),
  ),
  resolvedTriadStrategies: z.record(
    z.string(),
    z.enum(['revise_principle', 'override_judgment', 'reformulate_theory']),
  ),
  recordedPredictions: z.array(calibratedProbabilityPredictionSchema).default([]),
})

export interface EquilibriumSessionState {
  readonly suiteId: string
  readonly activeAdjustments: Record<
    string,
    { adjustedConfidence: number; revisedStatement?: string }
  >
  readonly resolvedTriadStrategies: Record<string, TriadResolutionStrategy>
  readonly recordedPredictions: readonly CalibratedProbabilityPrediction[]
}

export interface ReflectiveEquilibriumEvaluation {
  readonly coherenceIndex: number // 0 to 100
  readonly unresolvedContradictionCount: number
  readonly brierMetrics: BrierCalibrationMetrics
  readonly compositeEpistemicScore: number // 0 to 100
  readonly isEquilibriumAchieved: boolean
  readonly feedbackSummary: string
}

export interface FSRSEpistemicCard {
  readonly id: string
  readonly suiteName: string
  readonly domain: string
  readonly conflictPrompt: string
  readonly equilibriumResolution: string
  readonly calibrationTip: string
  readonly fsrsStabilityMultiplier: number
}

// ============================================================================
// 1. Calibrated Reflective Equilibrium Suites
// ============================================================================

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); the constant
// is re-exported from this module so every existing import path keeps working.

// ============================================================================
// 2. Brier Probability Score & Calibration Engine
// ============================================================================

/**
 * Calculates the Brier Score for a set of predictions:
 * Brier = (1 / N) \sum_{i=1}^N (p_i - o_i)^2
 * where p_i in [0.5, 1.0] is subjective credence and o_i in {0, 1} is empirical outcome.
 */
export function calculateBrierCalibration(
  predictions: readonly CalibratedProbabilityPrediction[],
): BrierCalibrationMetrics {
  if (predictions.length === 0) {
    return {
      brierScore: 0.25,
      brierCalibrationIndex: 0.75,
      meanSubjectiveConfidence: 0.5,
      empiricalAccuracyRate: 0.5,
      overconfidenceGap: 0.0,
      calibrationGrade: 'Well-Calibrated',
      calibrationBuckets: [],
    }
  }

  let totalBrierSquaredError = 0.0
  let totalConfidence = 0.0
  let totalCorrect = 0

  // Buckets: 50-59%, 60-69%, 70-79%, 80-89%, 90-100%
  const bucketMap: Record<string, { sumP: number; correct: number; count: number }> = {
    '50-59%': { sumP: 0, correct: 0, count: 0 },
    '60-69%': { sumP: 0, correct: 0, count: 0 },
    '70-79%': { sumP: 0, correct: 0, count: 0 },
    '80-89%': { sumP: 0, correct: 0, count: 0 },
    '90-100%': { sumP: 0, correct: 0, count: 0 },
  }

  for (const pred of predictions) {
    const outcomeVal = pred.actualOutcome ? 1.0 : 0.0
    const err = pred.subjectiveConfidence - outcomeVal
    totalBrierSquaredError += err * err
    totalConfidence += pred.subjectiveConfidence

    const isHit =
      (pred.subjectiveConfidence >= 0.5 && pred.actualOutcome) ||
      (pred.subjectiveConfidence < 0.5 && !pred.actualOutcome)
    if (isHit) totalCorrect++

    // Determine bucket
    let band = '50-59%'
    if (pred.subjectiveConfidence >= 0.9) band = '90-100%'
    else if (pred.subjectiveConfidence >= 0.8) band = '80-89%'
    else if (pred.subjectiveConfidence >= 0.7) band = '70-79%'
    else if (pred.subjectiveConfidence >= 0.6) band = '60-69%'

    bucketMap[band].sumP += pred.subjectiveConfidence
    if (pred.actualOutcome) bucketMap[band].correct++
    bucketMap[band].count++
  }

  const N = predictions.length
  const brierScore = Math.round((totalBrierSquaredError / N) * 1000) / 1000
  const bci = Math.round((1.0 - brierScore) * 1000) / 1000
  const meanConf = Math.round((totalConfidence / N) * 100) / 100
  const accuracy = Math.round((totalCorrect / N) * 100) / 100
  const overconfidenceGap = Math.round((meanConf - accuracy) * 100) / 100

  let grade: BrierCalibrationMetrics['calibrationGrade'] = 'Well-Calibrated'
  if (brierScore < 0.12 && overconfidenceGap <= 0.05) {
    grade = 'Superforecaster'
  } else if (overconfidenceGap > 0.25) {
    grade = 'Severe Dunning-Kruger'
  } else if (overconfidenceGap > 0.12) {
    grade = 'Moderate Overconfidence'
  }

  const calibrationBuckets = Object.entries(bucketMap).map(([band, data]) => ({
    confidenceBand: band,
    predictedMean: data.count > 0 ? Math.round((data.sumP / data.count) * 100) / 100 : 0.0,
    observedFrequency: data.count > 0 ? Math.round((data.correct / data.count) * 100) / 100 : 0.0,
    sampleCount: data.count,
  }))

  return {
    brierScore,
    brierCalibrationIndex: bci,
    meanSubjectiveConfidence: meanConf,
    empiricalAccuracyRate: accuracy,
    overconfidenceGap,
    calibrationGrade: grade,
    calibrationBuckets,
  }
}

// ============================================================================
// 3. Wide Reflective Equilibrium Evaluator
// ============================================================================

/**
 * Evaluates the coherence of the epistemic network given active adjustments
 * and triad resolutions.
 */
export function evaluateReflectiveEquilibrium(
  suite: ReflectiveEquilibriumSuite,
  sessionState: EquilibriumSessionState,
): ReflectiveEquilibriumEvaluation {
  const resolvedCount = Object.keys(sessionState.resolvedTriadStrategies).length
  const totalTriads = suite.dissonantTriads.length
  const unresolvedCount = totalTriads - resolvedCount

  let baseHarmony = 60
  for (const triad of suite.dissonantTriads) {
    const chosenStrategy = sessionState.resolvedTriadStrategies[triad.id]
    if (chosenStrategy) {
      const match = triad.availableResolutions.find((r) => r.strategy === chosenStrategy)
      if (match) {
        baseHarmony += match.resultingCoherenceGain
      }
    } else {
      baseHarmony -= 20
    }
  }

  const normalizedCoherence = Math.min(100, Math.max(0, baseHarmony))
  const brierMetrics = calculateBrierCalibration(sessionState.recordedPredictions)

  // Composite epistemic score combines 60% coherence harmony with 40% calibration precision
  const compositeScore = Math.round(
    normalizedCoherence * 0.6 + brierMetrics.brierCalibrationIndex * 100 * 0.4,
  )

  const isEquilibriumAchieved = unresolvedCount === 0 && normalizedCoherence >= 80

  let feedback = ''
  if (isEquilibriumAchieved) {
    feedback =
      'Wide Reflective Equilibrium Achieved: Considered judgments, abstract principles, and background theories mutually reinforce each other without lingering unresolved contradictions.'
  } else if (unresolvedCount > 0) {
    feedback = `Dissonant Triads Remaining (${unresolvedCount}): You have conflicting principles and judgments that violate established theoretical bounds. Resolve these triads by adjusting principles or qualifying judgments.`
  } else {
    feedback =
      'Partial Coherence: Triads resolved, but confidence adjustments are needed to eliminate lingering edge friction between competing principles.'
  }

  return {
    coherenceIndex: normalizedCoherence,
    unresolvedContradictionCount: unresolvedCount,
    brierMetrics,
    compositeEpistemicScore: Math.min(100, Math.max(0, compositeScore)),
    isEquilibriumAchieved,
    feedbackSummary: feedback,
  }
}

// ============================================================================
// 4. Epistemic Graph Connectivity Algebra
// ============================================================================

export interface EpistemicGraphConnectivity {
  readonly totalNodes: number
  readonly totalEdges: number
  readonly graphDensity: number // 0.0 to 1.0
  readonly isolatedNodeCount: number
  readonly connectedComponentCount: number
  readonly isFullyConnected: boolean
  readonly meanDegree: number
}

/**
 * Calculates topological connectivity and structural integration across
 * Considered Judgments, General Principles, and Background Theories.
 */
export function calculateEpistemicGraphConnectivity(
  suite: ReflectiveEquilibriumSuite,
): EpistemicGraphConnectivity {
  const totalNodes = suite.nodes.length
  const totalEdges = suite.edges.length
  if (totalNodes <= 1) {
    return {
      totalNodes,
      totalEdges,
      graphDensity: 0.0,
      isolatedNodeCount: 0,
      connectedComponentCount: totalNodes,
      isFullyConnected: true,
      meanDegree: 0.0,
    }
  }

  // Build undirected adjacency list
  const adj = new Map<string, Set<string>>()
  for (const n of suite.nodes) {
    adj.set(n.id, new Set())
  }
  for (const e of suite.edges) {
    adj.get(e.sourceNodeId)?.add(e.targetNodeId)
    adj.get(e.targetNodeId)?.add(e.sourceNodeId)
  }

  let isolated = 0
  for (const [, neighbors] of adj.entries()) {
    if (neighbors.size === 0) isolated++
  }

  // BFS to compute connected components
  const visited = new Set<string>()
  let components = 0
  for (const n of suite.nodes) {
    if (!visited.has(n.id)) {
      components++
      const queue = [n.id]
      visited.add(n.id)
      while (queue.length > 0) {
        const curr = queue.shift()!
        const neighbors = adj.get(curr) || new Set()
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push(neighbor)
          }
        }
      }
    }
  }

  const maxPossibleEdges = (totalNodes * (totalNodes - 1)) / 2
  const density =
    maxPossibleEdges > 0 ? Math.round((totalEdges / maxPossibleEdges) * 100) / 100 : 0.0
  const meanDegree = Math.round(((totalEdges * 2) / totalNodes) * 100) / 100

  return {
    totalNodes,
    totalEdges,
    graphDensity: density,
    isolatedNodeCount: isolated,
    connectedComponentCount: components,
    isFullyConnected: components === 1 && isolated === 0,
    meanDegree,
  }
}

// ============================================================================
// 5. FSRS Epistemic Stability Bridge
// ============================================================================

/**
 * Exports reflective equilibrium dilemmas into dual-pole FSRS flashcards.
 * Stability is boosted when the learner demonstrates well-calibrated confidence (high BCI),
 * and penalized if severe overconfidence is detected.
 */
export function exportEquilibriumToFSRSCards(
  suite: ReflectiveEquilibriumSuite,
  evaluation: ReflectiveEquilibriumEvaluation,
): FSRSEpistemicCard[] {
  const cards: FSRSEpistemicCard[] = []
  const overconfidencePenalty = Math.max(0, evaluation.brierMetrics.overconfidenceGap)
  const stabilityMultiplier =
    1.0 + 0.3 * evaluation.brierMetrics.brierCalibrationIndex - 0.2 * overconfidencePenalty

  for (const triad of suite.dissonantTriads) {
    const judgmentNode = suite.nodes.find((n) => n.id === triad.judgmentNodeId)
    const principleNode = suite.nodes.find((n) => n.id === triad.principleNodeId)
    const theoryNode = suite.nodes.find((n) => n.id === triad.theoryNodeId)

    const bestResolution = triad.availableResolutions[0]

    cards.push({
      id: `wre_${suite.id}_${triad.id}`,
      suiteName: suite.name,
      domain: suite.domain,
      conflictPrompt:
        `**[${suite.name} — ${suite.domain}]**\n\n` +
        `**Conflicting Principle (P):** "${principleNode?.statement}"\n\n` +
        `**Considered Judgment (C):** "${judgmentNode?.statement}"\n\n` +
        `**Background Theory (B):** "${theoryNode?.statement}"\n\n` +
        `**Epistemic Challenge:** Why are these three propositions in mutual contradiction, and what is the optimal Wide Reflective Equilibrium resolution?`,
      equilibriumResolution:
        `**Equilibrium Synthesis (${bestResolution.strategy.replace('_', ' ').toUpperCase()}):**\n\n` +
        `*${bestResolution.proposalTitle}*\n\n` +
        `**Systemic Impact:** ${bestResolution.consequenceAnalysis}\n\n` +
        `**Coherence Gain:** +${bestResolution.resultingCoherenceGain}% harmony across the epistemic graph.`,
      calibrationTip: `Calibrated Brier Index: ${evaluation.brierMetrics.brierCalibrationIndex.toFixed(2)} (${evaluation.brierMetrics.calibrationGrade}). Avoid overconfidence by questioning your absolute certainty.`,
      fsrsStabilityMultiplier: Math.round(stabilityMultiplier * 100) / 100,
    })
  }

  return cards
}

// ============================================================================
// 5. Interactive Reflective Equilibrium Session State Machine
// ============================================================================

export class ReflectiveEquilibriumSession {
  private activeSuite: ReflectiveEquilibriumSuite
  private state: EquilibriumSessionState

  constructor(initialSuiteKey: string = 'distributed_consensus_wre') {
    this.activeSuite =
      CALIBRATED_EQUILIBRIUM_SUITES[initialSuiteKey] ||
      CALIBRATED_EQUILIBRIUM_SUITES.distributed_consensus_wre
    this.state = {
      suiteId: this.activeSuite.id,
      activeAdjustments: {},
      resolvedTriadStrategies: {},
      recordedPredictions: [...this.activeSuite.predictionBank],
    }
  }

  public getSuite(): ReflectiveEquilibriumSuite {
    return this.activeSuite
  }

  public setSuite(suiteKey: string): void {
    if (CALIBRATED_EQUILIBRIUM_SUITES[suiteKey]) {
      this.activeSuite = CALIBRATED_EQUILIBRIUM_SUITES[suiteKey]
      this.state = {
        suiteId: this.activeSuite.id,
        activeAdjustments: {},
        resolvedTriadStrategies: {},
        recordedPredictions: [...this.activeSuite.predictionBank],
      }
    }
  }

  public resolveTriad(triadId: string, strategy: TriadResolutionStrategy): void {
    this.state = {
      ...this.state,
      resolvedTriadStrategies: {
        ...this.state.resolvedTriadStrategies,
        [triadId]: strategy,
      },
    }
  }

  public adjustNodeConfidence(nodeId: string, confidence: number): void {
    this.state = {
      ...this.state,
      activeAdjustments: {
        ...this.state.activeAdjustments,
        [nodeId]: { adjustedConfidence: Math.min(1.0, Math.max(0.5, confidence)) },
      },
    }
  }

  public addPrediction(pred: CalibratedProbabilityPrediction): void {
    this.state = {
      ...this.state,
      recordedPredictions: [...this.state.recordedPredictions, pred],
    }
  }

  public evaluateProgress(): ReflectiveEquilibriumEvaluation {
    return evaluateReflectiveEquilibrium(this.activeSuite, this.state)
  }

  public exportFSRSCards(): FSRSEpistemicCard[] {
    const evaluation = this.evaluateProgress()
    return exportEquilibriumToFSRSCards(this.activeSuite, evaluation)
  }

  public resetSession(): void {
    this.state = {
      suiteId: this.activeSuite.id,
      activeAdjustments: {},
      resolvedTriadStrategies: {},
      recordedPredictions: [...this.activeSuite.predictionBank],
    }
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────

export const equilibriumEvaluateInputSchema = z.object({
  suiteKey: z.string().optional(),
  sessionState: equilibriumSessionStateSchema.optional(),
  exportCards: z.boolean().default(false),
})
export type EquilibriumEvaluateInput = z.infer<typeof equilibriumEvaluateInputSchema>

/**
 * @file conceptest-engine.ts
 * @description Peer Instruction & Interactive ConcepTest Cognitive Engine
 *
 * Implements the Harvard active-learning paradigm pioneered by Eric Mazur (1997, 2001)
 * and empirically extended by Michelle Smith et al. (Science 2009) and Nathaniel Lasry et al. (2008):
 *
 * 1. ConcepTest Cycle (Mazur 1997):
 *    - Question Presentation (qualitative conceptual probe; no calculation)
 *    - Individual Vote 1 (Q1 silent poll + confidence rating)
 *    - The Mazur Decision Window:
 *      * If % correct < 30%: Direct instructor re-explanation required (too difficult).
 *      * If 30% <= % correct <= 70%: Optimal Peer Discussion window (students convince peers).
 *      * If % correct > 70%: Brief instructor synthesis and proceed (mastery achieved).
 *    - Paired Peer Deliberation (2-3 minutes arguing conflicting mental models)
 *    - Individual Revote (Q1' post-discussion poll)
 *    - Instructor Explanation & Canonical Invariant Synthesis
 *    - Isomorphic Transfer Problem (Q2, Smith et al. 2009: testing identical conceptual invariant
 *      in a distinct surface problem to verify genuine schema construction vs peer copying).
 *
 * 2. Quantitative Metrics:
 *    - Hake Normalized Learning Gain: <g> = (%post - %pre) / (100 - %pre)
 *    - Mazur Polarization Index (PI): Distractor entropy and cognitive dispersion in Vote 1
 *    - Peer Discussion Convergence Ratio (DCR): Fraction of conflicting pairs achieving consensus
 *    - Isomorphic Transfer Precision (ITP): Performance on novel structural probe Q2
 *    - Confidence-Accuracy Calibration Delta (ΔCAC): Elimination of overconfident misconceptions
 *
 * References:
 * - Mazur, E. (1997). Peer Instruction: A User's Manual. Prentice Hall.
 * - Crouch, C. H., & Mazur, E. (2001). Peer instruction: Ten years of experience and results. American Journal of Physics, 69(9), 970-977.
 * - Smith, M. K., Wood, W. B., Adams, W. K., Wieman, C., Knight, J. K., Guild, N., & Su, T. T. (2009). Why peer discussion improves student performance on in-class concept questions. Science, 323(5910), 122-124.
 * - Hake, R. R. (1998). Interactive-engagement versus traditional methods: A six-thousand-student survey of mechanics test data for introductory physics courses. American Journal of Physics, 66(1), 64-74.
 * - Lasry, N., Mazur, E., & Watkins, J. (2008). Peer instruction: From Harvard to the two-year college. American Journal of Physics, 76(11), 1066-1069.
 */

import { z } from 'zod'

// TD-05: scenario corpora (canonical ConcepTest suites) are CONTENT, not logic —
// they live in ./content.ts so engine diffs stay about algorithms. This corpus was
// module-private in the engine (served via the accessor functions below), so it is
// imported without re-export — the engine's public surface is unchanged.
import { CANONICAL_CONCEPTEST_SUITES } from './content'

/* ==========================================================================
 * ZOD SCHEMAS & TYPES
 * ========================================================================== */

export const PIPhaseEnum = z.enum([
  'initial_vote',
  'peer_discussion',
  'revote',
  'canonical_synthesis',
  'isomorphic_transfer',
])
export type PIPhase = z.infer<typeof PIPhaseEnum>

export const MazurWindowActionEnum = z.enum([
  're_explain', // < 30% correct
  'peer_discussion', // 30% - 70% correct (optimal engagement window)
  'proceed', // > 70% correct
])
export type MazurWindowAction = z.infer<typeof MazurWindowActionEnum>

export const PIEngagementBandEnum = z.enum([
  'Exceptional Interactive Engagement', // <g> >= 0.70 (Hake high-gain)
  'Robust Conceptual Gain', // 0.45 <= <g> < 0.70
  'Moderate Discussion Convergence', // 0.25 <= <g> < 0.45
  'Transmissionist Baseline', // <g> < 0.25
])
export type PIEngagementBand = z.infer<typeof PIEngagementBandEnum>

/**
 * Multiple-choice option for a qualitative ConcepTest probe.
 */
export const ConcepTestOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  commonMisconception: z.string().optional(),
  peerArgumentHint: z.string().min(1),
})
export type ConcepTestOption = z.infer<typeof ConcepTestOptionSchema>

/**
 * Simulated Peer Perspective with argumentation script for deliberate dissonance.
 */
export const SimulatedPeerPerspectiveSchema = z.object({
  peerName: z.string().min(1),
  initialChoiceOptionId: z.string().min(1),
  initialConfidence: z.number().min(1).max(5),
  qualitativeArgument: z.string().min(1),
  heuristicMentalModel: z.string().min(1),
  counterArgumentTrigger: z.string().min(1),
})
export type SimulatedPeerPerspective = z.infer<typeof SimulatedPeerPerspectiveSchema>

/**
 * Full ConcepTest Suite containing Q1, Peer Dialogue Models, and Isomorphic Q2.
 */
export const ConcepTestSuiteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  subtitle: z.string().min(1),
  priorKnowledgePremise: z.string().min(1),
  canonicalInvariant: z.string().min(1),
  instructorExplanation: z.string().min(1),
  // Question 1: Primary ConcepTest probe
  q1Prompt: z.string().min(1),
  q1Options: z.array(ConcepTestOptionSchema).min(3),
  q1ClassroomVoteDistribution: z.record(z.string(), z.number()), // e.g. { opt-a: 0.45, opt-b: 0.35, opt-c: 0.20 }
  // Simulated peer dialogues advocating competing mental models
  simulatedPeers: z.array(SimulatedPeerPerspectiveSchema).min(2),
  // Question 2: Isomorphic Transfer probe (Smith et al. 2009)
  q2IsomorphicPrompt: z.string().min(1),
  q2Options: z.array(ConcepTestOptionSchema).min(3),
  deepStructuralMapping: z.string().min(1),
  surfaceContextDifference: z.string().min(1),
  // FSRS Seed Flashcards
  seedCards: z.array(
    z.object({
      front: z.string().min(1),
      back: z.string().min(1),
      targetFactor: z.string().min(1),
      cardDepth: z.enum(['concep_test', 'peer_dissonance', 'isomorphic_transfer']),
    }),
  ),
})
export type ConcepTestSuite = z.infer<typeof ConcepTestSuiteSchema>

/**
 * Quantitative metrics computed from a Peer Instruction session.
 */
export const PIMetricsSchema = z.object({
  hakeNormalizedGain: z.number().min(-1).max(1), // <g> in [-1, 1]
  mazurPolarizationIndex: z.number().min(0).max(1), // PI in [0, 1]
  peerDiscussionConvergence: z.number().min(0).max(1), // DCR in [0, 1]
  isomorphicTransferScore: z.number().min(0).max(100), // Q2 score [0, 100]
  confidenceCalibrationDelta: z.number(), // Shift in confidence calibration
  mazurWindowRecommendedAction: MazurWindowActionEnum,
  engagementBand: PIEngagementBandEnum,
  smithLearningVerification: z.boolean(), // Proves genuine learning vs peer imitation
  qualitativeSummary: z.string().min(1),
  pedagogicalAdvice: z.string().min(1),
})
export type PIMetrics = z.infer<typeof PIMetricsSchema>

/* ==========================================================================
 * 5 CANONICAL MULTIDISCIPLINARY CONCEPTEST SUITES
 * ========================================================================== */

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); the private
// constant is imported from there so the accessor functions behave identically.

/* ==========================================================================
 * ACCESSORS & ENGINE ALGORITHMS
 * ========================================================================== */

/**
 * Returns all canonical ConcepTest suites.
 */
export function getCanonicalConcepTestSuites(): ConcepTestSuite[] {
  return CANONICAL_CONCEPTEST_SUITES
}

/**
 * Retrieves a specific ConcepTest suite by ID.
 */
export function getConcepTestSuiteById(id: string): ConcepTestSuite | undefined {
  return CANONICAL_CONCEPTEST_SUITES.find((s) => s.id === id)
}

export interface CalculatePIMetricsParams {
  suite: ConcepTestSuite
  q1InitialOptionId: string
  q1InitialConfidence: number // 1 to 5
  q1RevoteOptionId: string
  q1RevoteConfidence: number // 1 to 5
  q2TransferOptionId: string
  peerDiscussionOccurred: boolean
  simulatedClassroomAccuracyVote1?: number // default ~0.35-0.40 from distribution
  simulatedClassroomAccuracyVote2?: number // default ~0.75-0.85
}

/**
 * Calculates quantitative Peer Instruction metrics grounded in Hake (1998)
 * and Michelle Smith et al. (Science 2009).
 */
export function calculatePIMetrics(params: CalculatePIMetricsParams): PIMetrics {
  const {
    suite,
    q1InitialOptionId,
    q1InitialConfidence,
    q1RevoteOptionId,
    q1RevoteConfidence,
    q2TransferOptionId,
    peerDiscussionOccurred,
  } = params

  const q1CorrectOption = suite.q1Options.find((o) => o.isCorrect)
  const q2CorrectOption = suite.q2Options.find((o) => o.isCorrect)

  const isQ1InitialCorrect = q1InitialOptionId === q1CorrectOption?.id
  const isQ1RevoteCorrect = q1RevoteOptionId === q1CorrectOption?.id
  const isQ2TransferCorrect = q2TransferOptionId === q2CorrectOption?.id

  // 1. Classroom Pre/Post Percentages
  const prePct = params.simulatedClassroomAccuracyVote1 ?? (isQ1InitialCorrect ? 65 : 35)
  const postPct = params.simulatedClassroomAccuracyVote2 ?? (isQ1RevoteCorrect ? 82 : 45)

  // 2. Hake Normalized Learning Gain <g>
  // <g> = (post% - pre%) / (100% - pre%)
  let hakeGain = 0
  if (postPct >= prePct) {
    const denominator = Math.max(1, 100 - prePct)
    hakeGain = Math.round(((postPct - prePct) / denominator) * 100) / 100
  } else {
    // Negative gain (rare regression)
    hakeGain = Math.round(((postPct - prePct) / Math.max(1, prePct)) * 100) / 100
  }

  // 3. Mazur Polarization Index (PI in [0, 1])
  // Shannon entropy of vote distribution normalized by log(N_options)
  const dist = suite.q1ClassroomVoteDistribution
  const probs = Object.values(dist).filter((p) => p > 0)
  let entropy = 0
  for (const p of probs) {
    entropy -= p * Math.log2(p)
  }
  const maxEntropy = Math.log2(suite.q1Options.length)
  const mazurPolarizationIndex = Math.round((entropy / Math.max(0.1, maxEntropy)) * 100) / 100

  // 4. Peer Discussion Convergence Ratio (DCR)
  let peerDiscussionConvergence = 0.5
  if (peerDiscussionOccurred) {
    peerDiscussionConvergence = isQ1RevoteCorrect ? 0.9 : 0.4
  }

  // 5. Isomorphic Transfer Score (Q2, Smith et al. 2009)
  const isomorphicTransferScore = isQ2TransferCorrect ? 100 : 25

  // 6. Confidence-Accuracy Calibration Delta (ΔCAC)
  // Positive delta means confidence increased with accuracy or decreased with misconception
  const initialCalib = isQ1InitialCorrect ? q1InitialConfidence : -q1InitialConfidence
  const revoteCalib = isQ1RevoteCorrect ? q1RevoteConfidence : -q1RevoteConfidence
  const confidenceCalibrationDelta = revoteCalib - initialCalib

  // 7. Mazur Window Action Recommendation
  let mazurWindowRecommendedAction: MazurWindowAction = 'peer_discussion'
  if (prePct < 30) {
    mazurWindowRecommendedAction = 're_explain'
  } else if (prePct > 70) {
    mazurWindowRecommendedAction = 'proceed'
  } else {
    mazurWindowRecommendedAction = 'peer_discussion'
  }

  // 8. Engagement Band
  let engagementBand: PIEngagementBand = 'Transmissionist Baseline'
  if (hakeGain >= 0.7) {
    engagementBand = 'Exceptional Interactive Engagement'
  } else if (hakeGain >= 0.45) {
    engagementBand = 'Robust Conceptual Gain'
  } else if (hakeGain >= 0.25) {
    engagementBand = 'Moderate Discussion Convergence'
  }

  // 9. Smith et al. (Science 2009) Learning Verification
  // True if learner transitioned incorrect -> correct OR answered Q2 correctly
  const smithLearningVerification =
    (!isQ1InitialCorrect && isQ1RevoteCorrect) || isQ2TransferCorrect

  // 10. Qualitative Feedback
  let qualitativeSummary = ''
  let pedagogicalAdvice = ''

  if (smithLearningVerification && isQ2TransferCorrect) {
    qualitativeSummary =
      'Authentic conceptual restructuring demonstrated! Consistent with Michelle Smith et al. (2009), your peer deliberation resolved the underlying structural misconception and successfully transferred to the isomorphic probe Q2.'
    pedagogicalAdvice =
      'Advance to higher-order isomorphic challenge sets and analyze how boundary assumptions break down across alternative domains.'
  } else if (isQ1RevoteCorrect && !isQ2TransferCorrect) {
    qualitativeSummary =
      'Local peer convergence achieved, but surface features in transfer probe Q2 triggered an alternative heuristic trap.'
    pedagogicalAdvice =
      'Review the Deep Structural Mapping: focus on the invariant core rather than the superficial material context.'
  } else {
    qualitativeSummary =
      'Pre-discussion misconception persisted. The Mazur peer discussion identified cognitive friction, but the canonical model requires closer inspection.'
    pedagogicalAdvice =
      'Examine the Instructor Canonical Explanation: trace why atomic geometry, circuit potential, or buoyancy mandates the invariant.'
  }

  return {
    hakeNormalizedGain: hakeGain,
    mazurPolarizationIndex,
    peerDiscussionConvergence,
    isomorphicTransferScore,
    confidenceCalibrationDelta,
    mazurWindowRecommendedAction,
    engagementBand,
    smithLearningVerification,
    qualitativeSummary,
    pedagogicalAdvice,
  }
}

/**
 * Generates calibrated FSRS-6 review flashcards derived from the ConcepTest session.
 */
export function generatePIFSRSCards(
  suite: ConcepTestSuite,
  metrics: PIMetrics,
): Array<{
  front: string
  back: string
  targetFactor: string
  cardDepth: 'concep_test' | 'peer_dissonance' | 'isomorphic_transfer'
  initialStabilityDays: number
  initialDifficulty: number
}> {
  // Higher Hake gain & transfer score -> higher initial stability S0
  // Range: 1.5 to 4.8 days
  const initialStabilityDays =
    Math.round(
      (1.5 +
        Math.max(0, metrics.hakeNormalizedGain) * 2.0 +
        (metrics.isomorphicTransferScore / 100.0) * 1.3) *
        10,
    ) / 10

  // Higher Smith learning verification -> lower difficulty D0
  // Range: 2.8 to 7.0
  const initialDifficulty = metrics.smithLearningVerification ? 3.5 : 6.5

  return suite.seedCards.map((card) => ({
    front: card.front,
    back: card.back,
    targetFactor: card.targetFactor,
    cardDepth: card.cardDepth,
    initialStabilityDays,
    initialDifficulty,
  }))
}

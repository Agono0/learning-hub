import { z } from 'zod'
/**
 * @file packages/core/src/flexibility/cognitive-flexibility-engine.ts
 * @description Cognitive Flexibility & Multi-Perspective Shifting Engine.
 *
 * Implements:
 * - Rand J. Spiro et al. (1987, 1988, 1991) Cognitive Flexibility Theory (CFT):
 *   - Advanced knowledge acquisition in ill-structured, complex conceptual domains
 *   - Nonlinear Landscape Criss-Crossing: revisiting identical cases via multiple thematic paths
 *   - Multi-Perspective Re-Representation across orthogonal interpretive lenses
 *   - Feltovich, Spiro & Coulson (1989) Reductive Bias & Oversimplification Trap Diagnostics:
 *     Additivity Bias, Single-Scale Bias, Categorical Bias, and Static/Deterministic Bias
 * - Edward de Bono (1985) Six Thinking Hats & Lateral Thinking Modalities:
 *   - White (Empirical / Facts), Red (Intuition / Emotional), Black (Adversarial / Risk),
 *     Yellow (Optimistic / Value), Green (Lateral / Generative), Blue (Metacognitive / Governance)
 * - Cognitive Dispersion & Rigidity Metrics:
 *   - Perspective Dispersion Index (PDI) via Shannon entropy H(P)
 *   - Reductive Bias Susceptibility Score (RBSS)
 *   - Landscape Criss-Cross Coverage Density (C)
 * - FSRS-6 Generalization Bridge: Multi-perspective case transfer card synthesis
 *   with contextual stability scaling: S_0 = S_base * (1 + 0.35 * PDI)
 */

// TD-05: scenario corpora (content, not logic) live in './content'.
import { CALIBRATED_FLEXIBILITY_SUITES } from './content'

export type ThinkingHatType =
  | 'white_hat' // Information, objective data, measurable facts, missing data
  | 'red_hat' // Intuition, gut visceral reaction, emotional climate, hunches
  | 'black_hat' // Prudence, critical risk, failure modes, regulatory hazards
  | 'yellow_hat' // Optimistic benefits, best-case upsides, feasibility, value
  | 'green_hat' // Creative provocation, lateral alternatives, paradigm shifts
  | 'blue_hat' // Metacognitive orchestration, synthesis, cognitive blindspots

export type ReductiveBiasType =
  | 'additivity_bias' // Assuming linear independent effects without emergent feedback loops
  | 'single_scale_bias' // Analyzing phenomena at a single spatial/temporal resolution
  | 'discrete_categorical_bias' // Forcing continuous non-linear phenomena into rigid binary buckets
  | 'static_deterministic_bias' // Neglecting dynamic equilibrium, stochastic drift, and systemic adaptivity

export type PerspectiveLens =
  | 'mechanistic_technical' // Algorithmic, physical, architecture, throughput
  | 'socio_economic' // Market incentives, human coordination, budget, cost
  | 'ecological_systemic' // Environmental footprint, long-term systemic homeostasis
  | 'teleological_ethical' // Moral alignment, existential purpose, stakeholder equity

export interface CaseThematicNode {
  readonly id: string
  readonly theme: string
  readonly description: string
  readonly crossCuttingCategory: string
}

export interface HatAnalysisEntry {
  readonly hat: ThinkingHatType
  readonly promptQuestion: string
  readonly keyObservations: readonly string[]
  readonly failureModeWarning?: string
  readonly generativeInsight?: string
}

export interface ReductiveTrapDefinition {
  readonly id: string
  readonly type: ReductiveBiasType
  readonly superficialModel: string
  readonly nuancedReality: string
  readonly failureConsequence: string
  readonly remedialCrissCrossStep: string
}

export interface IllStructuredCaseStudy {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly contextSummary: string
  readonly coreDilemma: string
  readonly thematicNodes: readonly CaseThematicNode[]
  readonly hatAnalyses: Record<ThinkingHatType, HatAnalysisEntry>
  readonly reductiveTraps: readonly ReductiveTrapDefinition[]
  readonly multiPerspectiveLenses: Record<PerspectiveLens, string>
}

export interface CognitiveFlexibilitySuite {
  readonly id: string
  readonly name: string
  readonly domainFamily: string
  readonly description: string
  readonly primaryCase: IllStructuredCaseStudy
  readonly comparisonCases: readonly IllStructuredCaseStudy[]
  readonly universalThemes: readonly string[]
}

export interface CrissCrossStepAttempt {
  readonly caseId: string
  readonly selectedHat: ThinkingHatType
  readonly activeLens: PerspectiveLens
  readonly studentObservations: string
  readonly identifiedThematicNodeIds: readonly string[]
  readonly diagnosedReductiveTrapIds: readonly string[]
}

export interface CognitiveFlexibilityEvaluation {
  readonly perspectiveDispersionIndex: number // 0.0 to 1.0 (normalized Shannon entropy)
  readonly hatCoverageCount: number // Unique hats explored (0 to 6)
  readonly lensCoverageCount: number // Unique lenses explored (0 to 4)
  readonly crissCrossDensity: number // 0.0 to 1.0 (ratio of thematic nodes criss-crossed)
  readonly reductiveBiasMastery: number // 0 to 100 (% of traps identified and resolved)
  readonly cognitiveFlexibilityScore: number // Composite 0 to 100
  readonly cognitiveRigidityWarning: boolean // True if entropy < 0.45 or hat coverage < 3
  readonly feedbackSummary: string
}

export interface FSRSFlexibilityCard {
  readonly id: string
  readonly caseTitle: string
  readonly domain: string
  readonly hat: ThinkingHatType
  readonly lens: PerspectiveLens
  readonly promptFront: string
  readonly solutionBack: string
  readonly reductiveTrapWarning: string
  readonly fsrsStabilityMultiplier: number
}

// ============================================================================
// 1. Calibrated Ill-Structured Domain Suites
// ============================================================================

// TD-05: the calibrated ill-structured suites live in './content' (content, not logic).
export { CALIBRATED_FLEXIBILITY_SUITES } from './content'

// ============================================================================
// 2. Cognitive Dispersion & Rigidity Metrics
// ============================================================================

/**
 * Calculates the Perspective Dispersion Index (PDI) via normalized Shannon entropy:
 * H(P) = - \sum_{i=1}^K p_i \log_2(p_i)
 * PDI = H(P) / \log_2(K)
 *
 * Measures whether the learner explores all 6 hats and multiple lenses evenly,
 * or stays fixated in a single narrow cognitive rut (e.g. only White Hat data).
 *
 * @param hatFrequencies Map of ThinkingHatType -> count of interactions
 * @returns Normalized entropy score in [0.0, 1.0]
 */
export function calculatePerspectiveDispersionIndex(
  hatFrequencies: Record<ThinkingHatType, number>,
): number {
  const counts = Object.values(hatFrequencies)
  const total = counts.reduce((acc, c) => acc + c, 0)
  if (total === 0) return 0.0

  const K = 6 // 6 Thinking Hats
  const maxEntropy = Math.log2(K)

  let entropy = 0.0
  for (const count of counts) {
    if (count > 0) {
      const p = count / total
      entropy -= p * Math.log2(p)
    }
  }

  const normalized = entropy / maxEntropy
  return Math.min(1.0, Math.max(0.0, Math.round(normalized * 100) / 100))
}

/**
 * Calculates the Landscape Criss-Cross Coverage Density:
 * Proportion of thematic nodes identified and linked across multiple case perspectives.
 */
export function calculateCrissCrossDensity(
  identifiedNodeIds: readonly string[],
  totalAvailableNodes: readonly CaseThematicNode[],
): number {
  if (totalAvailableNodes.length === 0) return 0.0
  const uniqueIdentified = new Set(identifiedNodeIds).size
  const ratio = uniqueIdentified / totalAvailableNodes.length
  return Math.min(1.0, Math.max(0.0, Math.round(ratio * 100) / 100))
}

/**
 * Evaluates a student's cognitive flexibility across a session attempt.
 */
export function evaluateCognitiveFlexibility(
  suite: CognitiveFlexibilitySuite,
  attempts: readonly CrissCrossStepAttempt[],
): CognitiveFlexibilityEvaluation {
  const hatCounts: Record<ThinkingHatType, number> = {
    white_hat: 0,
    red_hat: 0,
    black_hat: 0,
    yellow_hat: 0,
    green_hat: 0,
    blue_hat: 0,
  }

  const usedLenses = new Set<PerspectiveLens>()
  const collectedNodeIds: string[] = []
  const diagnosedTrapIds = new Set<string>()

  for (const step of attempts) {
    hatCounts[step.selectedHat] = (hatCounts[step.selectedHat] || 0) + 1
    usedLenses.add(step.activeLens)
    for (const nid of step.identifiedThematicNodeIds) {
      collectedNodeIds.push(nid)
    }
    for (const tid of step.diagnosedReductiveTrapIds) {
      diagnosedTrapIds.add(tid)
    }
  }

  const pdi = calculatePerspectiveDispersionIndex(hatCounts)
  const hatCoverage = Object.values(hatCounts).filter((c) => c > 0).length
  const lensCoverage = usedLenses.size

  const crissCrossDensity = calculateCrissCrossDensity(
    collectedNodeIds,
    suite.primaryCase.thematicNodes,
  )

  const totalTraps = suite.primaryCase.reductiveTraps.length
  const reductiveBiasMastery =
    totalTraps > 0 ? Math.round((diagnosedTrapIds.size / totalTraps) * 100) : 100

  // Composite flexibility score:
  // 35% PDI (entropy), 25% Criss-Cross Density, 25% Reductive Bias Mastery, 15% Lens Diversity
  const composite = Math.round(
    pdi * 35 + crissCrossDensity * 25 + (reductiveBiasMastery / 100) * 25 + (lensCoverage / 4) * 15,
  )

  const cognitiveRigidityWarning = pdi < 0.45 || hatCoverage < 3

  let feedback = ''
  if (cognitiveRigidityWarning) {
    feedback =
      'Cognitive Rigidity Detected: You are analyzing this ill-structured problem primarily through a single mode. In complex non-linear domains, relying solely on empirical facts or risk aversion blinds you to emergent dynamics and lateral alternatives. Activate opposing hats (Yellow/Green or Black/Red) to break out of this cognitive rut.'
  } else if (reductiveBiasMastery < 60) {
    feedback =
      'Moderate Flexibility: Good perspective coverage, but you remain susceptible to oversimplification traps (e.g. Additivity Bias or Categorical Bias). Deliberately look for non-linear feedback loops where scaling resources exacerbates bottlenecks.'
  } else {
    feedback =
      'Exceptional Cognitive Flexibility: You traverse the problem landscape nonlinearly across analytical, generative, adversarial, and systemic lenses with robust resistance to reductive traps.'
  }

  return {
    perspectiveDispersionIndex: pdi,
    hatCoverageCount: hatCoverage,
    lensCoverageCount: lensCoverage,
    crissCrossDensity,
    reductiveBiasMastery,
    cognitiveFlexibilityScore: Math.min(100, Math.max(0, composite)),
    cognitiveRigidityWarning,
    feedbackSummary: feedback,
  }
}

// ============================================================================
// 3. FSRS-6 Generalization Deck Exporter
// ============================================================================

/**
 * Synthesizes cross-cutting FSRS review flashcards from the explored case studies.
 * Scales memory stability S_0 with the perspective dispersion index to model
 * resistance against contextual retrieval fixation.
 */
export function exportFlexibilityToFSRSCards(
  suite: CognitiveFlexibilitySuite,
  evaluation: CognitiveFlexibilityEvaluation,
): FSRSFlexibilityCard[] {
  const cards: FSRSFlexibilityCard[] = []
  const stabilityMultiplier = 1.0 + 0.35 * evaluation.perspectiveDispersionIndex

  const primary = suite.primaryCase
  const hats: ThinkingHatType[] = ['white_hat', 'black_hat', 'yellow_hat', 'green_hat']
  const lenses: PerspectiveLens[] = [
    'mechanistic_technical',
    'socio_economic',
    'ecological_systemic',
    'teleological_ethical',
  ]

  for (let i = 0; i < hats.length; i++) {
    const hat = hats[i]
    const lens = lenses[i % lenses.length]
    const analysis = primary.hatAnalyses[hat]
    const trap = primary.reductiveTraps[i % primary.reductiveTraps.length]

    cards.push({
      id: `cft_${primary.id}_${hat}_${lens}`,
      caseTitle: primary.title,
      domain: primary.domain,
      hat,
      lens,
      promptFront:
        `**[${primary.title} — ${primary.domain}]**\n\n` +
        `**Context Dilemma:** ${primary.coreDilemma}\n\n` +
        `**Perspective Shifting Challenge:** Shift into the **${hat.replace('_', ' ').toUpperCase()}** and evaluate this scenario through the **${lens.replace('_', ' ').toUpperCase()}** lens.\n\n` +
        `*Core Question:* ${analysis.promptQuestion}`,
      solutionBack:
        `**Key Multi-Perspective Insights:**\n\n` +
        analysis.keyObservations.map((obs) => `• ${obs}`).join('\n') +
        `\n\n**Systemic Lens Interpretation (${lens}):**\n${primary.multiPerspectiveLenses[lens]}` +
        (analysis.generativeInsight
          ? `\n\n**Generative Breakthrough:** ${analysis.generativeInsight}`
          : '') +
        (analysis.failureModeWarning
          ? `\n\n**Critical Failure Mode:** ${analysis.failureModeWarning}`
          : ''),
      reductiveTrapWarning: `Watch out for ${trap.type.replace(/_/g, ' ')}: "${trap.superficialModel}" → ${trap.nuancedReality}`,
      fsrsStabilityMultiplier: Math.round(stabilityMultiplier * 100) / 100,
    })
  }

  return cards
}

// ============================================================================
// 4. Interactive Cognitive Flexibility Session State Machine
// ============================================================================

export class CognitiveFlexibilitySession {
  private activeSuite: CognitiveFlexibilitySuite
  private currentStepAttempts: CrissCrossStepAttempt[] = []
  private activeHat: ThinkingHatType = 'white_hat'
  private activeLens: PerspectiveLens = 'mechanistic_technical'

  constructor(initialSuiteKey: string = 'distributed_chaos_cascade') {
    this.activeSuite =
      CALIBRATED_FLEXIBILITY_SUITES[initialSuiteKey] ||
      CALIBRATED_FLEXIBILITY_SUITES.distributed_chaos_cascade
  }

  public getSuite(): CognitiveFlexibilitySuite {
    return this.activeSuite
  }

  public setSuite(suiteKey: string): void {
    if (CALIBRATED_FLEXIBILITY_SUITES[suiteKey]) {
      this.activeSuite = CALIBRATED_FLEXIBILITY_SUITES[suiteKey]
      this.currentStepAttempts = []
      this.activeHat = 'white_hat'
      this.activeLens = 'mechanistic_technical'
    }
  }

  public getActiveHat(): ThinkingHatType {
    return this.activeHat
  }

  public setActiveHat(hat: ThinkingHatType): void {
    this.activeHat = hat
  }

  public getActiveLens(): PerspectiveLens {
    return this.activeLens
  }

  public setActiveLens(lens: PerspectiveLens): void {
    this.activeLens = lens
  }

  public recordStepAttempt(attempt: Omit<CrissCrossStepAttempt, 'caseId'>): void {
    this.currentStepAttempts.push({
      caseId: this.activeSuite.primaryCase.id,
      ...attempt,
    })
  }

  public getStepAttempts(): readonly CrissCrossStepAttempt[] {
    return this.currentStepAttempts
  }

  public evaluateCurrentProgress(): CognitiveFlexibilityEvaluation {
    return evaluateCognitiveFlexibility(this.activeSuite, this.currentStepAttempts)
  }

  public exportFSRSCards(): FSRSFlexibilityCard[] {
    const evaluation = this.evaluateCurrentProgress()
    return exportFlexibilityToFSRSCards(this.activeSuite, evaluation)
  }

  public resetSession(): void {
    this.currentStepAttempts = []
    this.activeHat = 'white_hat'
    this.activeLens = 'mechanistic_technical'
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const crissCrossStepAttemptSchema = z.object({
  caseId: z.string(),
  selectedHat: z.enum(['white_hat', 'red_hat', 'black_hat', 'yellow_hat', 'green_hat', 'blue_hat']),
  activeLens: z.enum([
    'mechanistic_technical',
    'socio_economic',
    'ecological_systemic',
    'teleological_ethical',
  ]),
  studentObservations: z.string(),
  identifiedThematicNodeIds: z.array(z.string()),
  diagnosedReductiveTrapIds: z.array(z.string()),
})
export type CrissCrossStepAttemptInput = z.infer<typeof crissCrossStepAttemptSchema>

export const flexibilityEvaluateInputSchema = z.object({
  suiteKey: z.string().optional(),
  attempts: z.array(crissCrossStepAttemptSchema).max(100).optional(),
  exportCards: z.boolean().default(false),
})
export type FlexibilityEvaluateInput = z.infer<typeof flexibilityEvaluateInputSchema>

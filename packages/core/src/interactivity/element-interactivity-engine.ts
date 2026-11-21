import { z } from 'zod'
/**
 * Learning HUB — Cognitive Load & Element Interactivity Engine
 *
 * Implements John Sweller's Cognitive Load Theory (CLT, Sweller 1988, 1994, 2011),
 * Element Interactivity Theory (Sweller & Chandler 1994; Pollock, Chandler & Sweller 2002),
 * and Fred Paas's Instructional Efficiency Metric (Paas 1992; Paas & Van Merriënboer 1993).
 *
 * Mathematical Foundations:
 * 1. Cognitive Load Decomposition:
 *    - Intrinsic Load (L_int): Inherent complexity of interacting elements.
 *      L_int = sum(c_i * (1 + sum_{j in interacting} w_ij)) * (1 - chunking_i)
 *    - Extraneous Load (L_ext): Working memory overhead from non-optimal presentation or split attention.
 *    - Germane Load (L_germ): Working memory capacity dedicated to schema construction.
 *    - Total Cognitive Load: L_total = L_int + L_ext + L_germ <= WMC (Working Memory Capacity, Cowan 4 chunks).
 *
 * 2. Pollock et al. (2002) Isolated-Elements Effect:
 *    For complex high-interactivity material where L_int > WMC, learning is blocked if presented
 *    simultaneously to novices. The scaffold decomposes learning into:
 *    - Phase 1: Isolated Elements (learn individual components with interactions decoupled).
 *    - Phase 2: Pairwise Coupling (learn binary causal links).
 *    - Phase 3: Systemic Synthesis (integrate full multi-element dynamics).
 *
 * 3. Paas (1992) Instructional Efficiency:
 *    E = (Z_Performance - Z_Effort) / sqrt(2)
 *    Where Z_P and Z_Effort are standardized against normative population baselines.
 *
 * 4. FSRS-6 Stability Bridge:
 *    High element interactivity with incomplete schema chunking produces rapid forgetting.
 *    When element interactions are successfully chunked via the 3-phase scaffold,
 *    initial stability receives a chunking multiplier:
 *    S_0 = S_base * (1 + 0.35 * ChunkingScore * max(0, Efficiency + 0.5))
 */

// TD-05: scenario corpora (calibrated interactivity suites) are CONTENT, not logic —
// they live in ./content.ts so engine diffs stay about algorithms. Re-exported so
// every existing import path keeps working (the barrel does `export * from` this file).
import { CALIBRATED_INTERACTIVITY_SUITES } from './content'
export { CALIBRATED_INTERACTIVITY_SUITES } from './content'

// ============================================================================
// 1. Zod Schemas & Domain Types
// ============================================================================

export type ElementInteractivityTier = 'low' | 'moderate' | 'high' | 'extreme'

export type InteractionType =
  | 'transitive_causal' // A causes B which causes C
  | 'feedback_loop' // Mutual reinforcement or homeostatic balancing
  | 'constraint_coupling' // Structural constraint: if A is altered, B must adjust
  | 'simultaneous_state' // Must be evaluated in the exact same clock tick / snapshot

export type ScaffoldPhase =
  | 'isolated_elements' // Phase 1: Atomic definitions, zero cross-talk
  | 'pairwise_coupling' // Phase 2: Pairwise relationships
  | 'systemic_synthesis' // Phase 3: Full simultaneous multi-element dynamics

export interface SystemElement {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly domain: string
  readonly intrinsicComplexity: number // 1 (atomic concept) to 5 (composite subsystem)
  readonly isolatedDefinition: string
  readonly testPrompt: string
  readonly correctSolution: string
  readonly distractorSolutions: readonly string[]
}

export interface ElementInteractionEdge {
  readonly sourceElementId: string
  readonly targetElementId: string
  readonly interactionType: InteractionType
  readonly couplingStrength: number // 0.1 to 1.0
  readonly causalDescription: string
  readonly diagnosticQuestion: string
  readonly correctCouplingAnswer: string
  readonly distractorAnswers: readonly string[]
}

export interface SystemicCascadeScenario {
  readonly id: string
  readonly perturbationElementId: string
  readonly perturbationDescription: string
  readonly expectedCascadeEffects: readonly {
    readonly affectedElementId: string
    readonly direction: 'increase' | 'decrease' | 'invert' | 'destabilize'
    readonly explanation: string
  }[]
  readonly synthesisChallenge: string
  readonly options: readonly {
    readonly text: string
    readonly isCorrect: boolean
    readonly feedback: string
  }[]
}

export interface ElementInteractivitySuite {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly executiveSummary: string
  readonly workingMemoryThreshold: number // Default Cowan capacity = 4.0
  readonly elements: readonly SystemElement[]
  readonly edges: readonly ElementInteractionEdge[]
  readonly cascadeScenarios: readonly SystemicCascadeScenario[]
}

export interface ElementCognitiveLoadBreakdown {
  readonly intrinsicLoad: number // 0.0 to 10.0
  readonly extraneousLoad: number // 0.0 to 5.0
  readonly germaneLoad: number // 0.0 to 5.0
  readonly totalLoad: number
  readonly workingMemoryLimit: number
  readonly isOverloaded: boolean
  readonly remainingCapacity: number
  readonly tier: ElementInteractivityTier
}

export interface PaasInstructionalEfficiency {
  readonly mentalEffortScore: number // 1 (extremely low) to 9 (extremely high)
  readonly performanceScore: number // 0 to 100
  readonly zEffort: number
  readonly zPerformance: number
  readonly efficiency: number // E = (Z_P - Z_R) / sqrt(2)
  readonly classification:
    | 'optimal_automation' // High performance, low mental effort
    | 'efficient_learning' // Balanced positive efficiency
    | 'cognitive_overload' // Low performance, excessive effort
    | 'under_engaged' // Low performance, minimal effort
    | 'effortful_mastery' // High performance, high effort
}

export interface ElementInteractivityAnalysis {
  readonly suiteId: string
  readonly totalElements: number
  readonly totalInteractions: number
  readonly couplingDensity: number // actual edges / max possible edges
  readonly maxTransitiveDepth: number
  readonly interactivityIndex: number // 0 to 100
  readonly estimatedNoviceLoad: ElementCognitiveLoadBreakdown
  readonly estimatedExpertChunkedLoad: ElementCognitiveLoadBreakdown
}

export interface FSRSElementCard {
  readonly id: string
  readonly suiteId: string
  readonly cardType: 'isolated_element' | 'pairwise_coupling' | 'systemic_synthesis'
  readonly prompt: string
  readonly solution: string
  readonly interactivityTier: ElementInteractivityTier
  readonly recommendedStabilityMultiplier: number
  readonly theoreticalCitation: string
}

// Zod schemas for validation
export const PaasMentalEffortInputSchema = z.object({
  effort: z.number().min(1).max(9),
  performance: z.number().min(0).max(100),
})

// ============================================================================
// 2. Pre-Configured High-Interactivity Suites
// ============================================================================

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); the constant
// is re-exported from this module so every existing import path keeps working.

// ============================================================================
// 3. Cognitive Load & Element Interactivity Mathematical Core
// ============================================================================

/**
 * Calculates topological element interactivity, coupling density,
 * and working memory load breakdown under novice vs chunked expert schemas.
 * (Sweller 2011; Pollock et al. 2002)
 */
export function analyzeElementInteractivity(
  suite: ElementInteractivitySuite,
  extraneousLoadFactor: number = 1.0, // 0.0 (cleanest UI) to 3.0 (confusing split-attention)
): ElementInteractivityAnalysis {
  const n = suite.elements.length
  const totalInteractions = suite.edges.length
  const maxPossibleEdges = (n * (n - 1)) / 2
  const couplingDensity =
    maxPossibleEdges > 0 ? Math.round((totalInteractions / maxPossibleEdges) * 100) / 100 : 0.0

  // Calculate maximum transitive depth using DFS
  const adj = new Map<string, string[]>()
  for (const el of suite.elements) adj.set(el.id, [])
  for (const edge of suite.edges) adj.get(edge.sourceElementId)?.push(edge.targetElementId)

  let maxDepth = 0
  function dfs(curr: string, visited: Set<string>, depth: number) {
    maxDepth = Math.max(maxDepth, depth)
    const neighbors = adj.get(curr) || []
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next)
        dfs(next, visited, depth + 1)
        visited.delete(next)
      }
    }
  }

  for (const el of suite.elements) {
    dfs(el.id, new Set([el.id]), 1)
  }

  // Interactivity Index computation: based on element count, coupling density, and transitive depth
  const avgComplexity =
    suite.elements.reduce((acc, el) => acc + el.intrinsicComplexity, 0) / (n || 1)
  const rawIndex = couplingDensity * 40 + avgComplexity * 10 + maxDepth * 6 + n * 2
  const interactivityIndex = Math.min(100, Math.max(10, Math.round(rawIndex)))

  // Estimate novice cognitive load (each element and interaction must be maintained concurrently)
  // L_int(novice) = sum(c_i) * (1 + sum(w_ij) / n)
  const sumComplexity = suite.elements.reduce((acc, el) => acc + el.intrinsicComplexity, 0)
  const totalCouplingWeight = suite.edges.reduce((acc, e) => acc + e.couplingStrength, 0)
  const noviceIntrinsic = Math.round((sumComplexity * 0.35 + totalCouplingWeight * 0.65) * 10) / 10
  const noviceExtraneous = Math.round(extraneousLoadFactor * 1.5 * 10) / 10
  const noviceGermane = Math.max(
    0.5,
    Math.round((suite.workingMemoryThreshold - noviceIntrinsic - noviceExtraneous) * 10) / 10,
  )
  const noviceTotal =
    Math.round(
      (noviceIntrinsic + noviceExtraneous + (noviceGermane > 0 ? noviceGermane : 0)) * 10,
    ) / 10

  // Estimate expert chunked cognitive load (elements consolidated into 1-2 macro-chunks)
  const expertIntrinsic = Math.round(noviceIntrinsic * 0.28 * 10) / 10
  const expertExtraneous = Math.round(extraneousLoadFactor * 0.5 * 10) / 10
  const expertGermane =
    Math.round(
      Math.min(
        1.5,
        Math.max(0.5, (suite.workingMemoryThreshold - expertIntrinsic - expertExtraneous) * 0.5),
      ) * 10,
    ) / 10
  const expertTotal = Math.round((expertIntrinsic + expertExtraneous + expertGermane) * 10) / 10

  const tier: ElementInteractivityTier =
    interactivityIndex >= 75
      ? 'extreme'
      : interactivityIndex >= 50
        ? 'high'
        : interactivityIndex >= 30
          ? 'moderate'
          : 'low'

  const estimatedNoviceLoad: ElementCognitiveLoadBreakdown = {
    intrinsicLoad: noviceIntrinsic,
    extraneousLoad: noviceExtraneous,
    germaneLoad: Math.max(0, noviceGermane),
    totalLoad: noviceTotal,
    workingMemoryLimit: suite.workingMemoryThreshold,
    isOverloaded: noviceTotal > suite.workingMemoryThreshold,
    remainingCapacity: Math.max(
      0,
      Math.round((suite.workingMemoryThreshold - noviceTotal) * 10) / 10,
    ),
    tier,
  }

  const estimatedExpertChunkedLoad: ElementCognitiveLoadBreakdown = {
    intrinsicLoad: expertIntrinsic,
    extraneousLoad: expertExtraneous,
    germaneLoad: expertGermane,
    totalLoad: expertTotal,
    workingMemoryLimit: suite.workingMemoryThreshold,
    isOverloaded: expertTotal > suite.workingMemoryThreshold,
    remainingCapacity: Math.max(
      0,
      Math.round((suite.workingMemoryThreshold - expertTotal) * 10) / 10,
    ),
    tier,
  }

  return {
    suiteId: suite.id,
    totalElements: n,
    totalInteractions,
    couplingDensity,
    maxTransitiveDepth: maxDepth,
    interactivityIndex,
    estimatedNoviceLoad,
    estimatedExpertChunkedLoad,
  }
}

// ============================================================================
// 4. Paas (1992) Instructional Efficiency Metric
// ============================================================================

/**
 * Calculates Paas-Van Merriënboer instructional efficiency metric:
 * E = (Z_Performance - Z_Effort) / sqrt(2)
 *
 * Normative reference values:
 * Effort: mu = 5.0, sigma = 2.0 (on 1-9 Likert scale)
 * Performance: mu = 65.0, sigma = 20.0 (on 0-100% scale)
 */
export function calculateInstructionalEfficiency(
  mentalEffortScore: number, // 1 to 9
  performanceScore: number, // 0 to 100
  muEffort = 5.0,
  sigmaEffort = 2.0,
  muPerf = 65.0,
  sigmaPerf = 20.0,
): PaasInstructionalEfficiency {
  const boundedEffort = Math.min(9, Math.max(1, mentalEffortScore))
  const boundedPerf = Math.min(100, Math.max(0, performanceScore))

  const zEffort = Math.round(((boundedEffort - muEffort) / sigmaEffort) * 100) / 100
  const zPerformance = Math.round(((boundedPerf - muPerf) / sigmaPerf) * 100) / 100

  // E = (Z_P - Z_R) / sqrt(2)
  const rawEfficiency = (zPerformance - zEffort) / Math.SQRT2
  const efficiency = Math.round(rawEfficiency * 100) / 100

  let classification: PaasInstructionalEfficiency['classification'] = 'efficient_learning'

  if (efficiency >= 0.5) {
    classification = 'optimal_automation'
  } else if (boundedEffort <= 3 && boundedPerf < 50) {
    classification = 'under_engaged'
  } else if (efficiency <= -0.5) {
    if (boundedEffort >= 6) {
      classification = 'cognitive_overload'
    } else {
      classification = 'under_engaged'
    }
  } else {
    if (boundedEffort >= 7 && boundedPerf >= 80) {
      classification = 'effortful_mastery'
    } else {
      classification = 'efficient_learning'
    }
  }

  return {
    mentalEffortScore: boundedEffort,
    performanceScore: boundedPerf,
    zEffort,
    zPerformance,
    efficiency,
    classification,
  }
}

// ============================================================================
// 5. Interactive Isolated-Elements Scaffold Session
// ============================================================================

export interface LearnerScaffoldProgress {
  readonly suiteId: string
  readonly currentPhase: ScaffoldPhase
  readonly isolatedMastery: Record<string, boolean>
  readonly pairwiseMastery: Record<string, boolean>
  readonly systemicMastery: Record<string, boolean>
  readonly mentalEffortRatings: readonly number[]
  readonly testPerformances: readonly number[]
  readonly overallChunkingScore: number // 0.0 to 1.0
  readonly isFullyChunked: boolean
}

/**
 * Stateful coordinator managing Pollock et al. (2002) 3-phase scaffold progression.
 */
export class ElementInteractivitySession {
  private readonly suite: ElementInteractivitySuite
  private currentPhase: ScaffoldPhase = 'isolated_elements'
  private isolatedMastery: Map<string, boolean> = new Map()
  private pairwiseMastery: Map<string, boolean> = new Map()
  private systemicMastery: Map<string, boolean> = new Map()
  private mentalEfforts: number[] = []
  private performances: number[] = []

  constructor(suiteId: string) {
    const s = CALIBRATED_INTERACTIVITY_SUITES[suiteId]
    if (!s) {
      throw new Error(`Unknown element interactivity suite: ${suiteId}`)
    }
    this.suite = s
    for (const el of s.elements) this.isolatedMastery.set(el.id, false)
    for (const edge of s.edges)
      this.pairwiseMastery.set(`${edge.sourceElementId}->${edge.targetElementId}`, false)
    for (const scen of s.cascadeScenarios) this.systemicMastery.set(scen.id, false)
  }

  getSuite(): ElementInteractivitySuite {
    return this.suite
  }

  getCurrentPhase(): ScaffoldPhase {
    return this.currentPhase
  }

  setPhase(phase: ScaffoldPhase): void {
    this.currentPhase = phase
  }

  recordIsolatedAnswer(elementId: string, isCorrect: boolean, effortScore?: number): boolean {
    if (this.isolatedMastery.has(elementId)) {
      this.isolatedMastery.set(elementId, isCorrect)
      if (effortScore !== undefined) this.mentalEfforts.push(effortScore)
      this.performances.push(isCorrect ? 100 : 0)
      this.autoAdvancePhaseCheck()
      return true
    }
    return false
  }

  recordPairwiseAnswer(
    sourceId: string,
    targetId: string,
    isCorrect: boolean,
    effortScore?: number,
  ): boolean {
    const key = `${sourceId}->${targetId}`
    if (this.pairwiseMastery.has(key)) {
      this.pairwiseMastery.set(key, isCorrect)
      if (effortScore !== undefined) this.mentalEfforts.push(effortScore)
      this.performances.push(isCorrect ? 100 : 0)
      this.autoAdvancePhaseCheck()
      return true
    }
    return false
  }

  recordSystemicAnswer(scenarioId: string, isCorrect: boolean, effortScore?: number): boolean {
    if (this.systemicMastery.has(scenarioId)) {
      this.systemicMastery.set(scenarioId, isCorrect)
      if (effortScore !== undefined) this.mentalEfforts.push(effortScore)
      this.performances.push(isCorrect ? 100 : 0)
      return true
    }
    return false
  }

  private autoAdvancePhaseCheck(): void {
    if (this.currentPhase === 'isolated_elements') {
      const allDone = Array.from(this.isolatedMastery.values()).every(Boolean)
      if (allDone) {
        this.currentPhase = 'pairwise_coupling'
      }
    } else if (this.currentPhase === 'pairwise_coupling') {
      const allDone = Array.from(this.pairwiseMastery.values()).every(Boolean)
      if (allDone) {
        this.currentPhase = 'systemic_synthesis'
      }
    }
  }

  getProgress(): LearnerScaffoldProgress {
    const isoValues = Array.from(this.isolatedMastery.values())
    const pairValues = Array.from(this.pairwiseMastery.values())
    const sysValues = Array.from(this.systemicMastery.values())

    const isoScore = isoValues.length > 0 ? isoValues.filter(Boolean).length / isoValues.length : 0
    const pairScore =
      pairValues.length > 0 ? pairValues.filter(Boolean).length / pairValues.length : 0
    const sysScore = sysValues.length > 0 ? sysValues.filter(Boolean).length / sysValues.length : 0

    // Weighted composite chunking score
    const overallChunkingScore =
      Math.round((isoScore * 0.25 + pairScore * 0.35 + sysScore * 0.4) * 100) / 100
    const isFullyChunked = overallChunkingScore >= 0.9

    const isoObj: Record<string, boolean> = {}
    for (const [k, v] of this.isolatedMastery.entries()) isoObj[k] = v
    const pairObj: Record<string, boolean> = {}
    for (const [k, v] of this.pairwiseMastery.entries()) pairObj[k] = v
    const sysObj: Record<string, boolean> = {}
    for (const [k, v] of this.systemicMastery.entries()) sysObj[k] = v

    return {
      suiteId: this.suite.id,
      currentPhase: this.currentPhase,
      isolatedMastery: isoObj,
      pairwiseMastery: pairObj,
      systemicMastery: sysObj,
      mentalEffortRatings: [...this.mentalEfforts],
      testPerformances: [...this.performances],
      overallChunkingScore,
      isFullyChunked,
    }
  }

  /**
   * Generates FSRS-6 Epistemic stability cards with chunking boost multipliers.
   */
  exportFSRSCards(_baseStabilityDays = 4.0): readonly FSRSElementCard[] {
    const progress = this.getProgress()
    const cards: FSRSElementCard[] = []

    // 1. Isolated element atomic recognition cards
    for (const el of this.suite.elements) {
      const isMastered = progress.isolatedMastery[el.id] ?? false
      const multiplier = isMastered
        ? Math.round((1.0 + 0.15 * progress.overallChunkingScore) * 100) / 100
        : 0.85

      cards.push({
        id: `fsrs_${this.suite.id}_iso_${el.id}`,
        suiteId: this.suite.id,
        cardType: 'isolated_element',
        prompt: `[${this.suite.title} - Atomic Element]\n${el.testPrompt}`,
        solution: `${el.correctSolution}\n\nKey Concept: ${el.isolatedDefinition}`,
        interactivityTier: 'low',
        recommendedStabilityMultiplier: multiplier,
        theoreticalCitation: 'Pollock, Chandler & Sweller (2002) Isolated-Elements Effect Phase 1',
      })
    }

    // 2. Relational pairwise coupling cards
    for (const edge of this.suite.edges) {
      const key = `${edge.sourceElementId}->${edge.targetElementId}`
      const isMastered = progress.pairwiseMastery[key] ?? false
      const multiplier = isMastered
        ? Math.round((1.0 + 0.25 * progress.overallChunkingScore) * 100) / 100
        : 0.8

      cards.push({
        id: `fsrs_${this.suite.id}_pair_${edge.sourceElementId}_${edge.targetElementId}`,
        suiteId: this.suite.id,
        cardType: 'pairwise_coupling',
        prompt: `[${this.suite.title} - Binary Coupling]\n${edge.diagnosticQuestion}`,
        solution: `${edge.correctCouplingAnswer}\n\nCoupling Mechanism: ${edge.causalDescription}`,
        interactivityTier: 'moderate',
        recommendedStabilityMultiplier: multiplier,
        theoreticalCitation:
          'Sweller (2011) Cognitive Load Theory: Relational Subsystem Integration',
      })
    }

    // 3. Systemic synthesis invariance cards
    for (const scen of this.suite.cascadeScenarios) {
      const isMastered = progress.systemicMastery[scen.id] ?? false
      const multiplier = isMastered
        ? Math.round((1.0 + 0.35 * progress.overallChunkingScore) * 100) / 100
        : 0.75

      const correctOpt = scen.options.find((o) => o.isCorrect)?.text ?? ''
      cards.push({
        id: `fsrs_${this.suite.id}_sys_${scen.id}`,
        suiteId: this.suite.id,
        cardType: 'systemic_synthesis',
        prompt: `[${this.suite.title} - Systemic Invariance]\nPerturbation: ${scen.perturbationDescription}\n\nChallenge: ${scen.synthesisChallenge}`,
        solution: `${correctOpt}\n\nSystem Cascade: ${scen.expectedCascadeEffects.map((e) => `• ${e.affectedElementId} [${e.direction}]: ${e.explanation}`).join('\n')}`,
        interactivityTier: 'extreme',
        recommendedStabilityMultiplier: multiplier,
        theoreticalCitation:
          'Pollock et al. (2002) & Cowan (2001) Schema Chunking in Working Memory',
      })
    }

    return cards
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const interactivityAnalysisInputSchema = z.object({
  suiteKey: z.string().optional(),
  extraneousLoadFactor: z.number().min(0).max(3).default(1),
  mentalEffort: z.number().min(1).max(9).optional(),
  performance: z.number().min(0).max(100).optional(),
})
export type InteractivityAnalysisInput = z.infer<typeof interactivityAnalysisInputSchema>

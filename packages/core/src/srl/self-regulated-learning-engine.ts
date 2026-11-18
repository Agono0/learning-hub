import { z } from 'zod'
/**
 * Self-Regulated Learning (SRL) & Metacognitive Matrix Engine
 *
 * Grounded in:
 * - Barry J. Zimmerman (2000, 2002):
 *   "Attaining Self-Regulation: A Social Cognitive Perspective"
 *   "Becoming a Self-Regulated Learner: An Overview" (Theory into Practice)
 *   Tripartite Cyclical Model: Forethought -> Performance/Volitional Control -> Self-Reflection.
 * - Paul R. Pintrich (2004):
 *   "A Conceptual Framework for Assessing Motivation and Self-Regulated Learning in College Students"
 *   4 Phases (Forethought, Monitoring, Control, Reaction) across 4 Domains (Cognition, Motivation/Affect, Behavior, Context).
 * - Philip H. Winne & Peter A. Hadwin (1998):
 *   "Studying as Self-Regulated Learning"
 *   The COPES Model: Conditions, Operations, Products, Evaluations, Standards.
 * - Bernard Weiner (1985, 1986):
 *   "An Attributional Theory of Achievement Motivation and Emotion"
 *   Causal dimensions: Locus of causality (internal vs external), Stability, and Controllability.
 */

// ============================================================================
// 1. Domain Types and Interfaces
// ============================================================================

export type SRLCyclicalPhase = 'forethought' | 'performance_control' | 'self_reflection'

export type GoalOrientation =
  'mastery_approach' | 'mastery_avoidance' | 'performance_approach' | 'performance_avoidance'

export type LocusOfCausality = 'internal' | 'external'
export type ControllabilityDimension = 'controllable' | 'uncontrollable'

export interface CausalAttribution {
  readonly id: string
  readonly name: string
  readonly locus: LocusOfCausality
  readonly controllability: ControllabilityDimension
  readonly stability: 'stable' | 'unstable'
  readonly psychologicalImpact: string
  readonly adaptiveScore: number // 0.0 to 1.0 (internal controllable effort is 1.0; external uncontrollable luck is 0.1)
}

export interface WinneHadwinCOPES {
  readonly conditions: string // Task environment, time limits, cognitive load constraints
  readonly operations: string // Cognitive tactics (e.g. self-explanation, invariant extraction)
  readonly products: string // Observable artifacts created (notes, code, diagrams, proofs)
  readonly evaluations: string // Metacognitive monitoring checks performed during execution
  readonly standards: string // Objective criteria against which products are judged
}

export interface VolitionalStrategyCheckpoint {
  readonly id: string
  readonly title: string
  readonly targetedObstacle: string
  readonly volitionalTactic: string
  readonly selfInstructionMaxim: string
  readonly focusDisruptionIntensity: number // 0.0 to 1.0
  readonly recoveryEfficacyScore: number // 0.0 to 1.0
}

export interface SRLChallengeScenario {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly complexityLevel: 'advanced' | 'frontier' | 'mastery'
  readonly taskDescription: string
  readonly estimatedSessionMinutes: number
  readonly defaultGoalOrientation: GoalOrientation
  readonly defaultCopes: WinneHadwinCOPES
  readonly volitionalCheckpoints: readonly VolitionalStrategyCheckpoint[]
  readonly attributionOptions: readonly CausalAttribution[]
  readonly expertForethoughtHeuristic: string
  readonly expertSelfReflectionPrompt: string
}

export interface SRLSessionMetrics {
  readonly cyclicalMaturityIndex: number // 0.0 to 1.0
  readonly forethoughtPlanningQuality: number // 0.0 to 1.0
  readonly volitionalControlEfficiency: number // 0.0 to 1.0
  readonly attributionalResilienceScore: number // 0.0 to 1.0
  readonly goalAttainmentScale: number // -2 to +2 (GAS scale)
  readonly completedPhasesCount: number
  readonly isForethoughtComplete: boolean
  readonly isPerformanceComplete: boolean
  readonly isReflectionComplete: boolean
  readonly currentMaturityTier:
    'naive_regulator' | 'emerging_regulator' | 'strategic_regulator' | 'autonomous_master'
}

export interface FSRSRegulatoryCard {
  readonly id: string
  readonly challengeId: string
  readonly challengeTitle: string
  readonly forethoughtPrompt: string
  readonly volitionalTacticRule: string
  readonly attributionCalibrationInsight: string
  readonly zimmermanCyclePhase: SRLCyclicalPhase
  readonly recommendedStabilityMultiplier: number
}

// ============================================================================
// 2. Pre-Calibrated Causal Attributions (Bernard Weiner 1985, 1986)
// ============================================================================

export const CANONICAL_CAUSAL_ATTRIBUTIONS: Record<string, CausalAttribution> = {
  strategic_effort: {
    id: 'strategic_effort',
    name: 'Strategic Cognitive Effort & Tactical Adjustment',
    locus: 'internal',
    controllability: 'controllable',
    stability: 'unstable',
    psychologicalImpact:
      'Fosters high self-efficacy, constructive guilt upon failure, and immediate proactive strategy refinement for the next cycle.',
    adaptiveScore: 1.0,
  },
  focused_perseverance: {
    id: 'focused_perseverance',
    name: 'Time Allocation & Volitional Willpower',
    locus: 'internal',
    controllability: 'controllable',
    stability: 'unstable',
    psychologicalImpact:
      'Reinforces agency; failure indicates insufficient deliberate practice duration rather than innate cognitive incapacity.',
    adaptiveScore: 0.9,
  },
  inherent_genius: {
    id: 'inherent_genius',
    name: 'Fixed Innate Intelligence / "Natural Talent"',
    locus: 'internal',
    controllability: 'uncontrollable',
    stability: 'stable',
    psychologicalImpact:
      'Generates fragile fixed-mindset confidence; leads to catastrophic helplessness and avoidance when encountering unfamiliar impasses.',
    adaptiveScore: 0.25,
  },
  task_impossibility: {
    id: 'task_impossibility',
    name: 'Task Unfairness & Material Incomprehensibility',
    locus: 'external',
    controllability: 'uncontrollable',
    stability: 'stable',
    psychologicalImpact:
      'Defensive attribution protecting ego by externalizing failure; completely aborts self-regulated revision.',
    adaptiveScore: 0.15,
  },
  arbitrary_luck: {
    id: 'arbitrary_luck',
    name: 'Pure Chance / Fortuitous Coincidence',
    locus: 'external',
    controllability: 'uncontrollable',
    stability: 'unstable',
    psychologicalImpact:
      'Creates fatalistic indifference; prevents systematic extraction of causal invariants.',
    adaptiveScore: 0.1,
  },
}

// ============================================================================
// 3. Pre-Calibrated SRL Challenge Scenarios
// ============================================================================

export const CALIBRATED_SRL_CHALLENGES: Record<string, SRLChallengeScenario> = {
  distributed_systems_consensus: {
    id: 'distributed_systems_consensus',
    title: 'Formal Verification of Raft Leader Election & Split-Brain Invariants',
    domain: 'Distributed Systems & TLA+ Formal Specifications',
    complexityLevel: 'frontier',
    taskDescription:
      'Model asynchronous network partitions in TLA+, specify inductive state machine safety invariants (ElectionSafety and LogMatching), and mathematically prove the absence of split-brain leader divergence under uncoordinated quorum transitions.',
    estimatedSessionMinutes: 45,
    defaultGoalOrientation: 'mastery_approach',
    defaultCopes: {
      conditions:
        'Asynchronous network with unbounded message delay, partial node crash-stop failures, non-deterministic scheduling.',
      operations:
        'Decompose Paxos quorum intersections; write inductive TLA+ action definitions; execute TLC model checking on state space.',
      products:
        'TLA+ invariant specification module; formal proof trace showing violation impossibility.',
      evaluations:
        'Verify inductive hypothesis holds across initial states and all state transition operators.',
      standards:
        '0 counterexamples generated across exhaustive breadth-first traversal of depth 12 state space.',
    },
    expertForethoughtHeuristic:
      'Do not rush into TLC verification runs. First articulate the smallest counter-example that could violate ElectionSafety on index i with conflicting terms.',
    expertSelfReflectionPrompt:
      'If TLC discovered an unexpected invariant violation, attribute it to an unstated precondition in the RequestVote handler rather than model checking complexity.',
    volitionalCheckpoints: [
      {
        id: 'vol_state_space_explosion',
        title: 'State Space Explosion & Attention Depletion',
        targetedObstacle:
          'TLC runs for 15 minutes consuming 16GB RAM without termination, causing frustration.',
        volitionalTactic: 'Symmetry Reduction & Modular Model Constraints',
        selfInstructionMaxim:
          '"When state space explodes, constrain model instances (3 nodes, 2 terms) rather than abandoning formal verification."',
        focusDisruptionIntensity: 0.8,
        recoveryEfficacyScore: 0.95,
      },
      {
        id: 'vol_tla_syntax_friction',
        title: 'Unfamiliar PlusCal / Temporal Logic Operator Semantics',
        targetedObstacle:
          'TLA+ primed variable temporal syntax generates confusing compiler diagnostic errors.',
        volitionalTactic: 'Syntax Decoupling & Micro-Step Translation',
        selfInstructionMaxim:
          '"Prime denotes next-state relation: x\' = x + 1 is an algebraic equation over two states, not an assignment statement."',
        focusDisruptionIntensity: 0.65,
        recoveryEfficacyScore: 0.9,
      },
      {
        id: 'vol_premature_termination',
        title: 'Premature Satiation & Superficial Acceptance',
        targetedObstacle:
          'Assuming the specification is correct after 3 trivial model checks without testing partition corner-cases.',
        volitionalTactic: 'Adversarial Counter-Model Generation',
        selfInstructionMaxim:
          '"Actively construct a malicious partition scenario intended to break your own invariant before claiming victory."',
        focusDisruptionIntensity: 0.7,
        recoveryEfficacyScore: 0.88,
      },
    ],
    attributionOptions: [
      CANONICAL_CAUSAL_ATTRIBUTIONS.strategic_effort,
      CANONICAL_CAUSAL_ATTRIBUTIONS.focused_perseverance,
      CANONICAL_CAUSAL_ATTRIBUTIONS.inherent_genius,
      CANONICAL_CAUSAL_ATTRIBUTIONS.task_impossibility,
    ],
  },
  deep_learning_transformer_attention: {
    id: 'deep_learning_transformer_attention',
    title: 'FlashAttention-2 Triton GPU Memory Hierarchy Kernel Engineering',
    domain: 'High-Performance GPU Computing & Modern Deep Learning Architecture',
    complexityLevel: 'mastery',
    taskDescription:
      'Implement tiling and online softmax rescaling in OpenAI Triton to compute Multi-Head Scaled Dot-Product Attention without materializing the $O(N^2)$ attention matrix in high-bandwidth memory (HBM), achieving >70% peak tensor core FLOPS on SRAM.',
    estimatedSessionMinutes: 60,
    defaultGoalOrientation: 'mastery_approach',
    defaultCopes: {
      conditions:
        'SRAM capacity limits (228KB per SM on A100/H100), warp divergence penalties, non-coalesced memory access penalties.',
      operations:
        'Tile sequence lengths Q and K into blocks $B_r, B_c$; maintain running max $m_i$ and normalizer $l_i$ across sub-block accumulation; write Triton JIT kernel.',
      products:
        'Optimized Triton python kernel; PyTorch autograd test validating forward/backward passes to $10^{-5}$ tolerance; roofline throughput plot.',
      evaluations:
        'Check max numerical deviation against `torch.nn.functional.scaled_dot_product_attention` and verify SRAM memory footprint.',
      standards:
        'Exact numerical equivalence within float16 fp tolerances and memory consumption strictly $O(N)$ instead of $O(N^2)$.',
    },
    expertForethoughtHeuristic:
      'Derive the online softmax rescaling algebra on paper before touching Triton pointer arithmetic: verify that $\\tilde{P}_{ij} = \\exp(S_{ij} - m_i^{\\text{new}})$ preserves exact normalization.',
    expertSelfReflectionPrompt:
      'When shared memory bank conflicts degrade throughput, re-evaluate threadblock tile dimensions rather than blaming GPU architecture.',
    volitionalCheckpoints: [
      {
        id: 'vol_numerical_instability_nan',
        title: 'Softmax Exponentiation Overflow & NaN Cascade',
        targetedObstacle:
          'Un-subtracted logits in SRAM block accumulation cause float16 overflow to infinity and NaN weights.',
        volitionalTactic: 'Running Invariant Tracking with Safe Max Subtraction',
        selfInstructionMaxim:
          '"Never exponentiate raw dot products; subtract running block maximum $m_i$ before evaluating `tl.exp()`."',
        focusDisruptionIntensity: 0.85,
        recoveryEfficacyScore: 0.98,
      },
      {
        id: 'vol_shared_memory_spill',
        title: 'SRAM Shared Memory Register Spilling',
        targetedObstacle:
          'Excessive tile sizes ($B_r=128, B_c=128$) trigger register spill to slow local DRAM memory, cutting speed by 80%.',
        volitionalTactic: 'Roofline Profiling & Dynamic Tile Sizing',
        selfInstructionMaxim:
          '"Inspect PTX assembly for local memory spills; downscale block size to $B_r=64, B_c=64$ to maintain 100% SRAM residency."',
        focusDisruptionIntensity: 0.75,
        recoveryEfficacyScore: 0.92,
      },
      {
        id: 'vol_boundary_masking_overhead',
        title: 'Causal Masking Warp Divergence',
        targetedObstacle:
          'Writing branchy if-conditions inside the inner loop destroys SIMD vectorization efficiency.',
        volitionalTactic: 'Predicated Vector Masking & Block Skip Heuristics',
        selfInstructionMaxim:
          '"Completely skip blocks strictly above the diagonal; apply vectorized masking only to boundary blocks."',
        focusDisruptionIntensity: 0.7,
        recoveryEfficacyScore: 0.89,
      },
    ],
    attributionOptions: [
      CANONICAL_CAUSAL_ATTRIBUTIONS.strategic_effort,
      CANONICAL_CAUSAL_ATTRIBUTIONS.focused_perseverance,
      CANONICAL_CAUSAL_ATTRIBUTIONS.inherent_genius,
      CANONICAL_CAUSAL_ATTRIBUTIONS.arbitrary_luck,
    ],
  },
  cellular_biochemistry_krebs: {
    id: 'cellular_biochemistry_krebs',
    title: 'Metabolic Control Analysis & Allosteric Regulation in the TCA Cycle',
    domain: 'Cellular Biochemistry, Bioenergetics & Systems Biology',
    complexityLevel: 'advanced',
    taskDescription:
      'Analyze flux control coefficients (FCC) in the Tricarboxylic Acid (TCA) cycle, calculate allosteric inhibition of isocitrate dehydrogenase and citrate synthase by high ATP/NADH ratios, and quantify anaplerotic flux balancing via pyruvate carboxylase.',
    estimatedSessionMinutes: 40,
    defaultGoalOrientation: 'mastery_approach',
    defaultCopes: {
      conditions:
        'Cellular energetic charge $\\frac{[ATP] + 0.5[ADP]}{[ATP] + [ADP] + [AMP]} \\approx 0.90$, mitochondrial matrix pH 7.8, fluctuating oxaloacetate concentrations.',
      operations:
        'Compute metabolic elasticity coefficients; map allosteric feedback loops; derive steady-state intermediate turnover rates.',
      products:
        'Causal pathway schematic with kinetic rate equations; simulated response to sudden energetic demand shift.',
      evaluations: 'Ensure summation theorem $\\sum C_i^J = 1.0$ holds across all cycle enzymes.',
      standards:
        'Sum of flux control coefficients rigorously equals unity under metabolic control analysis.',
    },
    expertForethoughtHeuristic:
      'Avoid rote enzyme memorization. View the TCA cycle as a cellular catalytic generator where the carbon backbone is preserved as a recycled catalytic carrier for electron extraction.',
    expertSelfReflectionPrompt:
      'If anaplerotic flux calculations diverged, examine whether you decoupled the malate-aspartate shuttle from substrate-level phosphorylation.',
    volitionalCheckpoints: [
      {
        id: 'vol_rote_memorization_trap',
        title: 'Rote Chemical Name Overload & Loss of Causal Insight',
        targetedObstacle:
          'Getting bogged down in IUPAC intermediate names instead of tracking energetic electrons ($NADH, FADH_2$).',
        volitionalTactic: 'Thermodynamic Invariant Electron Ledger',
        selfInstructionMaxim:
          '"Track high-energy hydride ions: the purpose of the cycle is 3 NADH, 1 FADH2, and 1 GTP per acetyl group."',
        focusDisruptionIntensity: 0.6,
        recoveryEfficacyScore: 0.94,
      },
      {
        id: 'vol_energy_charge_confusion',
        title: 'Allosteric Effector Sign Confusion (Activation vs Inhibition)',
        targetedObstacle:
          'Confusing ADP as an inhibitor rather than an allosteric activator of isocitrate dehydrogenase.',
        volitionalTactic: 'Metabolic Principle Anchoring (Le Chatelier & Energetic Economy)',
        selfInstructionMaxim:
          '"Abundant energy (ATP, NADH) downregulates energy production; depleted energy (ADP, NAD+) upregulates production."',
        focusDisruptionIntensity: 0.65,
        recoveryEfficacyScore: 0.91,
      },
    ],
    attributionOptions: [
      CANONICAL_CAUSAL_ATTRIBUTIONS.strategic_effort,
      CANONICAL_CAUSAL_ATTRIBUTIONS.focused_perseverance,
      CANONICAL_CAUSAL_ATTRIBUTIONS.inherent_genius,
      CANONICAL_CAUSAL_ATTRIBUTIONS.task_impossibility,
    ],
  },
  algorithmic_game_theory_auctions: {
    id: 'algorithmic_game_theory_auctions',
    title: 'Vickrey-Clarke-Groves (VCG) Dominant-Strategy Incentive Compatibility',
    domain: 'Algorithmic Mechanism Design & Microeconomic Invariance',
    complexityLevel: 'mastery',
    taskDescription:
      'Prove that the Vickrey-Clarke-Groves mechanism guarantees dominant-strategy incentive compatibility (truthfulness) in multi-item combinatorial auctions, and calculate externality pivot payments that eliminate bidder collusion incentives.',
    estimatedSessionMinutes: 50,
    defaultGoalOrientation: 'mastery_approach',
    defaultCopes: {
      conditions:
        'Combinatorial bidding language with gross substitutes valuations, quasilinear utility functions, private valuations.',
      operations:
        'Formulate social welfare optimization; define Clarke pivot tax $p_i(v) = \\max_{x} \\sum_{j \\neq i} v_j(x) - \\sum_{j \\neq i} v_j(x^*)$; prove truth-telling dominance.',
      products:
        "Mathematical proof that reporting $v_i' \\neq v_i$ yields strictly $\\leq$ utility; worked numerical example with 3 bidders and 2 non-identical items.",
      evaluations:
        'Verify individual rationality (no bidder pays more than their valuation) and no-deficit revenue bounds.',
      standards:
        "Proof demonstrates utility maximization at $v_i' = v_i$ for all possible arbitrary competitor bid vectors $v_{-i}$.",
    },
    expertForethoughtHeuristic:
      'The intuition behind Clarke pivot payment is simple: each agent pays the exact welfare loss their presence imposes on all other bidders.',
    expertSelfReflectionPrompt:
      'If non-truthful bidding appeared to yield higher payoff in your simulation, check if you violated the quasilinear utility independence assumption.',
    volitionalCheckpoints: [
      {
        id: 'vol_externality_formula_confusion',
        title: 'Clarke Pivot Externality Calculation Sign Errors',
        targetedObstacle:
          'Mixing up social welfare of others without agent i vs with agent i, producing negative payments.',
        volitionalTactic: 'Social Harm Tax Reframing',
        selfInstructionMaxim:
          '"Pivot payment equals: (What others would have gotten without you) minus (What others actually got with you)."',
        focusDisruptionIntensity: 0.7,
        recoveryEfficacyScore: 0.96,
      },
      {
        id: 'vol_collusion_disillusionment',
        title: 'VCG Budget Imbalance & Collusion Vulnerability Disillusionment',
        targetedObstacle:
          'Discovering that VCG is vulnerable to shill bidding and losing motivation regarding mechanism design.',
        volitionalTactic: 'Impossibility Theorem Perspective (Hurwicz & Green-Laffont)',
        selfInstructionMaxim:
          '"No mechanism can simultaneously achieve dominant truthfulness, efficiency, and budget balance; VCG chooses efficiency."',
        focusDisruptionIntensity: 0.65,
        recoveryEfficacyScore: 0.9,
      },
    ],
    attributionOptions: [
      CANONICAL_CAUSAL_ATTRIBUTIONS.strategic_effort,
      CANONICAL_CAUSAL_ATTRIBUTIONS.focused_perseverance,
      CANONICAL_CAUSAL_ATTRIBUTIONS.inherent_genius,
      CANONICAL_CAUSAL_ATTRIBUTIONS.arbitrary_luck,
    ],
  },
}

// ============================================================================
// 4. Mathematical Core: SRL Cyclical Maturity & Attribution Scoring
// ============================================================================

/**
 * Calculates Zimmerman's (2000, 2002) Cyclical SRL Maturity Index:
 *
 * M_srl = 0.35 * ForethoughtQuality + 0.35 * VolitionalEfficiency + 0.30 * AttributionalResilience
 *
 * @param forethoughtScore Quality of goal specificity and COPES alignment [0.0, 1.0]
 * @param volitionalScore Efficiency of overcoming attention/cognitive disruptions [0.0, 1.0]
 * @param attributionScore Weiner causal attribution adaptiveness [0.0, 1.0]
 * @returns SRL maturity index [0.0, 1.0]
 */
export function calculateSRLMaturityIndex(
  forethoughtScore: number,
  volitionalScore: number,
  attributionScore: number,
): number {
  const f = Math.max(0, Math.min(1.0, forethoughtScore))
  const v = Math.max(0, Math.min(1.0, volitionalScore))
  const a = Math.max(0, Math.min(1.0, attributionScore))

  const index = 0.35 * f + 0.35 * v + 0.3 * a
  return Math.round(index * 100) / 100
}

/**
 * Maps Zimmerman Maturity Index to Qualitative Regulation Tiers:
 * - >= 0.85: 'autonomous_master'
 * - >= 0.65: 'strategic_regulator'
 * - >= 0.45: 'emerging_regulator'
 * - < 0.45:  'naive_regulator'
 */
export function evaluateSRLMaturityTier(
  maturityIndex: number,
): SRLSessionMetrics['currentMaturityTier'] {
  if (maturityIndex >= 0.85) return 'autonomous_master'
  if (maturityIndex >= 0.65) return 'strategic_regulator'
  if (maturityIndex >= 0.45) return 'emerging_regulator'
  return 'naive_regulator'
}

/**
 * Calculates Goal Attainment Scaling (GAS) (Kiresuk & Sherman 1968):
 * - +2: Much more than expected (flawless execution ahead of schedule)
 * - +1: More than expected (mastered with minimal friction)
 * -  0: Expected outcome achieved
 * - -1: Less than expected (struggled with multiple volitional lapses)
 * - -2: Much less than expected (cycle aborted or defensive external attribution)
 */
export function calculateGoalAttainmentScale(
  volitionalEfficiency: number,
  isAccurateAttribution: boolean,
  selfEvaluationScore: number,
): number {
  if (!isAccurateAttribution && selfEvaluationScore < 0.5) return -2
  if (volitionalEfficiency < 0.4 || selfEvaluationScore < 0.5) return -1
  if (volitionalEfficiency >= 0.9 && selfEvaluationScore >= 0.9) return 2
  if (volitionalEfficiency >= 0.75 || selfEvaluationScore >= 0.75) return 1
  return 0
}

// ============================================================================
// 5. Stateful Self-Regulated Learning Session Coordinator
// ============================================================================

export class SelfRegulatedLearningSession {
  private readonly challenge: SRLChallengeScenario
  private activePhase: SRLCyclicalPhase = 'forethought'
  private selectedGoalOrientation: GoalOrientation
  private customGoalStatement: string
  private activeCopes: WinneHadwinCOPES
  private completedCheckpointIds: Set<string> = new Set()
  private selectedAttributionId: string | null = null
  private selfEvaluationScore = 0.5
  private adaptivePlanNextCycle = ''

  constructor(challengeId: string) {
    const c = CALIBRATED_SRL_CHALLENGES[challengeId]
    if (!c) {
      throw new Error(`Unknown SRL challenge scenario: ${challengeId}`)
    }
    this.challenge = c
    this.selectedGoalOrientation = c.defaultGoalOrientation
    this.customGoalStatement = `Master ${c.title} by executing rigorous COPES operations.`
    this.activeCopes = { ...c.defaultCopes }
  }

  getChallenge(): SRLChallengeScenario {
    return this.challenge
  }

  getActivePhase(): SRLCyclicalPhase {
    return this.activePhase
  }

  setActivePhase(phase: SRLCyclicalPhase): void {
    this.activePhase = phase
  }

  setGoalOrientation(orientation: GoalOrientation): void {
    this.selectedGoalOrientation = orientation
  }

  setGoalStatement(statement: string): void {
    this.customGoalStatement = statement
  }

  updateCopes(updated: Partial<WinneHadwinCOPES>): void {
    this.activeCopes = {
      ...this.activeCopes,
      ...updated,
    }
  }

  getCopes(): WinneHadwinCOPES {
    return this.activeCopes
  }

  toggleVolitionalCheckpoint(checkpointId: string): boolean {
    const exists = this.challenge.volitionalCheckpoints.some((cp) => cp.id === checkpointId)
    if (!exists)
      throw new Error(`Checkpoint ${checkpointId} not found in challenge ${this.challenge.id}`)

    if (this.completedCheckpointIds.has(checkpointId)) {
      this.completedCheckpointIds.delete(checkpointId)
      return false
    } else {
      this.completedCheckpointIds.add(checkpointId)
      return true
    }
  }

  selectCausalAttribution(attributionId: string): CausalAttribution {
    const attr = CANONICAL_CAUSAL_ATTRIBUTIONS[attributionId]
    if (!attr) throw new Error(`Attribution ${attributionId} not found`)

    this.selectedAttributionId = attributionId
    return attr
  }

  setSelfEvaluation(score: number, adaptivePlan: string): void {
    this.selfEvaluationScore = Math.max(0, Math.min(1.0, score))
    this.adaptivePlanNextCycle = adaptivePlan
  }

  getMetrics(): SRLSessionMetrics {
    // 1. Forethought Quality Score
    const hasSpecificGoal = this.customGoalStatement.trim().length > 15
    const isMastery = this.selectedGoalOrientation === 'mastery_approach'
    const forethoughtScore = (hasSpecificGoal ? 0.5 : 0.2) + (isMastery ? 0.5 : 0.3)

    // 2. Volitional Efficiency Score
    const totalCP = Math.max(1, this.challenge.volitionalCheckpoints.length)
    const volitionalScore = Math.min(1.0, this.completedCheckpointIds.size / totalCP)

    // 3. Attributional Resilience Score
    const chosenAttr = this.selectedAttributionId
      ? CANONICAL_CAUSAL_ATTRIBUTIONS[this.selectedAttributionId]
      : null
    const attributionScore = chosenAttr ? chosenAttr.adaptiveScore : 0.5

    const maturity = calculateSRLMaturityIndex(forethoughtScore, volitionalScore, attributionScore)
    const tier = evaluateSRLMaturityTier(maturity)
    const gas = calculateGoalAttainmentScale(
      volitionalScore,
      chosenAttr?.controllability === 'controllable',
      this.selfEvaluationScore,
    )

    const isForethoughtComplete = hasSpecificGoal
    const isPerformanceComplete = this.completedCheckpointIds.size >= 1
    const isReflectionComplete = this.selectedAttributionId !== null

    let completedPhases = 0
    if (isForethoughtComplete) completedPhases++
    if (isPerformanceComplete) completedPhases++
    if (isReflectionComplete) completedPhases++

    return {
      cyclicalMaturityIndex: maturity,
      forethoughtPlanningQuality: Math.round(forethoughtScore * 100) / 100,
      volitionalControlEfficiency: Math.round(volitionalScore * 100) / 100,
      attributionalResilienceScore: Math.round(attributionScore * 100) / 100,
      goalAttainmentScale: gas,
      completedPhasesCount: completedPhases,
      isForethoughtComplete,
      isPerformanceComplete,
      isReflectionComplete,
      currentMaturityTier: tier,
    }
  }

  exportFSRSCards(): readonly FSRSRegulatoryCard[] {
    const metrics = this.getMetrics()
    const stabilityMultiplier = 1.0 + metrics.cyclicalMaturityIndex * 0.75 // Up to 1.75x for autonomous regulators

    return [
      {
        id: `fsrs_srl_${this.challenge.id}_forethought`,
        challengeId: this.challenge.id,
        challengeTitle: this.challenge.title,
        forethoughtPrompt: `[Zimmerman Forethought Phase: ${this.challenge.title}]\nStrategic Heuristic: ${this.challenge.expertForethoughtHeuristic}\nTarget Goal: ${this.customGoalStatement}`,
        volitionalTacticRule:
          'Before executing complex proofs or code, specify COPES conditions, operations, and objective standards.',
        attributionCalibrationInsight:
          'Mastery approach goal orientations buffer against premature cognitive defeat.',
        zimmermanCyclePhase: 'forethought',
        recommendedStabilityMultiplier: stabilityMultiplier,
      },
      {
        id: `fsrs_srl_${this.challenge.id}_reflection`,
        challengeId: this.challenge.id,
        challengeTitle: this.challenge.title,
        forethoughtPrompt: `[Zimmerman Self-Reflection Phase: ${this.challenge.title}]\nReflection Prompt: ${this.challenge.expertSelfReflectionPrompt}`,
        volitionalTacticRule:
          'Weiner (1986): Always attribute impasses to internal, controllable factors (strategy adaptation, specific tactical effort).',
        attributionCalibrationInsight:
          'Externalizing failure as bad luck or innate lack of genius destroys self-regulatory agency.',
        zimmermanCyclePhase: 'self_reflection',
        recommendedStabilityMultiplier: stabilityMultiplier,
      },
    ]
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const srlEvaluateInputSchema = z.object({
  forethoughtScore: z.number().min(0).max(10),
  performanceScore: z.number().min(0).max(10),
  reflectionScore: z.number().min(0).max(10),
  challengeId: z.string().optional(),
})
export type SrlEvaluateInput = z.infer<typeof srlEvaluateInputSchema>

/**
 * @file packages/core/src/cognitive-load/intrinsic-load-engine.ts
 * @description Cognitive Load Theory (CLT) & Real-Time Flow State Balancer Engine.
 *
 * Grounded in peer-reviewed cognitive psychometrics:
 * 1. Sweller (1988, 2011) Tripartite Cognitive Load Decomposition:
 *    - Intrinsic Load (irreducible element interactivity)
 *    - Extraneous Load (presentation format and split-attention friction)
 *    - Germane Load (schema construction and structural abstraction effort)
 *    - Working Memory Cowan (2001) chunk capacity boundary ($W \le 4 \pm 1$ chunks)
 * 2. Paas & Van Merriënboer (1993) 2D Cognitive Efficiency Metric:
 *    $$E = \frac{z(\text{Performance}) - z(\text{Mental Effort})}{\sqrt{2}}$$
 * 3. Csikszentmihalyi (1990) Flow Channel & Yerkes-Dodson (1908) Arousal Inverted-U:
 *    Calculates challenge-to-skill ratio $B = \frac{\text{Challenge}}{\text{Mastery}}$
 * 4. Pollock, Chandler & Sweller (2002) Isolated-Elements Scaffolding Continuum:
 *    Transitions dynamically from Isolated Elements -> Pairwise Coupling -> Systemic Synthesis
 * 5. Adaptive Real-Time Telemetry & Micro-Intervention Selector:
 *    Detects keystroke jitter, response latency ratio, and edit churn bursts
 * 6. FSRS-6 Stability & Difficulty Modulation:
 *    Bridges cognitive load into dynamic FSRS retention adjustments
 */

import { z } from 'zod'

// ─── ZOD SCHEMAS & DOMAIN TYPES ──────────────────────────────────────────────

export const flowZoneSchema = z.enum([
  'boredom',
  'relaxation',
  'flow',
  'arousal',
  'anxiety',
  'cognitive_collapse',
])
export type FlowZoneType = z.infer<typeof flowZoneSchema>

export const efficiencyQuadrantSchema = z.enum([
  'high_efficiency', // High performance, low mental effort (schema automated)
  'medium_efficiency', // Balanced effort-performance ratio
  'low_efficiency', // Low performance despite high effort (cognitive thrashing)
  'critical_thrashing', // Severe overload, immediate format step-down needed
])
export type EfficiencyQuadrantType = z.infer<typeof efficiencyQuadrantSchema>

export const loadInterventionTypeSchema = z.enum([
  'none',
  'scaffold_hint',
  'worked_example',
  'format_stepdown',
  'rest_pause',
  'accelerate_challenge',
])
export type LoadInterventionType = z.infer<typeof loadInterventionTypeSchema>

export interface TripartiteCognitiveLoad {
  readonly intrinsicChunks: number // 0.0 - 4.0 Cowan chunks
  readonly extraneousChunks: number // 0.0 - 3.0 Cowan chunks
  readonly germaneChunks: number // 0.0 - 2.0 Cowan chunks
  readonly totalLoadChunks: number // Total sum
  readonly capacityLimit: number // Default 4.0 chunks
  readonly isOverloaded: boolean
  readonly freeWorkingMemoryHeadroom: number // Capacity - Total (can be negative)
}

export interface PaasEfficiencyResult {
  readonly cognitiveEfficiencyIndex: number // E score (-2.0 to +2.0)
  readonly performanceZ: number
  readonly mentalEffortZ: number
  readonly quadrant: EfficiencyQuadrantType
  readonly interpretation: string
}

export interface FlowChannelEvaluation {
  readonly challengeToSkillRatio: number // 0.1 to 3.0
  readonly flowZone: FlowZoneType
  readonly flowChannelCoherence: number // 0.0 - 1.0 (closeness to 1.0 optimal balance)
  readonly yerkesDodsonArousalPct: number // 0 - 100% arousal level
  readonly optimalArousalTargetPct: number // Task-dependent optimal target
  readonly isWithinFlowCorridor: boolean
  readonly guidance: string
}

export interface ElementScaffoldStage {
  readonly phase: 'isolated_elements' | 'pairwise_coupling' | 'systemic_synthesis'
  readonly phaseIndex: 1 | 2 | 3
  readonly title: string
  readonly instruction: string
  readonly elementInteractivityCount: number
  readonly samplePrompt: string
  readonly solutionKey: string
  readonly targetWorkingMemoryChunks: number
}

export interface CognitiveLoadTelemetryInput {
  readonly responseLatencyMs: number
  readonly baselineLatencyMs?: number
  readonly keystrokeTimestamps?: number[]
  readonly backspaceCount?: number
  readonly recentErrorsInLast5Cards?: number
  readonly subjectiveMentalEffortRating?: number // 1 to 9 (Paas 1992 scale)
  readonly taskElementCount?: number // Number of interacting conceptual elements
  readonly learnerDomainMastery?: number // 0.0 to 1.0
  readonly targetTaskDifficulty?: number // 0.0 to 1.0
}

export interface ComprehensiveCognitiveLoadEvaluation {
  readonly cli: number // Scaled 0.0 to 1.0
  readonly tripartiteLoad: TripartiteCognitiveLoad
  readonly paasEfficiency: PaasEfficiencyResult
  readonly flowEvaluation: FlowChannelEvaluation
  readonly recommendedIntervention: LoadInterventionType
  readonly recommendedScaffoldStage: ElementScaffoldStage
  readonly fsrsModulation: {
    readonly stabilityMultiplier: number // 0.7x to 1.35x
    readonly difficultyDelta: number // -1.0 to +1.5
    readonly recommendedIntervalFactor: number
  }
  readonly narrativeDiagnostics: string[]
}

// ─── CALIBRATED BENCHMARK SCENARIOS ──────────────────────────────────────────

export interface BenchmarkLoadScenario {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly elementInteractivityScore: number // 1 to 10
  readonly intrinsicComplexityDescription: string
  readonly extraneousFrictionSources: string[]
  readonly defaultScaffoldStages: ElementScaffoldStage[]
}

export const CALIBRATED_COGNITIVE_LOAD_SCENARIOS: Record<string, BenchmarkLoadScenario> = {
  distributed_paxos_consensus: {
    id: 'distributed_paxos_consensus',
    title: 'Distributed Consensus & Asynchronous Quorum Overlap',
    domain: 'Distributed Systems & Fault Tolerance',
    elementInteractivityScore: 9,
    intrinsicComplexityDescription:
      'Proposer proposal numbers, acceptor promise promises, two-phase commits, and majority quorum intersections must all be evaluated simultaneously in working memory to prevent split-brain states.',
    extraneousFrictionSources: [
      'Ambiguous node identifier nomenclature',
      'Non-deterministic message interleaving visualization',
      'Split-attention between log state and network transport buffers',
    ],
    defaultScaffoldStages: [
      {
        phase: 'isolated_elements',
        phaseIndex: 1,
        title: 'Phase 1: Isolated Quorum Arithmetic',
        instruction:
          'Calculate the minimum quorum size for an N=5 cluster without considering message latency or leader election.',
        elementInteractivityCount: 2,
        samplePrompt:
          'In a Paxos cluster of 5 nodes, what is the exact minimum number of acceptors required to form a valid majority quorum?',
        solutionKey: '3 nodes (floor(5/2) + 1)',
        targetWorkingMemoryChunks: 1.5,
      },
      {
        phase: 'pairwise_coupling',
        phaseIndex: 2,
        title: 'Phase 2: Pairwise Promise & Proposal Collision',
        instruction:
          'Trace a single Proposer preparing Proposal n=2 against Acceptor A holding Promise n=1.',
        elementInteractivityCount: 4,
        samplePrompt:
          'Acceptor A has promised n=1. Proposer B sends Prepare(n=2). Does Acceptor A accept or reject, and what state is returned?',
        solutionKey:
          'Acceptor A accepts because 2 > 1, updates highest promise to 2, and returns previously accepted value.',
        targetWorkingMemoryChunks: 2.8,
      },
      {
        phase: 'systemic_synthesis',
        phaseIndex: 3,
        title: 'Phase 3: Concurrent Competing Proposers Live Partition',
        instruction:
          'Simulate dual concurrent proposers executing simultaneous rounds under asynchronous packet drop.',
        elementInteractivityCount: 8,
        samplePrompt:
          'Proposer 1 (n=3) and Proposer 2 (n=4) interleave prepare/accept phases across nodes A, B, C under partition. Prove whether value divergence can occur.',
        solutionKey:
          'Divergence impossible: Quorum intersection invariant guarantees at least one node in Proposer 2’s quorum saw Proposer 1’s accepted value.',
        targetWorkingMemoryChunks: 4.2,
      },
    ],
  },

  recursive_ast_interpreter: {
    id: 'recursive_ast_interpreter',
    title: 'Recursive AST Evaluator & Closure Lexical Scope Resolution',
    domain: 'Programming Languages & Compilers',
    elementInteractivityScore: 8,
    intrinsicComplexityDescription:
      'Nested expression evaluation requires managing stack call frames, variable environment bindings, closure captures, and return value propagation simultaneously.',
    extraneousFrictionSources: [
      'Deeply nested JSON AST serialization syntax',
      'Conflation of lexical definition environment with dynamic call-site environment',
    ],
    defaultScaffoldStages: [
      {
        phase: 'isolated_elements',
        phaseIndex: 1,
        title: 'Phase 1: Isolated Environment Lookup',
        instruction:
          'Resolve variable names against a flat lexical environment without closures or parent links.',
        elementInteractivityCount: 2,
        samplePrompt:
          'Given environment { x: 10, y: 20 }, what is the result of resolving identifier "x"?',
        solutionKey: '10',
        targetWorkingMemoryChunks: 1.2,
      },
      {
        phase: 'pairwise_coupling',
        phaseIndex: 2,
        title: 'Phase 2: Parent Scope Chain Traversal',
        instruction: 'Trace variable lookup through an inner scope and its enclosing parent scope.',
        elementInteractivityCount: 4,
        samplePrompt:
          'Scope Inner { y: 30 } links to Scope Outer { x: 10, y: 20 }. What is lookup(Inner, "x") and lookup(Inner, "y")?',
        solutionKey: 'x resolves to 10 (from Outer); y resolves to 30 (shadowed in Inner).',
        targetWorkingMemoryChunks: 2.6,
      },
      {
        phase: 'systemic_synthesis',
        phaseIndex: 3,
        title: 'Phase 3: First-Class Function Closure Invocation',
        instruction:
          'Evaluate a higher-order function returning a closure that mutates an enclosed variable in a non-active stack frame.',
        elementInteractivityCount: 7,
        samplePrompt:
          'Function makeCounter() defines let count=0 and returns () => ++count. Trace execution of counter1() and counter2() from separate instantiations.',
        solutionKey:
          'Each invocation creates independent lexical closure environment instances holding private counter references.',
        targetWorkingMemoryChunks: 3.9,
      },
    ],
  },

  sql_window_partition: {
    id: 'sql_window_partition',
    title: 'SQL Analytical Window Functions (PARTITION BY & Frame Specs)',
    domain: 'Database Engineering & Relational Algebra',
    elementInteractivityScore: 7,
    intrinsicComplexityDescription:
      'Learners must coordinate relation filtering, partition hashing, local window ordering, and cumulative sliding frame boundaries (ROWS BETWEEN).',
    extraneousFrictionSources: [
      'Verbose SQL syntax ambiguities (RANGE vs ROWS)',
      'Mixing GROUP BY row aggregation with Window row preservation',
    ],
    defaultScaffoldStages: [
      {
        phase: 'isolated_elements',
        phaseIndex: 1,
        title: 'Phase 1: Isolated Window Partitioning',
        instruction: 'Isolate row slicing without ordering or running totals.',
        elementInteractivityCount: 2,
        samplePrompt:
          'What is the number of rows returned by: SELECT dept_id, COUNT(*) OVER (PARTITION BY dept_id) FROM employees?',
        solutionKey:
          'Exactly the total number of employee rows (window functions do not collapse rows like GROUP BY).',
        targetWorkingMemoryChunks: 1.5,
      },
      {
        phase: 'pairwise_coupling',
        phaseIndex: 2,
        title: 'Phase 2: Ordered Running Cumulative Sum',
        instruction:
          'Pair partitioning with local window order to form running running aggregates.',
        elementInteractivityCount: 4,
        samplePrompt:
          'Explain how ORDER BY salary changes SUM(salary) OVER (PARTITION BY dept_id) from a flat department total into a running total.',
        solutionKey:
          'Default frame with ORDER BY becomes RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW, creating cumulative progression.',
        targetWorkingMemoryChunks: 2.7,
      },
      {
        phase: 'systemic_synthesis',
        phaseIndex: 3,
        title: 'Phase 3: Sliding Frame Boundary Specification',
        instruction:
          'Calculate moving averages with explicit preceding and following physical row boundaries.',
        elementInteractivityCount: 6,
        samplePrompt:
          'Compute 3-period moving average: AVG(val) OVER (ORDER BY dt ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) on edge boundary rows.',
        solutionKey:
          'Edge rows gracefully compute with available window subset: First row averages (row0, row1) over 2 rows; middle rows average 3 rows.',
        targetWorkingMemoryChunks: 3.8,
      },
    ],
  },
}

// ─── MATHEMATICAL & PSYCHOMETRIC ALGORITHMS ─────────────────────────────────

/**
 * Computes keystroke jitter (standard deviation of inter-keystroke intervals in milliseconds).
 * Higher variance indicates hesitation, uncertainty, and cognitive friction (retrieval searching).
 */
export function calculateKeystrokeJitter(timestamps: readonly number[]): number {
  if (!timestamps || timestamps.length < 3) return 0
  const intervals: number[] = []
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i]! - timestamps[i - 1]!)
  }
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const variance =
    intervals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / intervals.length
  return Math.sqrt(variance)
}

/**
 * Computes Sweller's Tripartite Cognitive Load chunks:
 * Intrinsic Load + Extraneous Load + Germane Load bounded by Cowan's capacity (4 chunks).
 */
export function decomposeTripartiteLoad(
  taskElementCount: number,
  learnerMastery: number,
  extraneousFrictionFactor: number = 0.2, // 0.0 to 1.0
  workingMemoryLimit: number = 4.0,
): TripartiteCognitiveLoad {
  // Intrinsic load is proportional to element count reduced by learner automated schemas (mastery)
  const baseIntrinsic = Math.min(
    3.5,
    Math.max(0.5, (taskElementCount / 3.0) * (1.2 - learnerMastery * 0.7)),
  )
  const intrinsicChunks = Math.round(baseIntrinsic * 10) / 10

  // Extraneous load stems from UI/format friction and high presentation noise
  const extraneousChunks =
    Math.round(Math.min(2.5, Math.max(0.1, extraneousFrictionFactor * 2.2)) * 10) / 10

  // Germane load is mental capacity actively invested in schema abstraction (higher when in flow)
  const remainingSpace = workingMemoryLimit - (intrinsicChunks + extraneousChunks)
  const germaneChunks =
    remainingSpace > 0 ? Math.round(Math.min(1.5, remainingSpace * 0.7) * 10) / 10 : 0.1

  const totalLoadChunks = Math.round((intrinsicChunks + extraneousChunks + germaneChunks) * 10) / 10
  const isOverloaded = totalLoadChunks > workingMemoryLimit
  const freeWorkingMemoryHeadroom = Math.round((workingMemoryLimit - totalLoadChunks) * 10) / 10

  return {
    intrinsicChunks,
    extraneousChunks,
    germaneChunks,
    totalLoadChunks,
    capacityLimit: workingMemoryLimit,
    isOverloaded,
    freeWorkingMemoryHeadroom,
  }
}

/**
 * Computes Paas & Van Merriënboer (1993) 2D Instructional Cognitive Efficiency:
 * $$E = \frac{z(\text{Performance}) - z(\text{Mental Effort})}{\sqrt{2}}$$
 *
 * @param performanceFraction 0.0 to 1.0 (accuracy/score)
 * @param mentalEffortRating 1 to 9 (Paas Likert rating)
 */
export function calculatePaasEfficiency(
  performanceFraction: number,
  mentalEffortRating: number,
): PaasEfficiencyResult {
  const normPerf = Math.min(1.0, Math.max(0.0, performanceFraction))
  const normEffort = Math.min(9, Math.max(1, mentalEffortRating))

  // Population norm approximations (mean=0.65, sd=0.20 for performance; mean=5.0, sd=2.0 for effort)
  const perfZ = (normPerf - 0.65) / 0.2
  const effortZ = (normEffort - 5.0) / 2.0

  const eScore = Math.round(((perfZ - effortZ) / Math.SQRT2) * 100) / 100

  let quadrant: EfficiencyQuadrantType = 'medium_efficiency'
  let interpretation = ''

  if (normPerf < 0.45 && normEffort >= 7) {
    quadrant = 'critical_thrashing'
    interpretation =
      'Critical Cognitive Thrashing: Learner investing extreme effort with negligible recall. High risk of learned helplessness.'
  } else if (eScore >= 0.35) {
    quadrant = 'high_efficiency'
    interpretation =
      'High Instructional Efficiency: High performance achieved with effortless working memory processing (schema automation).'
  } else if (eScore <= -0.35) {
    quadrant = 'low_efficiency'
    interpretation =
      'Low Instructional Efficiency: Disproportionate cognitive strain relative to achieved recall precision.'
  } else {
    quadrant = 'medium_efficiency'
    interpretation =
      'Balanced Cognitive Efficiency: Mental effort proportionally translates into expected domain performance.'
  }

  return {
    cognitiveEfficiencyIndex: eScore,
    performanceZ: Math.round(perfZ * 100) / 100,
    mentalEffortZ: Math.round(effortZ * 100) / 100,
    quadrant,
    interpretation,
  }
}

/**
 * Evaluates Csikszentmihalyi (1990) Flow Channel balance and Yerkes-Dodson (1908) Arousal Law.
 * Challenge-to-Skill Ratio $B = \frac{\text{ChallengeLevel}}{\text{LearnerMastery}}$.
 */
export function evaluateFlowChannel(
  challengeLevel: number, // 0.0 to 1.0
  learnerMastery: number, // 0.0 to 1.0
  taskComplexity: 'simple' | 'moderate' | 'complex' = 'moderate',
): FlowChannelEvaluation {
  const safeMastery = Math.max(0.1, Math.min(1.0, learnerMastery))
  const safeChallenge = Math.max(0.1, Math.min(1.0, challengeLevel))

  const ratio = Math.round((safeChallenge / safeMastery) * 100) / 100

  // Flow Channel Coherence: 1.0 at perfect balance (ratio = 1.0), drops as asymmetry widens
  const deviation = Math.abs(ratio - 1.0)
  const flowChannelCoherence = Math.round(Math.max(0.0, 1.0 - deviation * 0.8) * 100) / 100

  // Yerkes-Dodson arousal (0 - 100%)
  const arousalPct = Math.min(100, Math.max(10, Math.round(ratio * 50)))

  // Optimal Yerkes-Dodson target depends on task complexity (Yerkes-Dodson 1908)
  const optimalArousalTargetPct =
    taskComplexity === 'complex' ? 45 : taskComplexity === 'moderate' ? 60 : 75

  let flowZone: FlowZoneType = 'flow'
  let guidance = ''

  if (ratio > 1.45) {
    flowZone = 'cognitive_collapse'
    guidance =
      'Cognitive Overload / Panic: Challenge severely outstrips working memory schema. Provide immediate step-by-step worked example.'
  } else if (ratio > 1.25) {
    flowZone = 'anxiety'
    guidance =
      'Elevated Anxiety: Challenge exceeds current mastery. Introduce scaffolded subgoal hints to restore self-efficacy.'
  } else if (ratio > 1.15) {
    flowZone = 'arousal'
    guidance =
      'Heightened Arousal / Stretch Zone: Challenge slightly exceeds current mastery, creating fertile conditions for rapid schema expansion.'
  } else if (ratio >= 0.85) {
    flowZone = 'flow'
    guidance =
      'Optimal Flow Channel: Challenge precisely calibrates to retrieval mastery. Deep engagement and maximal schema consolidation.'
  } else if (ratio >= 0.7) {
    flowZone = 'relaxation'
    guidance =
      'Relaxation Zone: Task is comfortably manageable. Ready for challenge escalation or retrieval generation.'
  } else {
    flowZone = 'boredom'
    guidance =
      'Cognitive Underload / Boredom: Automated retrieval without desirable difficulty. Accelerate spacing or interleave novel domains.'
  }

  const isWithinFlowCorridor = flowZone === 'flow' || flowZone === 'arousal'

  return {
    challengeToSkillRatio: ratio,
    flowZone,
    flowChannelCoherence,
    yerkesDodsonArousalPct: arousalPct,
    optimalArousalTargetPct,
    isWithinFlowCorridor,
    guidance,
  }
}

/**
 * Master diagnostic evaluator: Synthesizes real-time telemetry, tripartite load decomposition,
 * Paas efficiency, flow channel diagnostics, and FSRS modulation.
 */
export function evaluateComprehensiveCognitiveLoad(
  telemetry: CognitiveLoadTelemetryInput,
): ComprehensiveCognitiveLoadEvaluation {
  const baseline =
    telemetry.baselineLatencyMs && telemetry.baselineLatencyMs > 0
      ? telemetry.baselineLatencyMs
      : 4000
  const latency = Math.max(0, telemetry.responseLatencyMs)
  const latencyRatio = latency / baseline

  const jitter = telemetry.keystrokeTimestamps
    ? calculateKeystrokeJitter(telemetry.keystrokeTimestamps)
    : 0
  const backspaces = telemetry.backspaceCount ?? 0
  const recentErrors = telemetry.recentErrorsInLast5Cards ?? 0

  // 1. Compute multi-component Cognitive Load Index (0.0 to 1.0)
  const latencyComp = Math.min(0.35, (latencyRatio / 2.5) * 0.35)
  const jitterComp = Math.min(0.25, (jitter / 500) * 0.25)
  const churnComp = Math.min(0.25, (backspaces / 6) * 0.25)
  const errorComp = Math.min(0.15, (recentErrors / 3) * 0.15)

  const rawCli = latencyComp + jitterComp + churnComp + errorComp
  const cli = Math.round(Math.min(1.0, Math.max(0.0, rawCli)) * 100) / 100

  // 2. Tripartite Load Decomposition
  const taskElements = telemetry.taskElementCount ?? Math.max(2, Math.round(cli * 7) + 1)
  const mastery = telemetry.learnerDomainMastery ?? Math.max(0.1, 1.0 - cli * 0.8)
  const extraneousFactor = Math.min(1.0, Math.max(0.1, (churnComp + jitterComp) * 2.0))

  const tripartiteLoad = decomposeTripartiteLoad(taskElements, mastery, extraneousFactor)

  // 3. Paas Instructional Efficiency
  const performanceFraction = Math.max(0.0, 1.0 - (recentErrors * 0.25 + (cli > 0.7 ? 0.3 : 0.0)))
  const mentalEffortRating =
    telemetry.subjectiveMentalEffortRating ?? Math.min(9, Math.max(1, Math.round(cli * 8) + 1))
  const paasEfficiency = calculatePaasEfficiency(performanceFraction, mentalEffortRating)

  // 4. Flow Channel & Yerkes-Dodson Arousal
  const targetDifficulty = telemetry.targetTaskDifficulty ?? 0.75
  const flowEvaluation = evaluateFlowChannel(targetDifficulty, mastery, 'moderate')

  // 5. Prescribe Micro-Intervention
  let recommendedIntervention: LoadInterventionType = 'none'
  if (
    tripartiteLoad.isOverloaded ||
    recentErrors >= 3 ||
    paasEfficiency.quadrant === 'critical_thrashing'
  ) {
    recommendedIntervention =
      recentErrors >= 3 ? 'worked_example' : backspaces >= 4 ? 'format_stepdown' : 'scaffold_hint'
  } else if (flowEvaluation.flowZone === 'anxiety' || flowEvaluation.yerkesDodsonArousalPct > 85) {
    recommendedIntervention = 'rest_pause'
  } else if (
    flowEvaluation.flowZone === 'boredom' ||
    (flowEvaluation.flowZone !== 'flow' && cli < 0.2)
  ) {
    recommendedIntervention = 'accelerate_challenge'
  }

  // 6. Recommended Isolated Elements Scaffold Stage
  const scenario = CALIBRATED_COGNITIVE_LOAD_SCENARIOS['distributed_paxos_consensus']!
  const recommendedScaffoldStage =
    cli > 0.65
      ? scenario.defaultScaffoldStages[0]! // Phase 1: Isolated Elements
      : cli > 0.35
        ? scenario.defaultScaffoldStages[1]! // Phase 2: Pairwise Coupling
        : scenario.defaultScaffoldStages[2]! // Phase 3: Systemic Synthesis

  // 7. FSRS Spaced Repetition Modulation
  let stabilityMultiplier = 1.0
  let difficultyDelta = 0.0
  let recommendedIntervalFactor = 1.0

  if (flowEvaluation.flowZone === 'flow' && paasEfficiency.quadrant === 'high_efficiency') {
    // Optimal learning consolidation: expand spacing safely
    stabilityMultiplier = 1.25
    difficultyDelta = -0.5
    recommendedIntervalFactor = 1.3
  } else if (tripartiteLoad.isOverloaded || paasEfficiency.quadrant === 'critical_thrashing') {
    // Cognitive thrashing: contract interval and increase difficulty to avoid spacing collapse
    stabilityMultiplier = 0.75
    difficultyDelta = +1.5
    recommendedIntervalFactor = 0.65
  } else if (flowEvaluation.flowZone === 'boredom') {
    // Trivial underload: accelerate intervals to save time
    stabilityMultiplier = 1.35
    difficultyDelta = -1.0
    recommendedIntervalFactor = 1.5
  }

  // 8. Diagnostics Narrative
  const narrativeDiagnostics: string[] = []
  if (tripartiteLoad.isOverloaded) {
    narrativeDiagnostics.push(
      `Working memory capacity exceeded (${tripartiteLoad.totalLoadChunks} chunks / ${tripartiteLoad.capacityLimit} limit). Intrinsic complexity (${tripartiteLoad.intrinsicChunks} chunks) requires sub-element isolation.`,
    )
  }
  if (jitter > 350) {
    narrativeDiagnostics.push(
      `High keystroke hesitation variance (${Math.round(jitter)}ms jitter) signals memory retrieval searching and fragile schema access.`,
    )
  }
  if (paasEfficiency.quadrant === 'critical_thrashing') {
    narrativeDiagnostics.push(
      'Paas 2D efficiency detects Critical Thrashing: High cognitive expenditure is generating minimal conceptual yield.',
    )
  }
  if (flowEvaluation.flowZone === 'flow') {
    narrativeDiagnostics.push(
      'Csikszentmihalyi Flow Channel established: Challenge-to-Skill ratio matches optimal proximal acquisition corridor.',
    )
  }

  return {
    cli,
    tripartiteLoad,
    paasEfficiency,
    flowEvaluation,
    recommendedIntervention,
    recommendedScaffoldStage,
    fsrsModulation: {
      stabilityMultiplier,
      difficultyDelta,
      recommendedIntervalFactor,
    },
    narrativeDiagnostics,
  }
}

import { z } from 'zod'
/**
 * Threshold Concepts & Liminal Space Navigation Engine
 *
 * Grounded in the foundational learning science literature:
 * - Meyer, J. H. F., & Land, R. (2003). Threshold concepts and troublesome knowledge: Linkages to ways of thinking and practising within the disciplines.
 * - Land, R., Cousin, G., Meyer, J. H. F., & Davies, P. (2005). Threshold concepts and troublesome knowledge (3): implications for course design and evaluation.
 * - Cousin, G. (2006). An introduction to threshold concepts. Planet, 17(1), 4-5.
 * - Perkins, D. (1999). The many faces of constructivism. Educational Leadership, 57(3), 6-11.
 *
 * Features:
 * 1. 5 Defining Criteria of Threshold Concepts:
 *    - Transformative, Irreversible, Integrative, Bounded, Troublesome.
 * 2. Liminal Space Trajectory Tracking:
 *    - Phase 1: Pre-Liminal (Intuitive, Fragmented, Uninitiated)
 *    - Phase 2: Liminal (Suspended, Oscillating, Vulnerable to Mimicry)
 *    - Phase 3: Post-Liminal (Transformed, Integrated, Ontologically Reorganized)
 * 3. Mimicry vs Genuine Integration Diagnostic:
 *    - Distinguishes ritualized/surface answer reproduction from deep structural transformation.
 * 4. Oscillation Dampener & Stuck-Place De-Anchor:
 *    - Measures cognitive oscillation across successive evaluations.
 * 5. Curriculum Bridge & Gateway Multiplier:
 *    - Unlocks downstream clusters in curriculum knowledge graphs.
 */

// ── Types & Interfaces ───────────────────────────────────────────────

export type LiminalPhase = 'PRE_LIMINAL' | 'LIMINAL_OSCILLATING' | 'POST_LIMINAL_TRANSFORMED'

export type TroublesomeKnowledgeType =
  | 'RITUAL_KNOWLEDGE' // meaningless routine without insight (Perkins 1999)
  | 'INERT_KNOWLEDGE' // recalled only when explicitly prompted, not applied dynamically
  | 'CONCEPTUALLY_DIFFICULT' // intuitive misalignments and complex formalisms
  | 'ALIEN_KNOWLEDGE' // conflicts with everyday common-sense lived experience
  | 'TACIT_KNOWLEDGE' // implicit expert practices difficult to articulate

export interface ThresholdCriteriaScore {
  transformativeScore: number // 0 to 1.0
  irreversibleScore: number // 0 to 1.0
  integrativeScore: number // 0 to 1.0
  boundedScore: number // 0 to 1.0
  troublesomeScore: number // 0 to 1.0
}

export interface ThresholdConcept {
  id: string
  title: string
  discipline: string
  portalDescription: string
  troublesomeNature: string
  troublesomeType: TroublesomeKnowledgeType
  prerequisiteConcepts: string[]
  unlockedDownstreamConcepts: string[]
  criteriaScores: ThresholdCriteriaScore
}

export interface LiminalTrajectoryState {
  conceptId: string
  currentPhase: LiminalPhase
  oscillationIndex: number // 0.0 (stable) to 1.0 (turbulent oscillation)
  mimicryRiskIndex: number // 0.0 (authentic mastery) to 1.0 (pure mimicry)
  attemptsCount: number
  historyEvaluations: {
    timestamp: string
    confidenceScore: number // 0 to 100
    performanceScore: number // 0 to 100
    isMimicryDetected: boolean
    notes: string
  }[]
  stuckPlaceDiagnosed?: string
}

export interface MimicryProbe {
  id: string
  thresholdConceptId: string
  standardProblem: string
  standardAnswer: string
  /**
   * Perturbed boundary problem: alters superficial framing and contextual variables.
   * Learners operating by mimicry will apply rote formulas and fail;
   * learners with integrated understanding will adapt the underlying invariant principle.
   */
  perturbedProblem: string
  options: {
    id: string
    text: string
    isGenuineIntegration: boolean
    isMimicryResponse: boolean
    isNoviceError: boolean
    explanation: string
  }[]
}

export interface ThresholdDiagnosticResult {
  conceptId: string
  phase: LiminalPhase
  overallFluencyScore: number // 0 to 100%
  mimicryRiskScore: number // 0 to 100%
  oscillationStability: number // 0 to 100% (100 = settled)
  diagnosedTroublesomeKnowledge: TroublesomeKnowledgeType
  prescribedRemediation: string
  canCrossPortal: boolean
}

export interface ThresholdCurriculumBridge {
  originalMastery: number
  thresholdFluencyScore: number
  phase: LiminalPhase
  gatewayMultiplier: number
  modulatedMastery: number
  unlockedConceptsCount: number
  reasoningNotes: string[]
}

// ── Standard Benchmark Threshold Concepts ────────────────────────────

export function getStandardThresholdConcepts(): ThresholdConcept[] {
  return [
    {
      id: 'tc_pointers_memory',
      title: 'Memory Indirection & Pointer Semantics',
      discipline: 'Computer Systems & Software Engineering',
      portalDescription:
        'Variables do not hold values directly in a vacuum; they represent addresses in an address space. Dereferencing separates the container from its contents.',
      troublesomeNature:
        'Counter-intuitive separation of identity vs value; leads to alien null pointer, aliasing, and memory leak bugs.',
      troublesomeType: 'CONCEPTUALLY_DIFFICULT',
      prerequisiteConcepts: ['Variables', 'Data Types', 'Binary Encoding'],
      unlockedDownstreamConcepts: [
        'Dynamic Allocation',
        'Linked Structures',
        'Call Stacks & Heap Management',
        'Cache Locality',
      ],
      criteriaScores: {
        transformativeScore: 0.95,
        irreversibleScore: 0.92,
        integrativeScore: 0.96,
        boundedScore: 0.88,
        troublesomeScore: 0.9,
      },
    },
    {
      id: 'tc_opportunity_cost',
      title: 'Opportunity Cost & Marginal Trade-Offs',
      discipline: 'Economics & Decision Science',
      portalDescription:
        'The true cost of any choice is not the monetary outlay, but the foregone value of the next best alternative.',
      troublesomeNature:
        'Everyday thinking focuses on visible out-of-pocket expenses while ignoring implicit foregone opportunities.',
      troublesomeType: 'ALIEN_KNOWLEDGE',
      prerequisiteConcepts: ['Scarcity', 'Choice Sets', 'Utility'],
      unlockedDownstreamConcepts: [
        'Comparative Advantage',
        'Sunk Cost Fallacy',
        'Time Preference',
        'Economic Rent',
      ],
      criteriaScores: {
        transformativeScore: 0.92,
        irreversibleScore: 0.94,
        integrativeScore: 0.95,
        boundedScore: 0.85,
        troublesomeScore: 0.88,
      },
    },
    {
      id: 'tc_limits_calculus',
      title: 'Limit & Infinitesimal Approximation',
      discipline: 'Mathematics & Analysis',
      portalDescription:
        'A value approached infinitely closely without ever necessarily reaching it by static evaluation. Transforms static algebra into continuous dynamic motion.',
      troublesomeNature:
        'Novices struggle with epsilon-delta definitions and the paradox of dividing by approaching zero.',
      troublesomeType: 'CONCEPTUALLY_DIFFICULT',
      prerequisiteConcepts: ['Functions', 'Sequences', 'Cartesian Coordinates'],
      unlockedDownstreamConcepts: [
        'Derivative as Rate of Change',
        'Definite Integration',
        'Taylor Series',
        'Differential Equations',
      ],
      criteriaScores: {
        transformativeScore: 0.98,
        irreversibleScore: 0.95,
        integrativeScore: 0.97,
        boundedScore: 0.91,
        troublesomeScore: 0.93,
      },
    },
    {
      id: 'tc_entropy_irreversibility',
      title: 'Entropy & Statistical Emergence of Time',
      discipline: 'Physics & Thermodynamics',
      portalDescription:
        'Macroscopic irreversibility arises not from fundamental microscopic asymmetry, but from the astronomical multiplicity of disordered microstates.',
      troublesomeNature:
        'Clashes with everyday intuition that thermal dispersal is driven by an active "force" rather than random probability.',
      troublesomeType: 'ALIEN_KNOWLEDGE',
      prerequisiteConcepts: ['Energy Conservation', 'Microstates', 'Kinetic Theory'],
      unlockedDownstreamConcepts: [
        'Second Law of Thermodynamics',
        'Heat Engines & Carnot Efficiency',
        'Information Entropy',
        'Arrow of Time',
      ],
      criteriaScores: {
        transformativeScore: 0.96,
        irreversibleScore: 0.93,
        integrativeScore: 0.98,
        boundedScore: 0.9,
        troublesomeScore: 0.94,
      },
    },
  ]
}

// ── Standard Mimicry Probes ──────────────────────────────────────────

export function getStandardMimicryProbes(): MimicryProbe[] {
  return [
    {
      id: 'probe_pointers_swap',
      thresholdConceptId: 'tc_pointers_memory',
      standardProblem: 'Write a function swap(x, y) that swaps two integers using pointers.',
      standardAnswer: 'void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; }',
      perturbedProblem:
        'In a distributed RPC system, node A sends a memory pointer (0x7ffeef) to node B over the network. Function remote_read(ptr) crashes with SIGSEGV. Why does the standard swap/pointer dereference fail?',
      options: [
        {
          id: 'ptr_opt_genuine',
          text: 'Memory addresses are purely virtual and local to node A’s process page table. Pointers have no global ontological meaning across process or machine boundaries.',
          isGenuineIntegration: true,
          isMimicryResponse: false,
          isNoviceError: false,
          explanation:
            'Genuine integration: Recognizes that pointers are relative coordinates in a private virtual address space, not universal value identifiers.',
        },
        {
          id: 'ptr_opt_mimicry',
          text: 'Node B forgot to put an asterisk (*) in front of the pointer before dereferencing it.',
          isGenuineIntegration: false,
          isMimicryResponse: true,
          isNoviceError: false,
          explanation:
            'Mimicry response: Fixates on syntax characters (*) without grasping the underlying virtual memory architecture.',
        },
        {
          id: 'ptr_opt_novice',
          text: 'Because integers cannot be transmitted over network protocols.',
          isGenuineIntegration: false,
          isMimicryResponse: false,
          isNoviceError: true,
          explanation: 'Novice conceptual error: Completely unrelated to pointer semantics.',
        },
      ],
    },
    {
      id: 'probe_opp_cost_ticket',
      thresholdConceptId: 'tc_opportunity_cost',
      standardProblem:
        'If you spend $50 on a concert ticket, what is the opportunity cost? (Standard answer: What else you could buy with $50).',
      standardAnswer: 'The alternative goods or services that $50 could have purchased.',
      perturbedProblem:
        'You win a 100% FREE non-transferable ticket to an exclusive music festival that cannot be sold. Attending requires taking Saturday off from your part-time job where you would have earned $200. Alternatively, you would have attended a friend’s graduation. What is the opportunity cost of going to the festival?',
      options: [
        {
          id: 'opp_opt_genuine',
          text: 'The $200 forgone earnings PLUS the subjective value of the graduation ceremony. The ticket being "free" does not make the choice costless.',
          isGenuineIntegration: true,
          isMimicryResponse: false,
          isNoviceError: false,
          explanation:
            'Genuine integration: Overcomes the zero-dollar monetary illusion and accounts for foregone earnings and relational utility.',
        },
        {
          id: 'opp_opt_mimicry',
          text: 'The opportunity cost is $0 because the ticket was completely free.',
          isGenuineIntegration: false,
          isMimicryResponse: true,
          isNoviceError: false,
          explanation:
            'Mimicry / Sunk Price Fallacy: Confuses accounting monetary expenditure ($0) with economic opportunity cost.',
        },
        {
          id: 'opp_opt_novice',
          text: 'The cost is the price of the ticket if you had bought it in the market.',
          isGenuineIntegration: false,
          isMimicryResponse: false,
          isNoviceError: true,
          explanation: 'Novice error: Ignores both time tradeoffs and non-monetary alternatives.',
        },
      ],
    },
  ]
}

// ── Mathematical Engine & Algorithms ─────────────────────────────────

/**
 * Computes Threshold Significance Index (TSI):
 * Geometric/harmonic balance across the 5 defining criteria of Meyer & Land.
 */
export function computeThresholdSignificanceIndex(criteria: ThresholdCriteriaScore): number {
  const {
    transformativeScore,
    irreversibleScore,
    integrativeScore,
    boundedScore,
    troublesomeScore,
  } = criteria

  // Weighted composite reflecting gateway potency
  const composite =
    transformativeScore * 0.3 +
    integrativeScore * 0.25 +
    irreversibleScore * 0.2 +
    troublesomeScore * 0.15 +
    boundedScore * 0.1

  return Math.round(composite * 100) / 100
}

/**
 * Computes Oscillation Index:
 * Measures variance and instability in confidence vs performance across successive attempts in the liminal space.
 */
export function computeOscillationIndex(
  evaluations: LiminalTrajectoryState['historyEvaluations'],
): number {
  if (evaluations.length < 2) return 0.2

  let varianceSum = 0
  for (let i = 1; i < evaluations.length; i++) {
    const prev = evaluations[i - 1]
    const curr = evaluations[i]
    // Mismatch between perceived confidence and actual performance
    const gapPrev = Math.abs(prev.confidenceScore - prev.performanceScore)
    const gapCurr = Math.abs(curr.confidenceScore - curr.performanceScore)
    varianceSum += Math.abs(gapCurr - gapPrev) / 100
  }

  const rawIndex = varianceSum / (evaluations.length - 1)
  return Math.min(1.0, Math.max(0, Math.round(rawIndex * 100) / 100))
}

/**
 * Diagnoses Liminal Phase & Mimicry from responses and trajectory.
 */
export function evaluateLiminalTrajectory(
  conceptId: string,
  selectedOptionIds: Record<string, string>, // probeId -> optionId
  previousState?: LiminalTrajectoryState,
): ThresholdDiagnosticResult {
  const probes = getStandardMimicryProbes().filter((p) => p.thresholdConceptId === conceptId)
  const concepts = getStandardThresholdConcepts()
  const concept = concepts.find((c) => c.id === conceptId) ?? concepts[0]

  let genuineCount = 0
  let mimicryCount = 0
  let _noviceErrorCount = 0

  for (const probe of probes) {
    const chosenId = selectedOptionIds[probe.id]
    const option = probe.options.find((o) => o.id === chosenId)

    if (option?.isGenuineIntegration) {
      genuineCount++
    } else if (option?.isMimicryResponse) {
      mimicryCount++
    } else {
      _noviceErrorCount++
    }
  }

  const totalProbes = Math.max(1, probes.length)
  const genuineRatio = genuineCount / totalProbes
  const mimicryRatio = mimicryCount / totalProbes

  let phase: LiminalPhase = 'PRE_LIMINAL'
  let canCrossPortal = false

  if (genuineRatio >= 0.8 && mimicryRatio === 0) {
    phase = 'POST_LIMINAL_TRANSFORMED'
    canCrossPortal = true
  } else if (mimicryRatio > 0 || (genuineRatio > 0 && genuineRatio < 0.8)) {
    phase = 'LIMINAL_OSCILLATING'
    canCrossPortal = false
  } else {
    phase = 'PRE_LIMINAL'
    canCrossPortal = false
  }

  const overallFluencyScore = Math.round(genuineRatio * 100)
  const mimicryRiskScore = Math.round(mimicryRatio * 100)
  const oscillationStability = Math.round((1 - (previousState?.oscillationIndex ?? 0.3)) * 100)

  let prescribedRemediation =
    'Study prerequisite foundation concepts before tackling the threshold gateway.'

  if (phase === 'POST_LIMINAL_TRANSFORMED') {
    prescribedRemediation =
      'Threshold portal successfully traversed. Cognitive integration is irreversible and robust against boundary perturbations.'
  } else if (phase === 'LIMINAL_OSCILLATING') {
    prescribedRemediation =
      'Learner is in the Liminal Space experiencing mimicry or oscillation. Deconstruct surface formulas and engage in boundary refutation exercises.'
  }

  return {
    conceptId,
    phase,
    overallFluencyScore,
    mimicryRiskScore,
    oscillationStability,
    diagnosedTroublesomeKnowledge: concept.troublesomeType,
    prescribedRemediation,
    canCrossPortal,
  }
}

/**
 * Bridges Threshold Concepts to Curriculum Mastery.
 * Crossing a threshold unblocks downstream concepts with an exponential gateway multiplier.
 */
export function bridgeThresholdToCurriculum(
  originalMastery: number,
  fluencyScore: number,
  phase: LiminalPhase,
  conceptId: string,
): ThresholdCurriculumBridge {
  const concepts = getStandardThresholdConcepts()
  const concept = concepts.find((c) => c.id === conceptId) ?? concepts[0]
  const unlockedCount = concept.unlockedDownstreamConcepts.length

  let gatewayMultiplier = 1.0
  if (phase === 'POST_LIMINAL_TRANSFORMED') {
    gatewayMultiplier = 1.35 // Unlocks entire conceptual cluster
  } else if (phase === 'LIMINAL_OSCILLATING') {
    gatewayMultiplier = 1.1
  } else {
    gatewayMultiplier = 0.9 // Bottle-necked at threshold
  }

  const normalizedFluency = Math.min(1.0, Math.max(0, fluencyScore / 100))
  const modulatedMastery =
    Math.round(
      Math.min(1.0, originalMastery * gatewayMultiplier * (0.8 + normalizedFluency * 0.2)) * 100,
    ) / 100

  const reasoningNotes: string[] = [
    `Liminal Phase: ${phase} (Fluency: ${fluencyScore}%)`,
    `Threshold Gateway Multiplier: ${gatewayMultiplier}x applied to downstream conceptual cluster.`,
    `Unlocks ${unlockedCount} high-order competencies: [${concept.unlockedDownstreamConcepts.join(', ')}].`,
  ]

  if (phase === 'POST_LIMINAL_TRANSFORMED') {
    reasoningNotes.push(
      'Permanent irreversible transformation: Troublesome knowledge internalized without mimicry.',
    )
  }

  return {
    originalMastery,
    thresholdFluencyScore: fluencyScore,
    phase,
    gatewayMultiplier,
    modulatedMastery,
    unlockedConceptsCount: unlockedCount,
    reasoningNotes,
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const liminalEvaluateInputSchema = z.object({
  conceptId: z.string().default('tc_pointers_memory'),
  probeResponses: z.record(z.string(), z.string()),
  baseMastery: z.number().min(0).max(1),
})
export type LiminalEvaluateInput = z.infer<typeof liminalEvaluateInputSchema>

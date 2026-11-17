/**
 * @file structural-invariance-engine.ts
 * @description Interleaved Problem Solving & Structural Invariance Engine.
 *
 * Implements:
 * - Doug Rohrer & Kelli Taylor (2007) "The Shuffling of Mathematics Problems Improves Learning":
 *   Contrasting category discrimination vs blocked practice illusion of mastery.
 * - Nate Kornell & Robert A. Bjork (2008) "Learning Concepts and Categories: Is Spacing the Enemy of Induction?":
 *   Inductive category formation through juxtaposition of superficially similar but structurally distinct problems.
 * - Michelene T. H. Chi, Paul J. Feltovich, & Robert Glaser (1981) "Categorization and Representation of Physics Problems by Experts and Novices":
 *   Novice surface-feature fixation vs Expert deep structural invariant classification.
 * - Free Spaced Repetition Scheduler (FSRS-6) Interleaved Stability Modulation:
 *   Memory stability enhancement scaled by Rohrer Discrimination Metric (RDM).
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// 1. Types & Zod Schemas
// ---------------------------------------------------------------------------

export const problemCategorySchema = z.enum([
  'dynamic_programming',
  'greedy_choice',
  'shortest_path_dijkstra',
  'shortest_path_bellman_ford',
  'linear_selection_quickselect',
  'divide_and_conquer_sort',
  'interval_scheduling_greedy',
  'interval_partitioning_rooms',
  'monotonic_stack',
  'sliding_window_two_pointer',
  'eulerian_circuit',
  'hamiltonian_cycle_np',
])

export type ProblemCategory = z.infer<typeof problemCategorySchema>

export const problemDomainSchema = z.enum([
  'algorithms_data_structures',
  'discrete_mathematics',
  'calculus_differential_equations',
  'probability_statistics',
])

export type ProblemDomain = z.infer<typeof problemDomainSchema>

export interface SurfaceContext {
  storyTheme: string // e.g. "Space Cargo Transport", "Medieval Coin Minting", "City Subway Network"
  observableEntities: string[] // e.g. ["cargo containers", "weight limits", "profit values"]
  superficialKeywords: string[] // e.g. ["pack items", "maximize profit", "limited capacity"]
}

export interface DeepStructuralConstraint {
  invariantName: string // e.g. "Optimal Substructure with Non-Divisible Discrete Choice"
  mathematicalCondition: string // e.g. "x_i in {0, 1}, sum(w_i x_i) <= W"
  whyDecoyFails: string // e.g. "Greedy fractional choice fails because greedy density ordering leaves unused capacity gaps."
  governingPrinciple: string
}

export interface DecoyTrap {
  decoyCategory: ProblemCategory
  decoyStrategyName: string
  superficialRationale: string // Why a novice chooses this trap
  counterexampleExplanation: string // Why it produces an incorrect result
  counterexampleInput: string
  counterexampleExpectedOutput: string
  counterexampleDecoyOutput: string
}

export interface InterleavedProblemDefinition {
  id: string
  title: string
  domain: ProblemDomain
  correctCategory: ProblemCategory
  canonicalStrategyName: string
  problemStatement: string
  formalParameters: Record<string, string>
  surfaceContext: SurfaceContext
  structuralConstraint: DeepStructuralConstraint
  decoyTrap: DecoyTrap
  timeComplexity: string
  spaceComplexity: string
  keyDiscriminativeQuestions: string[]
}

export interface DiscriminationAttempt {
  problemId: string
  selectedCategory: ProblemCategory
  selectedStrategyName: string
  learnerJustification: string
  identifiedInvariantId?: string
  confidenceRating: number // 1 to 5
  timeSpentMs: number
}

export interface DiscriminationEvaluationTelemetry {
  problemId: string
  isCategoryCorrect: boolean
  isDecoyTrapped: boolean
  surfaceBiasPenalty: number // 0 to 1.0 (higher means trapped by surface story)
  structuralDiscriminationScore: number // 0 to 100
  justificationKeywordCoverage: number // 0 to 1.0
  fsrsStabilityBonus: number // Multiplier in [1.20, 2.45]
  categoryConfusionVector: Record<ProblemCategory, number>
  feedbackMessage: string
  deepRemediationAdvice: string
}

export interface CategoryPairConfusion {
  trueCategory: ProblemCategory
  predictedCategory: ProblemCategory
  confusionFrequency: number
  totalPresentations: number
}

export interface InterleavingSessionMetrics {
  totalAttempts: number
  correctCategories: number
  decoyTrapsFellInto: number
  averageDiscriminationScore: number
  averageResponseTimeMs: number
  rohrerDiscriminationIndex: number // RDI: 0 to 100
  surfaceFeatureImmunityRate: number // 0 to 1.0
}

export interface FSRSInterleavedCard {
  id: string
  front: string
  back: string
  pairedContrastCategory: string
  suggestedStabilityDays: number
  tags: string[]
}

// ---------------------------------------------------------------------------
// 2. Multidisciplinary Calibrated Problem Bank
// ---------------------------------------------------------------------------

export const CALIBRATED_INTERLEAVED_PROBLEMS: Record<string, InterleavedProblemDefinition> = {
  knapsack_01_dp: {
    id: 'knapsack_01_dp',
    title: '0/1 Discrete Payload Allocation',
    domain: 'algorithms_data_structures',
    correctCategory: 'dynamic_programming',
    canonicalStrategyName: '2D / 1D Table Dynamic Programming (Bottom-Up or Memoized)',
    problemStatement:
      'Given N indivisible scientific instruments, each with an integer mass w_i and integer scientific telemetry value v_i, and a planetary rover carrying capacity W, select a subset of instruments to maximize total telemetry value without exceeding capacity. Instruments cannot be partitioned or duplicated.',
    formalParameters: {
      items: 'N <= 1000',
      capacity: 'W <= 10000',
      itemDecision: 'x_i in {0, 1}',
    },
    surfaceContext: {
      storyTheme: 'Space Exploration Rover Payload',
      observableEntities: ['rover bay', 'scientific instruments', 'mass kg', 'telemetry data'],
      superficialKeywords: [
        'maximize telemetry value',
        'weight capacity',
        'pack optimal payload',
        'greedy ratio',
      ],
    },
    structuralConstraint: {
      invariantName: 'Optimal Substructure with Non-Divisible State Overlap',
      mathematicalCondition: 'DP[i][w] = max(DP[i-1][w], DP[i-1][w - w_i] + v_i)',
      whyDecoyFails:
        'Greedy value-to-weight ratio sorting fails because items cannot be split; taking the highest-density item may leave an unfilled gap that two slightly lower-density items could have filled with higher cumulative value.',
      governingPrinciple:
        'Bellman Principle of Optimality under discrete non-divisible choice constraints',
    },
    decoyTrap: {
      decoyCategory: 'greedy_choice',
      decoyStrategyName: 'Value-to-Weight Ratio Greedy Sort',
      superficialRationale:
        'Sort items descending by density v_i / w_i and pick greedily until full.',
      counterexampleExplanation:
        'W = 50. Item A: w=10, v=60 (ratio 6.0). Item B: w=20, v=100 (ratio 5.0). Item C: w=30, v=120 (ratio 4.0). Greedy takes A then B (total 160). But taking B and C gives total 220 within 50 kg!',
      counterexampleInput: 'W = 50, Items: [(w:10, v:60), (w:20, v:100), (w:30, v:120)]',
      counterexampleExpectedOutput: 'DP Solution: Value 220 (Items B & C)',
      counterexampleDecoyOutput: 'Greedy Solution: Value 160 (Items A & B)',
    },
    timeComplexity: 'O(N * W)',
    spaceComplexity: 'O(W)',
    keyDiscriminativeQuestions: [
      'Can items be divided into fractional continuous quantities?',
      'Does taking an item of higher density risk leaving stranded capacity?',
      'Does the subproblem solution depend on discrete remaining integer capacity?',
    ],
  },

  knapsack_fractional_greedy: {
    id: 'knapsack_fractional_greedy',
    title: 'Fractional Chemical Fuel Synthesis',
    domain: 'algorithms_data_structures',
    correctCategory: 'greedy_choice',
    canonicalStrategyName: 'Value-per-Gram Greedy Sort with Continuous Partitioning',
    problemStatement:
      'A chemical propulsion lab has N liquid compounds, each with total mass w_i and total energy output v_i. The reaction chamber can hold at most W kilograms of fluid. Any arbitrary fraction 0 <= x_i <= 1 of each liquid compound can be poured. Maximize total energy output.',
    formalParameters: {
      compounds: 'N <= 100000',
      capacity: 'W (continuous real number)',
      decisionDomain: '0.0 <= x_i <= 1.0 (continuous)',
    },
    surfaceContext: {
      storyTheme: 'Chemical Propulsion Lab Synthesis',
      observableEntities: ['liquid fuels', 'reaction tank', 'weight kilograms', 'energy joules'],
      superficialKeywords: [
        'tank capacity limit',
        'energy values',
        'chemical selection',
        'optimal storage',
      ],
    },
    structuralConstraint: {
      invariantName: 'Matroid Greedy-Choice Property with Continuous Partitioning',
      mathematicalCondition: 'x_i = min(1.0, W_remaining / w_i) sorted by (v_i / w_i) desc',
      whyDecoyFails:
        'Dynamic programming is completely unnecessary and computationally wasteful (or impossible for continuous W) because the continuous divisibility guarantees the greedy choice property with zero stranded capacity.',
      governingPrinciple: 'Greedy-choice optimality under continuous divisible matroid constraints',
    },
    decoyTrap: {
      decoyCategory: 'dynamic_programming',
      decoyStrategyName: 'Discrete State Space 2D Dynamic Programming',
      superficialRationale:
        'It looks like the knapsack problem with capacities and values, so we should build a DP table.',
      counterexampleExplanation:
        'Continuous capacity W cannot be indexed into discrete integer DP states without discretization error, and DP runs in pseudo-polynomial O(N*W) time while Greedy runs in O(N log N) with provable exact optimality.',
      counterexampleInput: 'W = 42.75 kg, N = 10000 continuous liquids',
      counterexampleExpectedOutput: 'Greedy exact solution in O(N log N)',
      counterexampleDecoyOutput: 'DP table memory explosion or integer rounding failure',
    },
    timeComplexity: 'O(N log N)',
    spaceComplexity: 'O(1) auxiliary',
    keyDiscriminativeQuestions: [
      'Are fractions of items allowed to be selected?',
      'Is the capacity a continuous real number or a discrete integer?',
      'Can the greedy local choice ever strand capacity that a suboptimal choice could better utilize?',
    ],
  },

  shortest_path_dijkstra: {
    id: 'shortest_path_dijkstra',
    title: 'Subsea Fiber Cable Latency Routing',
    domain: 'algorithms_data_structures',
    correctCategory: 'shortest_path_dijkstra',
    canonicalStrategyName: 'Dijkstra Single-Source Shortest Path with Min-Priority Queue',
    problemStatement:
      'Given an international telecommunications graph with V data centers and E directional fiber lines, where each line has a transmission delay d_e >= 0 milliseconds. Find the minimum latency path from a source data center S to all other centers.',
    formalParameters: {
      vertices: 'V <= 50000',
      edges: 'E <= 200000',
      edgeWeights: 'w(u, v) >= 0 for all edges',
    },
    surfaceContext: {
      storyTheme: 'Global Subsea Optical Network',
      observableEntities: ['fiber cables', 'data centers', 'signal repeaters', 'latency ms'],
      superficialKeywords: [
        'network routing',
        'signal latency',
        'shortest connection',
        'transmission delay',
      ],
    },
    structuralConstraint: {
      invariantName: 'Monotonic Prefix Distance Growth with Non-Negative Edge Invariant',
      mathematicalCondition: 'dist[v] <= dist[u] + w(u, v) with w(u, v) >= 0',
      whyDecoyFails:
        'Bellman-Ford is needlessly slow (O(V * E)) when all edge weights are non-negative, whereas Dijkstra settles each vertex permanently in priority queue order O((V + E) log V).',
      governingPrinciple:
        'Greedy vertex extraction under strictly non-negative edge weight monotonicity',
    },
    decoyTrap: {
      decoyCategory: 'shortest_path_bellman_ford',
      decoyStrategyName: 'Bellman-Ford Edge Relaxation Loops',
      superficialRationale:
        'Bellman-Ford handles shortest paths in arbitrary directed graphs, so it should be used for safety.',
      counterexampleExplanation:
        'On a graph with 50,000 vertices and 200,000 edges, Bellman-Ford performs 10 billion operations (O(V*E)), causing timeout/TLE, whereas Dijkstra finishes in ~3 million operations.',
      counterexampleInput: 'V = 50,000, E = 200,000, non-negative latencies',
      counterexampleExpectedOutput: 'Dijkstra: ~0.08s execution time',
      counterexampleDecoyOutput: 'Bellman-Ford: >30.0s Timeout (TLE)',
    },
    timeComplexity: 'O((V + E) log V)',
    spaceComplexity: 'O(V)',
    keyDiscriminativeQuestions: [
      'Are any edge weights negative or do any negative weight cycles exist?',
      'Are edge costs strictly non-negative (e.g. physical latency, distance)?',
      'Can an already settled vertex distance ever decrease later in the execution?',
    ],
  },

  shortest_path_bellman_ford: {
    id: 'shortest_path_bellman_ford',
    title: 'Cross-Currency Arbitrage Routing with Negative Logs',
    domain: 'algorithms_data_structures',
    correctCategory: 'shortest_path_bellman_ford',
    canonicalStrategyName: 'Bellman-Ford Dynamic Edge Relaxation with Negative Cycle Detection',
    problemStatement:
      'A financial trading exchange lists exchange rates r(u, v) between currencies. Converting along a path multiplies rates. By taking negative logarithms w(u, v) = -ln(r(u, v)), finding arbitrage corresponds to finding negative cycles or shortest paths in a graph where edge weights can be strictly negative.',
    formalParameters: {
      vertices: 'Currencies V <= 100',
      edges: 'Pairs E <= 1000',
      weights: 'w(u, v) in R (both positive and negative)',
    },
    surfaceContext: {
      storyTheme: 'High-Frequency Currency Exchange Desk',
      observableEntities: [
        'currency nodes',
        'exchange rates',
        'transaction spread',
        'arbitrage loop',
      ],
      superficialKeywords: [
        'fastest exchange',
        'shortest transaction path',
        'minimal conversion cost',
      ],
    },
    structuralConstraint: {
      invariantName: 'Dynamic Programming Subpath Relaxation with Negative Weight Tolerance',
      mathematicalCondition: 'V-1 relaxation passes + 1 detection pass for negative cycles',
      whyDecoyFails:
        'Dijkstra fundamentally breaks down in the presence of negative edge weights because its greedy assumption (that extracting the minimum distance vertex permanently fixes its shortest distance) is violated.',
      governingPrinciple: 'Dynamic subproblem edge relaxation without greedy settlement assumption',
    },
    decoyTrap: {
      decoyCategory: 'shortest_path_dijkstra',
      decoyStrategyName: 'Dijkstra Algorithm with Priority Queue',
      superficialRationale:
        'We want the shortest path between currency nodes, and Dijkstra is the standard shortest path algorithm.',
      counterexampleExplanation:
        'Graph with S->A (weight 2), S->B (weight 5), B->A (weight -4). Dijkstra visits A first with distance 2 and marks it visited. It then visits B (distance 5), and sees B->A gives 5 - 4 = 1. But A was already closed! Dijkstra outputs 2 instead of 1.',
      counterexampleInput: 'Edges: S->A (2), S->B (5), B->A (-4)',
      counterexampleExpectedOutput: 'Bellman-Ford Correct: dist[A] = 1 (via B)',
      counterexampleDecoyOutput: 'Dijkstra Incorrect: dist[A] = 2',
    },
    timeComplexity: 'O(V * E)',
    spaceComplexity: 'O(V)',
    keyDiscriminativeQuestions: [
      'Do edge weights contain negative values after mathematical transformation?',
      'Is detection of infinite negative cycles required?',
      'Does the greedy principle hold that a visited vertex distance cannot be reduced further?',
    ],
  },

  linear_selection_quickselect: {
    id: 'linear_selection_quickselect',
    title: 'Streaming Telemetry 95th Percentile Metric',
    domain: 'algorithms_data_structures',
    correctCategory: 'linear_selection_quickselect',
    canonicalStrategyName: 'Hoare Quickselect (Expected O(N) In-Place Partitioning)',
    problemStatement:
      'Given an unsorted telemetry log containing N = 10,000,000 latency measurements, determine the exact value at the 95th percentile (the k-th smallest element). Full ordering of the remaining 9,999,999 elements is NOT required.',
    formalParameters: {
      elements: 'N = 10^7',
      k: 'k = 0.95 * N',
      outputRequirement: 'Value at index k only',
    },
    surfaceContext: {
      storyTheme: 'Cloud Infrastructure Observability Pipeline',
      observableEntities: [
        'server clusters',
        'latency pings',
        'SLA percentiles',
        'metrics collector',
      ],
      superficialKeywords: [
        'sort metrics',
        'find 95th percentile',
        'rank order latencies',
        'telemetry sorting',
      ],
    },
    structuralConstraint: {
      invariantName: 'Single-Sided Pivot Partitioning Invariant',
      mathematicalCondition: 'T(N) = T(N/2) + O(N) = O(N) expected',
      whyDecoyFails:
        'Full sorting (Mergesort, Timsort, Heapsort) performs unnecessary work by sorting all N elements in O(N log N) time, doing ~240 million operations when selection only requires ~20 million operations.',
      governingPrinciple: 'Recursive elimination of non-candidate partition half',
    },
    decoyTrap: {
      decoyCategory: 'divide_and_conquer_sort',
      decoyStrategyName: 'Full Mergesort / QuickSort Full Ordering',
      superficialRationale:
        'To find the 95th percentile, we sort the entire array and inspect array[k].',
      counterexampleExplanation:
        'Sorting N = 10^7 items in O(N log N) requires ~2.4x10^8 operations and O(N) auxiliary RAM. Quickselect executes in expected O(N) time (~2x10^7 operations) with zero auxiliary memory.',
      counterexampleInput: 'N = 10,000,000 latency floats',
      counterexampleExpectedOutput: 'Quickselect: ~0.12s runtime, O(1) auxiliary space',
      counterexampleDecoyOutput: 'Full Sort: ~1.85s runtime, high cache thrashing',
    },
    timeComplexity:
      'O(N) expected, O(N^2) worst case (or O(N) deterministic with Median-of-Medians)',
    spaceComplexity: 'O(1) auxiliary in-place',
    keyDiscriminativeQuestions: [
      'Is full ordering of all N elements required, or only the element at rank k?',
      'Can non-candidate partitions be safely discarded after a single pivot pass?',
      'Is memory bandwidth limited such that extra logarithmic sorting passes incur heavy cache miss penalties?',
    ],
  },

  interval_scheduling_greedy: {
    id: 'interval_scheduling_greedy',
    title: 'Astronomical Observatory Telescope Booking',
    domain: 'algorithms_data_structures',
    correctCategory: 'interval_scheduling_greedy',
    canonicalStrategyName: 'Earliest Finish Time (EFT) Greedy Interval Selection',
    problemStatement:
      'An orbital telescope has a queue of N observation requests. Each request has a fixed start time s_i and end time f_i. The telescope can only observe one target at any instant. Select the maximum possible number of compatible non-overlapping observations.',
    formalParameters: {
      requests: 'N <= 200000',
      intervals: '[s_i, f_i) intervals',
      objective: 'Maximize count of scheduled intervals on 1 resource',
    },
    surfaceContext: {
      storyTheme: 'James Webb Space Telescope Target Queue',
      observableEntities: [
        'orbital telescope',
        'astronomy teams',
        'observation windows',
        'target galaxies',
      ],
      superficialKeywords: [
        'schedule calendar',
        'maximize observations',
        'room booking',
        'time allocation',
      ],
    },
    structuralConstraint: {
      invariantName: 'Earliest Finish Time Monotonicity & Greedy Choice',
      mathematicalCondition: 'Sort by f_i asc, select if s_i >= f_prev',
      whyDecoyFails:
        'Interval partitioning (coloring) solves finding the minimum number of parallel rooms/telescopes, whereas here there is strictly ONE resource and the goal is maximizing compatible count.',
      governingPrinciple:
        'Greedy choice frees the resource as early as possible for future requests',
    },
    decoyTrap: {
      decoyCategory: 'interval_partitioning_rooms',
      decoyStrategyName: 'Minimum Parallel Resource Allocation (Chamber Coloring)',
      superficialRationale:
        'Treat this as a multi-room booking problem and assign intervals to priority queue clusters.',
      counterexampleExplanation:
        'Interval partitioning assumes infinite or multiple available telescopes and tries to minimize equipment, whereas here we only have ONE single telescope and must reject conflicting proposals.',
      counterexampleInput: 'Single telescope with overlapping proposals',
      counterexampleExpectedOutput: 'Greedy EFT: Selects maximal independent set of 8 proposals',
      counterexampleDecoyOutput:
        'Partitioning Logic: Reports needing 4 telescopes (violating physical constraint)',
    },
    timeComplexity: 'O(N log N) sorting + O(N) scan',
    spaceComplexity: 'O(1) auxiliary',
    keyDiscriminativeQuestions: [
      'Is there exactly ONE single resource, or can multiple parallel resources be provisioned?',
      'Is the objective maximizing the count of accepted intervals, or accommodating all intervals across minimal resources?',
      'Does picking the earliest ending interval leave maximal remaining time for future choices?',
    ],
  },
}

// ---------------------------------------------------------------------------
// 3. Cognitive Distance & Discrimination Algorithms
// ---------------------------------------------------------------------------

/**
 * Computes surface feature distance between two problems in [0, 1].
 * A distance of 0 means identical narrative storyline and vocabulary.
 * A distance of 1 means completely dissimilar surface themes.
 */
export function computeSurfaceFeatureDistance(
  p1: InterleavedProblemDefinition,
  p2: InterleavedProblemDefinition,
): number {
  if (p1.id === p2.id) return 0

  let sharedKeywords = 0
  const allKeywords = new Set([
    ...p1.surfaceContext.superficialKeywords,
    ...p2.surfaceContext.superficialKeywords,
  ])

  for (const kw of p1.surfaceContext.superficialKeywords) {
    if (p2.surfaceContext.superficialKeywords.some((k) => k.toLowerCase() === kw.toLowerCase())) {
      sharedKeywords++
    }
  }

  const keywordJaccard = allKeywords.size > 0 ? sharedKeywords / allKeywords.size : 0
  const sameDomain = p1.domain === p2.domain ? 0.3 : 0.0
  const sameStory = p1.surfaceContext.storyTheme === p2.surfaceContext.storyTheme ? 0.4 : 0.0

  const surfaceSimilarity = keywordJaccard * 0.3 + sameDomain + sameStory
  return Math.max(0, Math.min(1, 1 - surfaceSimilarity))
}

/**
 * Computes deep structural invariant distance between two problems in [0, 1].
 * A distance of 0 means they belong to the exact same algorithmic/mathematical category.
 * A distance of 1 means they belong to opposing paradigms (e.g. Greedy vs NP-complete).
 */
export function computeDeepStructuralDistance(
  p1: InterleavedProblemDefinition,
  p2: InterleavedProblemDefinition,
): number {
  if (p1.id === p2.id) return 0
  if (p1.correctCategory === p2.correctCategory) return 0.05

  // Check if one problem is the canonical decoy trap of the other
  if (
    p1.decoyTrap.decoyCategory === p2.correctCategory ||
    p2.decoyTrap.decoyCategory === p1.correctCategory
  ) {
    return 0.85 // High structural divergence despite surface lure
  }

  return 0.95 // Completely distinct structural paradigms
}

/**
 * Evaluates a learner's discrimination attempt against an interleaved problem.
 * Tracks whether the learner fell into the surface decoy trap, correctly identified the deep invariant,
 * and articulated mechanistic reasoning.
 */
export function evaluateDiscriminationAttempt(
  problem: InterleavedProblemDefinition,
  attempt: DiscriminationAttempt,
): DiscriminationEvaluationTelemetry {
  const isCategoryCorrect = attempt.selectedCategory === problem.correctCategory
  const isDecoyTrapped = attempt.selectedCategory === problem.decoyTrap.decoyCategory

  // Analyze justification text for mechanistic invariant concepts
  const lowerText = attempt.learnerJustification.toLowerCase()
  const keyTokens = [
    ...problem.structuralConstraint.invariantName.toLowerCase().split(/\s+/),
    ...problem.structuralConstraint.governingPrinciple.toLowerCase().split(/\s+/),
  ].filter((t) => t.length > 3)

  let matches = 0
  for (const token of keyTokens) {
    if (lowerText.includes(token)) {
      matches++
    }
  }

  const keywordCoverage =
    keyTokens.length > 0 ? Math.min(1, matches / Math.min(keyTokens.length, 6)) : 0

  // Surface bias penalty: high if decoy trapped or if justification fixates on superficial keywords
  let surfaceBiasPenalty = 0.0
  if (isDecoyTrapped) {
    surfaceBiasPenalty += 0.5
  }
  const surfaceMentionCount = problem.surfaceContext.superficialKeywords.filter((kw) =>
    lowerText.includes(kw.toLowerCase()),
  ).length
  surfaceBiasPenalty += Math.min(0.5, surfaceMentionCount * 0.15)
  surfaceBiasPenalty = Math.min(1.0, surfaceBiasPenalty)

  // Structural discrimination score (0 to 100)
  let discriminationScore = 0
  if (isCategoryCorrect) {
    discriminationScore += 60
    discriminationScore += Math.round(keywordCoverage * 30)
    if (surfaceBiasPenalty < 0.2) {
      discriminationScore += 10 // Bonus for complete surface immunity
    }
  } else if (!isDecoyTrapped) {
    discriminationScore = 20 // Erred, but did not fall for the novice decoy trap
  } else {
    discriminationScore = Math.max(5, Math.round(keywordCoverage * 15)) // Caught in the trap
  }

  // FSRS Interleaved Spacing Multiplier:
  // Rohrer & Taylor (2007) demonstrate that mastering discrimination under interleaved conditions
  // yields substantially higher delayed memory stability compared to blocked repetition.
  const fsrsStabilityBonus = isCategoryCorrect
    ? Number((1.35 + (discriminationScore / 100) * 1.1).toFixed(2)) // Up to 2.45x
    : 1.0

  // Confusion vector update
  const confusionVector: Record<ProblemCategory, number> = {
    dynamic_programming: 0,
    greedy_choice: 0,
    shortest_path_dijkstra: 0,
    shortest_path_bellman_ford: 0,
    linear_selection_quickselect: 0,
    divide_and_conquer_sort: 0,
    interval_scheduling_greedy: 0,
    interval_partitioning_rooms: 0,
    monotonic_stack: 0,
    sliding_window_two_pointer: 0,
    eulerian_circuit: 0,
    hamiltonian_cycle_np: 0,
  }
  confusionVector[attempt.selectedCategory] = 1

  let feedbackMessage = ''
  if (isCategoryCorrect) {
    feedbackMessage = `Mastery achieved! You correctly classified this problem under ${problem.correctCategory.replace(/_/g, ' ')} and resisted the surface trap.`
  } else if (isDecoyTrapped) {
    feedbackMessage = `Surface Decoy Trap! You fell for ${problem.decoyTrap.decoyStrategyName}. While the narrative features suggest this strategy, the deep constraint breaks it.`
  } else {
    feedbackMessage = `Misclassification: Selected ${attempt.selectedCategory.replace(/_/g, ' ')}, but governing invariant is ${problem.structuralConstraint.invariantName}.`
  }

  return {
    problemId: problem.id,
    isCategoryCorrect,
    isDecoyTrapped,
    surfaceBiasPenalty,
    structuralDiscriminationScore: discriminationScore,
    justificationKeywordCoverage: keywordCoverage,
    fsrsStabilityBonus,
    categoryConfusionVector: confusionVector,
    feedbackMessage,
    deepRemediationAdvice: problem.structuralConstraint.whyDecoyFails,
  }
}

// ---------------------------------------------------------------------------
// 4. Interleaving Session State Machine
// ---------------------------------------------------------------------------

export type InterleavingMode = 'blocked' | 'interleaved' | 'adaptive_contrast'

export interface InterleavingSessionState {
  mode: InterleavingMode
  problemIds: string[]
  currentProblemIndex: number
  attempts: Record<string, DiscriminationAttempt>
  evaluations: Record<string, DiscriminationEvaluationTelemetry>
  confusionMatrix: Record<string, Record<string, number>>
  overallMetrics: InterleavingSessionMetrics
}

export class InterleavedDiscriminationSession {
  private state: InterleavingSessionState
  private problems: Record<string, InterleavedProblemDefinition>

  constructor(
    customProblems?: Record<string, InterleavedProblemDefinition>,
    initialMode: InterleavingMode = 'adaptive_contrast',
  ) {
    this.problems = customProblems ?? CALIBRATED_INTERLEAVED_PROBLEMS
    const problemList = this.generateSequence(initialMode)

    this.state = {
      mode: initialMode,
      problemIds: problemList,
      currentProblemIndex: 0,
      attempts: {},
      evaluations: {},
      confusionMatrix: {},
      overallMetrics: {
        totalAttempts: 0,
        correctCategories: 0,
        decoyTrapsFellInto: 0,
        averageDiscriminationScore: 0,
        averageResponseTimeMs: 0,
        rohrerDiscriminationIndex: 0,
        surfaceFeatureImmunityRate: 1.0,
      },
    }
  }

  public getState(): Readonly<InterleavingSessionState> {
    return { ...this.state }
  }

  public getCurrentProblem(): InterleavedProblemDefinition | null {
    const id = this.state.problemIds[this.state.currentProblemIndex]
    if (!id) return null
    return this.problems[id] ?? null
  }

  public setMode(mode: InterleavingMode): void {
    this.state.mode = mode
    this.state.problemIds = this.generateSequence(mode)
    this.state.currentProblemIndex = 0
  }

  public recordAttempt(attempt: DiscriminationAttempt): DiscriminationEvaluationTelemetry | null {
    const problem = this.problems[attempt.problemId]
    if (!problem) return null

    const telemetry = evaluateDiscriminationAttempt(problem, attempt)
    this.state.attempts[problem.id] = attempt
    this.state.evaluations[problem.id] = telemetry

    // Update confusion matrix
    if (!this.state.confusionMatrix[problem.correctCategory]) {
      this.state.confusionMatrix[problem.correctCategory] = {}
    }
    const row = this.state.confusionMatrix[problem.correctCategory]!
    row[attempt.selectedCategory] = (row[attempt.selectedCategory] ?? 0) + 1

    // Recompute overall metrics
    this.recomputeMetrics()

    return telemetry
  }

  public advance(): boolean {
    if (this.state.currentProblemIndex < this.state.problemIds.length - 1) {
      this.state.currentProblemIndex++
      return true
    }
    return false
  }

  public selectProblem(id: string): void {
    const idx = this.state.problemIds.indexOf(id)
    if (idx !== -1) {
      this.state.currentProblemIndex = idx
    }
  }

  private generateSequence(mode: InterleavingMode): string[] {
    const ids = Object.keys(this.problems)
    if (ids.length <= 1) return ids

    if (mode === 'blocked') {
      // Sort by category so same-category problems are adjacent
      return [...ids].sort((a, b) => {
        const catA = this.problems[a]?.correctCategory ?? ''
        const catB = this.problems[b]?.correctCategory ?? ''
        return catA.localeCompare(catB)
      })
    }

    if (mode === 'adaptive_contrast') {
      // Pair contrasting problems back-to-back: e.g. 0/1 knapsack followed immediately by fractional knapsack
      const paired: string[] = []
      const used = new Set<string>()

      for (const id of ids) {
        if (used.has(id)) continue
        paired.push(id)
        used.add(id)

        // Find its closest surface match that has an opposing category
        const prob = this.problems[id]!
        let bestOpposingId: string | null = null
        let lowestSurfaceDistance = 2.0

        for (const candidateId of ids) {
          if (used.has(candidateId)) continue
          const candidate = this.problems[candidateId]!
          if (candidate.correctCategory === prob.correctCategory) continue

          const dist = computeSurfaceFeatureDistance(prob, candidate)
          if (dist < lowestSurfaceDistance) {
            lowestSurfaceDistance = dist
            bestOpposingId = candidateId
          }
        }

        if (bestOpposingId) {
          paired.push(bestOpposingId)
          used.add(bestOpposingId)
        }
      }

      // Add any remaining
      for (const id of ids) {
        if (!used.has(id)) paired.push(id)
      }

      return paired
    }

    // Default interleaved: pseudorandom shuffle ensuring no adjacent same-category
    const shuffled = [...ids].sort(() => 0.5 - Math.random())
    return shuffled
  }

  private recomputeMetrics(): void {
    const evals = Object.values(this.state.evaluations)
    if (evals.length === 0) return

    const total = evals.length
    const correct = evals.filter((e) => e.isCategoryCorrect).length
    const trapped = evals.filter((e) => e.isDecoyTrapped).length
    const avgScore = evals.reduce((acc, e) => acc + e.structuralDiscriminationScore, 0) / total

    const attemptsList = Object.values(this.state.attempts)
    const avgTime =
      attemptsList.reduce((acc, a) => acc + a.timeSpentMs, 0) / (attemptsList.length || 1)

    // Rohrer Discrimination Index: 0.5 * accuracy + 0.3 * (1 - trapRate) + 0.2 * (avgScore / 100)
    const accuracyRate = correct / total
    const trapRate = trapped / total
    const rdi = Math.round(
      (accuracyRate * 0.5 + (1 - trapRate) * 0.3 + (avgScore / 100) * 0.2) * 100,
    )

    this.state.overallMetrics = {
      totalAttempts: total,
      correctCategories: correct,
      decoyTrapsFellInto: trapped,
      averageDiscriminationScore: Math.round(avgScore),
      averageResponseTimeMs: Math.round(avgTime),
      rohrerDiscriminationIndex: Math.max(0, Math.min(100, rdi)),
      surfaceFeatureImmunityRate: Number((1.0 - trapRate).toFixed(2)),
    }
  }
}

// ---------------------------------------------------------------------------
// 5. FSRS Interleaved Card Exporter
// ---------------------------------------------------------------------------

/**
 * Exports contrasting interleaved problem pairs into dual-sided FSRS review cards.
 * Forces the learner to articulate the exact mathematical constraint that breaks the decoy.
 */
export function exportInterleavedToFSRSCards(
  session: InterleavedDiscriminationSession,
): FSRSInterleavedCard[] {
  const state = session.getState()
  const cards: FSRSInterleavedCard[] = []

  for (const [probId, telemetry] of Object.entries(state.evaluations)) {
    const problem = CALIBRATED_INTERLEAVED_PROBLEMS[probId]
    if (!problem) continue

    const cardId = `fsrs_interleaved_${problem.id}`
    const stabilityDays = Number((4.5 * telemetry.fsrsStabilityBonus).toFixed(1))

    cards.push({
      id: cardId,
      front: `### Interleaved Problem Discrimination: ${problem.title}\n\n**Problem Statement:**\n> ${problem.problemStatement}\n\n**Core Question:**\nDoes this problem require **${problem.correctCategory.replace(/_/g, ' ')}** or **${problem.decoyTrap.decoyCategory.replace(/_/g, ' ')}**, and what exact constraint decides the choice?`,
      back: `### Governing Invariant: ${problem.structuralConstraint.invariantName}\n\n- **Correct Strategy:** ${problem.canonicalStrategyName}\n- **Formal Condition:** \`${problem.structuralConstraint.mathematicalCondition}\`\n\n**Why the Decoy (${problem.decoyTrap.decoyStrategyName}) Fails:**\n${problem.structuralConstraint.whyDecoyFails}\n\n**Counterexample:**\n- Input: \`${problem.decoyTrap.counterexampleInput}\`\n- Correct: ${problem.decoyTrap.counterexampleExpectedOutput}\n- Decoy Trap: ${problem.decoyTrap.counterexampleDecoyOutput}`,
      pairedContrastCategory: problem.decoyTrap.decoyCategory,
      suggestedStabilityDays: stabilityDays,
      tags: [
        'interleaved-practice',
        'structural-invariance',
        problem.domain,
        problem.correctCategory,
      ],
    })
  }

  return cards
}

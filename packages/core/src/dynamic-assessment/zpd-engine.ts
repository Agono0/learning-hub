/**
 * @file zpd-engine.ts
 * @description Dynamic Assessment & Zone of Proximal Development (ZPD) Engine
 *
 * Grounded in foundational cognitive science, educational psychology, and psychometric research:
 * 1. Lev S. Vygotsky (1978) - "Mind in Society: The Development of Higher Psychological Processes",
 *    Harvard University Press. Formulates the Zone of Proximal Development (ZPD) as the distance
 *    between Actual Developmental Level (independent problem solving) and Potential Developmental
 *    Level (problem solving under adult guidance or in collaboration with more capable peers).
 * 2. Reuven Feuerstein et al. (1979, 1980) - "The Dynamic Assessment of Retarded Performers: The
 *    Learning Potential Assessment Device (LPAD)" and "Instrumental Enrichment". Establishes the
 *    Theory of Structural Cognitive Modifiability (SCM) and Mediated Learning Experience (MLE) with
 *    three universal criteria: Intentionality/Reciprocity, Meaning Transcendence, and Competence.
 * 3. Joseph C. Campione & Ann L. Brown (1984, 1987) - "Linking Dynamic Assessment with School
 *    Achievement" and "Graduated Prompting". Pioneers the 5-tier standardized graduated prompt
 *    hierarchy (metacognitive orientation -> structural clue -> strategic heuristic -> concrete step ->
 *    direct demonstration) and quantitative prompt efficiency metrics.
 * 4. Milton Budoff (1987) - "The Validity and Utility of Learning Potential Assessment". Formulates
 *    the Learning Potential Score (LPS) gain ratio: LPS = (Post - Pre) / (Max - Pre).
 * 5. Robert J. Sternberg & Elena L. Grigorenko (2002) - "Dynamic Testing: The Nature and Measurement
 *    of Learning Potential", Cambridge University Press. Formalizes sandwich vs cake testing paradigms
 *    and transfer distance gradients (near, medium, and far transfer).
 * 6. Free Spaced Repetition Scheduler (FSRS-6) integration: dynamically adjusts initial review stability
 *    (S₀) using the Cognitive Modifiability Index (CMI) and Transfer Autonomy Score (TAS).
 *
 * @module @learning-hub/core/dynamic-assessment
 */

import { z } from 'zod'

// ============================================================================
// 1. ZOD SCHEMAS & BOUNDARIES
// ============================================================================

export const PromptTierEnum = z.enum([
  'tier_1_metacognitive_orientation',
  'tier_2_structural_invariant',
  'tier_3_strategic_heuristic',
  'tier_4_concrete_subgoal',
  'tier_5_worked_demonstration',
])
export type PromptTier = z.infer<typeof PromptTierEnum>

export const TransferDistanceEnum = z.enum(['near', 'medium', 'far'])
export type TransferDistance = z.infer<typeof TransferDistanceEnum>

export const LearnerTypologyEnum = z.enum([
  'high_achiever',
  'high_potential_gainer',
  'moderate_gainer',
  'emerging_learner',
])
export type LearnerTypology = z.infer<typeof LearnerTypologyEnum>

export const GraduatedPromptSchema = z.object({
  tier: PromptTierEnum,
  tierLevel: z.number().int().min(1).max(5),
  title: z.string().min(1),
  promptText: z.string().min(1),
  mediatorRationale: z.string().min(1),
  structuralPrinciple: z.string().min(1),
  cognitiveLoadImpact: z.number().min(0).max(10),
  weight: z.number().min(1).max(5),
})
export type GraduatedPrompt = z.infer<typeof GraduatedPromptSchema>

export const AssessmentProblemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  context: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string()).min(2),
  correctOptionIndex: z.number().int().min(0),
  explanation: z.string().min(1),
  deepStructureConcept: z.string().min(1),
  prompts: z.array(GraduatedPromptSchema).length(5),
})
export type AssessmentProblem = z.infer<typeof AssessmentProblemSchema>

export const TransferProbeSchema = z.object({
  id: z.string().min(1),
  distance: TransferDistanceEnum,
  title: z.string().min(1),
  surfaceContext: z.string().min(1),
  isomorphicPrinciple: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string()).min(2),
  correctOptionIndex: z.number().int().min(0),
  explanation: z.string().min(1),
})
export type TransferProbe = z.infer<typeof TransferProbeSchema>

export const DynamicAssessmentScenarioSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  theoreticalCore: z.string().min(1),
  preTestProblem: AssessmentProblemSchema,
  mediatedProblem: AssessmentProblemSchema,
  postTestProblem: AssessmentProblemSchema,
  transferProbes: z.array(TransferProbeSchema).min(3),
})
export type DynamicAssessmentScenario = z.infer<typeof DynamicAssessmentScenarioSchema>

export const PromptAttemptEventSchema = z.object({
  tierLevel: z.number().int().min(1).max(5),
  timestamp: z.number(),
  timeSpentMs: z.number().min(0),
})
export type PromptAttemptEvent = z.infer<typeof PromptAttemptEventSchema>

export const ZpdMetricsSchema = z.object({
  actualDevelopmentalLevel: z.number().min(0).max(100), // ADL (Pre-test)
  potentialDevelopmentalLevel: z.number().min(0).max(100), // PDL (Post-test / Assisted)
  zpdBandwidth: z.number().min(0).max(100), // PDL - ADL
  learningPotentialScore: z.number().min(0).max(1), // Budoff gain ratio
  cognitiveModifiabilityIndex: z.number().min(0).max(1), // Feuerstein CMI
  promptEfficiencyScore: z.number().min(0).max(1), // Campione & Brown efficiency
  transferAutonomyScore: z.number().min(0).max(1), // Near, medium, far transfer autonomy
  promptsConsumedCount: z.number().int().min(0).max(5),
  scaffoldingDecayRate: z.number(), // Exponential decay lambda
  typology: LearnerTypologyEnum,
  typologyDescription: z.string(),
  frustrationHorizon: z.number().min(0).max(100),
})
export type ZpdMetrics = z.infer<typeof ZpdMetricsSchema>

export const FSRSZpdFlashcardSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  concept: z.string(),
  front: z.string(),
  back: z.string(),
  principle: z.string(),
  recommendedStabilityDays: z.number().min(0.1),
  difficultyScore: z.number().min(1).max(10),
  tags: z.array(z.string()),
})
export type FSRSZpdFlashcard = z.infer<typeof FSRSZpdFlashcardSchema>

// ============================================================================
// 2. CANONICAL MULTIDISCIPLINARY SCENARIOS
// ============================================================================

export const CANONICAL_ZPD_SCENARIOS: DynamicAssessmentScenario[] = [
  {
    id: 'algo_dynamic_programming',
    domain: 'Computer Science & Algorithmics',
    title: 'Optimal Substructure & Memoized Recurrence',
    subtitle: 'Dynamic Programming decomposition from 0/1 Knapsack to RNA Secondary Folding',
    theoreticalCore:
      'Bellman principle of optimality (1957) and overlapping subproblems in state DAGs.',
    preTestProblem: {
      id: 'algo_pre_01',
      title: '0/1 Knapsack State Formulation',
      context:
        'A knapsack has capacity W = 8 kg. We have 4 items with weights [2, 3, 4, 5] and values [3, 4, 5, 8].',
      question:
        'Why does a greedy choice by value-to-weight ratio fail to guarantee the optimal knapsack value for 0/1 integer items?',
      options: [
        'Because the sorting algorithm takes O(N log N) time which exceeds polynomial bounds.',
        'Because indivisible items can leave leftover unused capacity that a different combination of items with lower ratios could have filled with higher total value.',
        'Because floating-point division errors prevent exact value-to-weight comparison.',
        'Because dynamic programming only works when all item weights are powers of two.',
      ],
      correctOptionIndex: 1,
      explanation:
        'In the 0/1 knapsack, items cannot be fractionally divided. A greedy choice might pick an item with ratio 2.0 (e.g., wt 5, val 10) leaving 3 kg empty, whereas two items of wt 4 and 4 with ratio 1.8 (total val 14.4) could fill the knapsack completely with superior aggregate value.',
      deepStructureConcept: 'Indivisibility & Combinatorial Capacity Discrepancy',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Metacognitive Reflection on Greediness',
          promptText:
            'Pause and reflect: When you make an irreversible local choice, what happens to the remaining capacity?',
          mediatorRationale:
            'Encourages metacognitive self-monitoring of local vs global constraints.',
          structuralPrinciple:
            'Local greedy decisions do not preserve global optimality without matroids.',
          cognitiveLoadImpact: 2.1,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Granularity & Capacity Waste',
          promptText:
            'Notice the structural invariant: unlike fractional items where 100% capacity is used, integer items leave irregular gaps.',
          mediatorRationale:
            'Guides attention to the structural barrier preventing fractional continuity.',
          structuralPrinciple: 'Discreteness prevents continuous space filling.',
          cognitiveLoadImpact: 3.4,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Heuristic: State Space Decomposition',
          promptText:
            'Formulate the choice as a binary recurrence for item i and remaining weight w: include item i or exclude item i.',
          mediatorRationale:
            'Equips the learner with the standard Bellman optimal substructure schema.',
          structuralPrinciple: 'DP[i][w] = max(DP[i-1][w], DP[i-1][w-wt[i]] + val[i]).',
          cognitiveLoadImpact: 4.8,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Subgoal Calculation',
          promptText:
            'Calculate: Compare item A (wt 5, val 8, ratio 1.6) alone in capacity 7 vs items B (wt 3, val 5) and C (wt 4, val 6). B+C yields val 11 in wt 7!',
          mediatorRationale: 'Demonstrates a concrete numerical counterexample to greedy choice.',
          structuralPrinciple: 'Direct empirical counterexample to ratio-based choice.',
          cognitiveLoadImpact: 6.0,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Full Worked Model Demonstration',
          promptText:
            'Full Model: In 0/1 knapsack, optimal substructure dictates DP[i][w] = max(DP[i-1][w], DP[i-1][w-w_i] + v_i). Greedy selection fails because it assumes fractional divisibility. Indivisibility necessitates exploring overlapping subproblems across capacity transitions.',
          mediatorRationale: 'Provides the complete expert model for immediate structural schema.',
          structuralPrinciple: 'Exhaustive verification of Bellman equation optimality.',
          cognitiveLoadImpact: 7.5,
          weight: 5,
        },
      ],
    },
    mediatedProblem: {
      id: 'algo_med_01',
      title: 'Longest Common Subsequence Memoization',
      context:
        'Strings S1 = "AGCAT" and S2 = "GACAT". We seek the length of their longest common subsequence (LCS).',
      question:
        'When computing LCS(i, j) where S1[i] !== S2[j], what is the correct state transition relation?',
      options: [
        'LCS(i, j) = LCS(i-1, j-1) + 1',
        'LCS(i, j) = max(LCS(i-1, j), LCS(i, j-1))',
        'LCS(i, j) = min(LCS(i-1, j), LCS(i, j-1))',
        'LCS(i, j) = LCS(i-1, j) * LCS(i, j-1)',
      ],
      correctOptionIndex: 1,
      explanation:
        'When the characters do not match, the optimal subsequence either does not include S1[i] (meaning LCS(i-1, j)) or does not include S2[j] (meaning LCS(i, j-1)). The optimal choice is the maximum of these two mutually exclusive reductions.',
      deepStructureConcept: 'Subproblem Disjunction & State Reduction',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Metacognitive Boundary Checking',
          promptText:
            'Ask yourself: If character S1[i] and character S2[j] are different, can both simultaneously be the terminal match of the common subsequence?',
          mediatorRationale: 'Prompts realization that characters cannot both be matched.',
          structuralPrinciple: 'Mutual exclusivity of non-identical character alignment.',
          cognitiveLoadImpact: 2.2,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Monotonic Subsequence Growth',
          promptText:
            'A subsequence preserves character order. Dropping either one unmatched character leaves all previously matched prefixes intact.',
          mediatorRationale: 'Highlights prefix preservation invariant.',
          structuralPrinciple: 'Prefix order invariance under character omission.',
          cognitiveLoadImpact: 3.5,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Heuristic: Independent Branch Pruning',
          promptText:
            'Branch into two candidate paths: exclude S1[i] or exclude S2[j]. Take the path that preserves the greatest subsequence length.',
          mediatorRationale: 'Structures the problem into two distinct recursive branches.',
          structuralPrinciple: 'Branch disjunction with max-operator selection.',
          cognitiveLoadImpact: 4.9,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Subgoal Evaluation',
          promptText:
            'Evaluate: S1="AG", S2="GA". They differ at end (G vs A). LCS("AG", "G") = 1, LCS("A", "GA") = 1. Max(1, 1) = 1.',
          mediatorRationale: 'Walks through miniature 2x2 grid calculation.',
          structuralPrinciple: 'Explicit grid transition evaluation.',
          cognitiveLoadImpact: 6.2,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Worked Model',
          promptText:
            'Full Derivation: If S1[i] == S2[j] then LCS(i, j) = 1 + LCS(i-1, j-1). If S1[i] != S2[j] then at most one can participate in the suffix match, hence LCS(i, j) = max(LCS(i-1, j), LCS(i, j-1)).',
          mediatorRationale: 'Provides the full canonical dynamic programming formulation.',
          structuralPrinciple: 'Complete dynamic programming state equation.',
          cognitiveLoadImpact: 7.7,
          weight: 5,
        },
      ],
    },
    postTestProblem: {
      id: 'algo_post_01',
      title: 'Matrix Chain Multiplication Parenthesization',
      context:
        'Multiplying 3 matrices A1 (10x30), A2 (30x5), A3 (5x60). We want to minimize scalar multiplications.',
      question:
        'In the matrix chain recurrence m[i, j] = min_{i <= k < j} { m[i, k] + m[k+1, j] + p_{i-1} * p_k * p_j }, what does the term p_{i-1} * p_k * p_j represent?',
      options: [
        'The memory storage needed for the resulting matrix in bytes.',
        'The scalar multiplication cost of multiplying the two subchain product matrices together.',
        'The time complexity of finding the optimal split point k.',
        'The eigenvalue determinant of matrix A_k.',
      ],
      correctOptionIndex: 1,
      explanation:
        'When subchain A[i..k] (dimension p_{i-1} x p_k) is multiplied with subchain A[k+1..j] (dimension p_k x p_j), computing the resulting matrix of dimension p_{i-1} x p_j requires exactly p_{i-1} * p_k * p_j scalar multiplications.',
      deepStructureConcept: 'Composite Merge Cost in Subproblem Combination',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Dimension Matching Self-Prompt',
          promptText:
            'What are the dimensions of matrix product (A1..Ak) and matrix product (Ak+1..Aj)?',
          mediatorRationale: 'Focuses learner on matrix inner vs outer dimensions.',
          structuralPrinciple: '(r x c) * (c x k) requires r * c * k scalar multiplications.',
          cognitiveLoadImpact: 2.0,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Merge Step Arithmetic',
          promptText:
            'Notice that solving subproblems is not free: merging their results incurs an operational cost.',
          mediatorRationale: 'Emphasizes composite combination overhead.',
          structuralPrinciple: 'Divide-and-conquer combination cost invariant.',
          cognitiveLoadImpact: 3.3,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Partition Heuristic',
          promptText:
            'Check the dimensions: Row count of left submatrix is p_{i-1}, shared column/row is p_k, column count of right submatrix is p_j.',
          mediatorRationale: 'Directly maps array index notation to physical matrix dimensions.',
          structuralPrinciple: 'Submatrix dimension tracking in chain products.',
          cognitiveLoadImpact: 4.7,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Dimension Example',
          promptText:
            'If A is (10x30) and B is (30x5), multiplying them produces a (10x5) matrix with 10 * 30 * 5 = 1500 operations.',
          mediatorRationale: 'Provides straightforward scalar verification.',
          structuralPrinciple: 'Direct numerical arithmetic verification.',
          cognitiveLoadImpact: 6.1,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Full Worked Derivation',
          promptText:
            'The recurrence partitions the chain into two contiguous products A[i..k] and A[k+1..j]. Their internal optimal costs are m[i, k] and m[k+1, j]. Combining these two matrices into the final product incurs the cost of multiplying a (p_{i-1} x p_k) matrix by a (p_k x p_j) matrix, which is p_{i-1} * p_k * p_j.',
          mediatorRationale: 'Exhaustive explanation tying recurrence to dimensional calculus.',
          structuralPrinciple: 'Total dynamic cost = left_cost + right_cost + merge_cost.',
          cognitiveLoadImpact: 7.4,
          weight: 5,
        },
      ],
    },
    transferProbes: [
      {
        id: 'algo_trans_near',
        distance: 'near',
        title: 'Longest Palindromic Subsequence (Near Transfer)',
        surfaceContext: 'String palindrome analysis where S = "BBABCBCAB".',
        isomorphicPrinciple: '2D interval dynamic programming across subsegments [i, j].',
        question:
          'In computing the longest palindromic subsequence LP[i, j] of string S, if S[i] == S[j], how does LP[i, j] relate to inner subproblem LP[i+1, j-1]?',
        options: [
          'LP[i, j] = LP[i+1, j-1] + 2',
          'LP[i, j] = LP[i+1, j-1] + 1',
          'LP[i, j] = max(LP[i+1, j], LP[i, j-1])',
          'LP[i, j] = 2 * LP[i+1, j-1]',
        ],
        correctOptionIndex: 0,
        explanation:
          'Because the outer two characters match (S[i] == S[j]), both characters contribute to the palindrome, expanding the inner optimal palindrome LP[i+1, j-1] by exactly 2 characters.',
      },
      {
        id: 'algo_trans_med',
        distance: 'medium',
        title: 'RNA Secondary Structure Base-Pair Folding (Medium Transfer)',
        surfaceContext:
          'Nussinov algorithm for RNA secondary structure predicting maximum nested hydrogen base pairs (A-U, G-C).',
        isomorphicPrinciple: 'Interval decomposition with pairing vs unpairing state bifurcation.',
        question:
          'In Nussinov RNA folding, why does predicting loop stability require interval DP over length d = j - i rather than standard left-to-right sequential prefix DP?',
        options: [
          'Because RNA sequences are read in reverse 3-to-5 direction by ribosomes.',
          'Because base pairing can occur between arbitrary distant bases i and j, creating nested inner intervals that must be solved before evaluating outer spans.',
          'Because floating RNA polymers have no defined starting index.',
          'Because Nussinov folding is NP-complete and interval DP is an approximation.',
        ],
        correctOptionIndex: 1,
        explanation:
          'RNA folding features long-range nested pairings where base i binds base j. To evaluate if (i, j) can pair, all internal substructures between i+1 and j-1 must already be optimized, necessitating bottom-up iteration by interval length.',
      },
      {
        id: 'algo_trans_far',
        distance: 'far',
        title: 'Triangulation of Convex Polygon (Far Transfer - Computational Geometry)',
        surfaceContext:
          'Partitioning a convex n-gon into triangles using non-intersecting chords to minimize total perimeter of chords.',
        isomorphicPrinciple:
          'Optimal substructure over cyclic perimeter chords isomorphic to matrix chain multiplication.',
        question:
          'How does optimal convex polygon triangulation map isomorphically to the matrix chain multiplication recurrence?',
        options: [
          'It does not map; geometry problems require Voronoi diagrams.',
          'Choosing an apex vertex k between base chord (i, j) forms triangle (i, k, j) and partitions the polygon into two independent sub-polygons (i..k) and (k..j), exactly isomorphic to parenthesizing subchains.',
          'Polygon area is always proportional to matrix determinants.',
          'The number of vertices n is equal to the memory word size in bits.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Any chord (i, j) forms a triangle with some intermediate vertex k (i < k < j), splitting the polygon into sub-polygon (i..k) and sub-polygon (k..j). The total weight is the weight of sub-polygon (i..k) + weight of sub-polygon (k..j) + perimeter of triangle (i, k, j), precisely matching m[i, k] + m[k+1, j] + cost(i, k, j).',
      },
    ],
  },
  {
    id: 'bio_enzyme_kinetics',
    domain: 'Biochemistry & Pharmacology',
    title: 'Enzyme Catalysis & Steady-State Kinetics',
    subtitle: 'From Michaelis-Menten saturation to Allosteric Cooperativity and Drug Clearance',
    theoreticalCore:
      'Briggs-Haldane pseudo-steady-state hypothesis (d[ES]/dt = 0) and hyperbolic binding isotherms.',
    preTestProblem: {
      id: 'bio_pre_01',
      title: 'Michaelis Constant Km Interpretation',
      context:
        'An enzyme catalyzes reaction S -> P. At substrate concentration [S] = 4 mM, the initial velocity is exactly half of Vmax (V0 = 0.5 Vmax).',
      question:
        'What is the precise physiological meaning of the Michaelis constant Km under the Briggs-Haldane steady-state model?',
      options: [
        'Km represents the maximum catalytic turnover rate kcat of the active site.',
        'Km is the substrate concentration at which half of the active sites are occupied at steady state, reflecting effective affinity.',
        'Km is the equilibrium dissociation constant of the enzyme-product complex [EP].',
        'Km is the activation energy barrier divided by temperature in Kelvin.',
      ],
      correctOptionIndex: 1,
      explanation:
        'By definition of the Michaelis-Menten equation V0 = (Vmax * [S]) / (Km + [S]), when [S] = Km, V0 = Vmax / 2. Under Briggs-Haldane kinetics, Km = (k-1 + k2) / k1, serving as an operational measure of enzyme-substrate affinity.',
      deepStructureConcept: 'Saturation Asymptote & Half-Maximal Operational Affinity',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Equation Structure Self-Check',
          promptText:
            'Set V0 = 0.5 * Vmax in the equation V0 = (Vmax * [S]) / (Km + [S]). What algebraic relationship emerges between [S] and Km?',
          mediatorRationale: 'Prompts algebraic deduction rather than rote recall.',
          structuralPrinciple: '0.5 = [S] / (Km + [S]) implies Km = [S].',
          cognitiveLoadImpact: 1.9,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Active Site Saturation',
          promptText:
            'Enzymes have a finite number of active sites. At infinite substrate, every site is occupied (Vmax). Half-saturation represents the inflection benchmark.',
          mediatorRationale: 'Grounds the mathematics in physical receptor occupancy.',
          structuralPrinciple: 'Finite catalytic capacity limits maximum reaction velocity.',
          cognitiveLoadImpact: 3.1,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Rate Constant Ratio Heuristic',
          promptText:
            'Km = (k-1 + k2) / k1. Notice the numerator is rate of breakdown of [ES], and denominator is rate of formation of [ES].',
          mediatorRationale: 'Explains microscopic kinetic basis of the macroscopic constant.',
          structuralPrinciple: 'Ratio of breakdown flux to synthesis flux.',
          cognitiveLoadImpact: 4.5,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Numerical Calculation',
          promptText:
            'If [S] = 4 mM produces V0 = 0.5 Vmax, then Km must be exactly 4 mM. A lower Km means the enzyme requires less substrate to reach half-saturation.',
          mediatorRationale: 'Translates affinity into inverse numerical requirement.',
          structuralPrinciple: 'Inverse relationship between Km value and substrate affinity.',
          cognitiveLoadImpact: 5.8,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Full Worked Model Demonstration',
          promptText:
            'Full Derivation: The Michaelis-Menten hyperbolic curve reaches an asymptote at Vmax. The parameter Km is defined as the concentration [S] producing V0 = Vmax / 2. Because Km = (k-1 + k2)/k1, a smaller Km signifies higher apparent affinity because fewer substrate molecules are needed to fill 50% of the active sites.',
          mediatorRationale:
            'Complete synthesis of thermodynamic affinity and operational kinetics.',
          structuralPrinciple: 'Universal hyperbolic ligand binding model.',
          cognitiveLoadImpact: 7.2,
          weight: 5,
        },
      ],
    },
    mediatedProblem: {
      id: 'bio_med_01',
      title: 'Lineweaver-Burk Double-Reciprocal Inversion',
      context:
        'Transforming the hyperbolic Michaelis-Menten equation into linear form: 1/V0 = (Km/Vmax) * (1/[S]) + (1/Vmax).',
      question:
        'In a Lineweaver-Burk plot, what is the graphical interpretation of the x-intercept and y-intercept?',
      options: [
        'x-intercept = -1/Km, y-intercept = 1/Vmax',
        'x-intercept = 1/Km, y-intercept = Vmax',
        'x-intercept = -Vmax, y-intercept = Km',
        'x-intercept = 0, y-intercept = kcat',
      ],
      correctOptionIndex: 0,
      explanation:
        'Setting 1/V0 = 0 yields (Km/Vmax) * (1/[S]) + 1/Vmax = 0, which simplifies to 1/[S] = -1/Km (the x-intercept). Setting 1/[S] = 0 yields 1/V0 = 1/Vmax (the y-intercept).',
      deepStructureConcept: 'Linear Reciprocal Transformation of Hyperbolic Manifolds',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Linear Equation Alignment',
          promptText:
            'Compare 1/V0 = (Km/Vmax)*(1/[S]) + (1/Vmax) to standard slope-intercept form y = m*x + b. What corresponds to y, x, m, and b?',
          mediatorRationale: 'Maps unfamiliar kinetic formula onto basic algebra schema.',
          structuralPrinciple: 'y = 1/V0, x = 1/[S], slope m = Km/Vmax, intercept b = 1/Vmax.',
          cognitiveLoadImpact: 2.0,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: The Zero Intercept Condition',
          promptText:
            'At the y-intercept, x = 0 (which means 1/[S] = 0, representing infinite substrate). What must 1/V0 equal when [S] -> infinity?',
          mediatorRationale: 'Anchors the y-intercept in physical asymptotic limits.',
          structuralPrinciple: 'Infinite substrate drives reaction velocity to Vmax.',
          cognitiveLoadImpact: 3.2,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Root Finding',
          promptText: 'For the x-intercept, set y = 0. Solve 0 = (Km/Vmax)*x + (1/Vmax) for x.',
          mediatorRationale: 'Guides linear root derivation step-by-step.',
          structuralPrinciple: 'x = -b / m = -(1/Vmax) / (Km/Vmax) = -1/Km.',
          cognitiveLoadImpact: 4.6,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Intercept Check',
          promptText:
            'If y-intercept is 0.05 min/umol, Vmax = 20 umol/min. If x-intercept is -0.2 mM^-1, Km = 5 mM.',
          mediatorRationale: 'Gives explicit numerical verification.',
          structuralPrinciple: 'Direct reciprocal inversion arithmetic.',
          cognitiveLoadImpact: 5.9,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Double-Reciprocal Model',
          promptText:
            'Lineweaver-Burk takes the reciprocal of V0 = Vmax[S]/(Km+[S]). Inverting both sides gives 1/V0 = (Km+[S])/(Vmax[S]) = (Km/Vmax)*(1/[S]) + (1/Vmax). Graphing y = 1/V0 against x = 1/[S] produces a straight line where y-intercept = 1/Vmax and x-intercept = -1/Km.',
          mediatorRationale: 'Full formal derivation from Michaelis-Menten equation.',
          structuralPrinciple: 'Comprehensive reciprocal linearization.',
          cognitiveLoadImpact: 7.3,
          weight: 5,
        },
      ],
    },
    postTestProblem: {
      id: 'bio_post_01',
      title: 'Competitive Inhibition Kinetic Diagnostics',
      context:
        'A reversible inhibitor binds exclusively to the free enzyme active site, preventing substrate binding.',
      question:
        'How does a competitive inhibitor alter the apparent Vmax and apparent Km in Lineweaver-Burk coordinates?',
      options: [
        'Apparent Vmax is unchanged; apparent Km increases (x-intercept moves closer to 0).',
        'Apparent Vmax decreases; apparent Km remains unchanged.',
        'Both apparent Vmax and apparent Km decrease by the same factor.',
        'Apparent Vmax increases; apparent Km decreases.',
      ],
      correctOptionIndex: 0,
      explanation:
        'Because high substrate concentrations can outcompete the competitive inhibitor, the maximal velocity Vmax is fully reachable (unchanged y-intercept). However, more substrate is required to achieve half-maximal velocity, raising apparent Km to Km*(1 + [I]/Ki). On the Lineweaver-Burk plot, the x-intercept (-1/Km_app) shifts to the right (closer to zero).',
      deepStructureConcept: 'Reversible Competition & Concentration-Dependent Displacement',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Infinite Substrate Limit',
          promptText:
            'If you add an infinite excess of substrate, can the inhibitor still compete for the active site?',
          mediatorRationale: 'Prompts boundary analysis to establish Vmax constancy.',
          structuralPrinciple: 'Competitive inhibition is overcome at saturating substrate.',
          cognitiveLoadImpact: 2.1,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Y-Intercept Pinning',
          promptText:
            'Since Vmax is unaffected at infinite substrate, the y-intercept (1/Vmax) must remain pinned in place while the slope increases.',
          mediatorRationale: 'Connects physical saturability to geometric intercept invariance.',
          structuralPrinciple: 'Invariance of y-intercept characterizes competitive mode.',
          cognitiveLoadImpact: 3.4,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Slope Alteration Heuristic',
          promptText:
            'Slope = Km_app / Vmax. If Km increases by factor alpha = (1 + [I]/Ki), the line rotates counter-clockwise around the fixed y-intercept.',
          mediatorRationale: 'Provides a visual geometric rotation model of inhibition.',
          structuralPrinciple: 'Rotational pivot around invariant (0, 1/Vmax).',
          cognitiveLoadImpact: 4.8,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Intercept Shift Calculation',
          promptText:
            'If Km increases from 2 mM to 4 mM, -1/Km moves from -0.5 to -0.25 (closer to zero). Vmax remains at 100, so 1/Vmax remains 0.01.',
          mediatorRationale: 'Numerical demonstration of x-intercept translation toward origin.',
          structuralPrinciple: 'Contraction of negative x-intercept magnitude.',
          cognitiveLoadImpact: 6.0,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Inhibition Diagnostic Model',
          promptText:
            'In competitive inhibition, inhibitor I and substrate S compete for the same binding site. At infinite [S], S displaces I completely, so Vmax is unchanged. But at sub-saturating [S], I lowers the fraction of productive [ES] complexes, increasing apparent Km to alpha*Km. On the Lineweaver-Burk plot, the line pivots around the identical y-intercept (1/Vmax), with a steeper slope and an x-intercept shifted rightward toward 0.',
          mediatorRationale: 'Comprehensive mechanistic and mathematical synthesis.',
          structuralPrinciple: 'Complete competitive inhibition characterization.',
          cognitiveLoadImpact: 7.5,
          weight: 5,
        },
      ],
    },
    transferProbes: [
      {
        id: 'bio_trans_near',
        distance: 'near',
        title: 'Non-Competitive Allosteric Inhibition (Near Transfer)',
        surfaceContext:
          'An inhibitor binds to an allosteric regulatory site with equal affinity for free enzyme E and complex ES.',
        isomorphicPrinciple:
          'Dual inactivation reducing catalytic turnover rate kcat without altering substrate binding affinity.',
        question:
          'In non-competitive inhibition, how do apparent Vmax and apparent Km change on a Lineweaver-Burk plot?',
        options: [
          'Vmax decreases (y-intercept increases); Km is unchanged (x-intercept remains fixed).',
          'Vmax increases; Km increases.',
          'Vmax is unchanged; Km increases.',
          'Both Vmax and Km increase proportionally.',
        ],
        correctOptionIndex: 0,
        explanation:
          'Because the inhibitor binds equally well whether substrate is present or not, substrate cannot outcompete it. Thus, effective active enzyme concentration is depleted, reducing Vmax (elevating 1/Vmax). The binding affinity of remaining active sites is unaltered, keeping Km and the x-intercept (-1/Km) fixed.',
      },
      {
        id: 'bio_trans_med',
        distance: 'medium',
        title: 'Hemoglobin Allosteric Hill Sigmoid Kinetics (Medium Transfer)',
        surfaceContext:
          'Oxygen binding to tetrameric hemoglobin exhibits positive cooperativity with Hill coefficient nH = 2.8.',
        isomorphicPrinciple:
          'Transition from hyperbolic Michaelis isotherm to sigmoidal cooperative multi-subunit conformational shift.',
        question:
          'Why does positive cooperativity produce a sigmoidal binding curve rather than a Michaelis-Menten hyperbola, and what physiological benefit does this confer?',
        options: [
          'It slows down oxygen absorption so red blood cells do not rupture under osmotic pressure.',
          'Binding of the first oxygen increases affinity in adjacent subunits, creating a switch-like sensitivity that maximizes oxygen loading in lungs and unloading in tissues.',
          'It converts hemoglobin from an enzyme into a structural fibrous protein.',
          'It eliminates the need for iron cofactors in the heme group.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Conformational change from the low-affinity T (tense) state to the high-affinity R (relaxed) state upon oxygen binding creates a steep sigmoidal saturation curve. This steep slope between lung pO2 (100 mmHg) and working muscle pO2 (20-40 mmHg) enables massive unloading that a flat hyperbolic curve could never deliver.',
      },
      {
        id: 'bio_trans_far',
        distance: 'far',
        title: 'Pharmacokinetic Drug Clearance & Zero-Order Saturation (Far Transfer)',
        surfaceContext:
          'Ethanol and phenytoin metabolism in hepatic cytochrome P450 enzymes transitioning from first-order to zero-order kinetics.',
        isomorphicPrinciple:
          'Saturating enzymatic clearance converting linear exponential half-life into constant-rate accumulation.',
        question:
          'When drug concentration [C] substantially exceeds hepatic enzyme Km ([C] >> Km), why does elimination transition to zero-order kinetics, and what is the severe clinical danger?',
        options: [
          'The drug begins evaporating directly through the alveolar lung capillaries.',
          'All enzyme active sites are saturated at Vmax, so clearance rate is fixed; small dose increases produce non-linear, runaway plasma accumulation and toxicity.',
          'Zero-order kinetics means elimination speed approaches infinity, rendering the drug ineffective.',
          'The drug binds irreversibly to serum albumin, turning blood into gel.',
        ],
        correctOptionIndex: 1,
        explanation:
          'When [C] >> Km, the rate equation V = Vmax*[C]/(Km + [C]) simplifies to V ≈ Vmax (constant, independent of concentration). Unlike first-order clearance where a constant fraction is eliminated per hour, zero-order elimination removes a constant absolute quantity. If intake exceeds this fixed Vmax capacity, plasma concentrations escalate catastrophically.',
      },
    ],
  },
  {
    id: 'aero_orbital_mechanics',
    domain: 'Aerospace Engineering & Astrodynamics',
    title: 'Keplerian Orbits & Impulsive Orbital Transfers',
    subtitle:
      'From Vis-Viva energy conservation to Hohmann Ellipses and Interplanetary Gravity Assists',
    theoreticalCore:
      'Conservation of specific mechanical energy (ε = -μ / 2a) and angular momentum in central gravity fields.',
    preTestProblem: {
      id: 'aero_pre_01',
      title: 'Vis-Viva Velocity Conservation',
      context:
        'A satellite orbits Earth (standard gravitational parameter μ = 398,600 km³/s²) in an elliptical orbit with semi-major axis a = 10,000 km.',
      question:
        'According to the Vis-Viva equation v² = μ * (2/r - 1/a), how does instantaneous orbital velocity v vary between periapsis (closest approach) and apoapsis (furthest distance)?',
      options: [
        'Velocity is constant throughout the entire orbit because total energy is conserved.',
        'Velocity is highest at periapsis where radius r is smallest, and lowest at apoapsis where r is largest.',
        'Velocity is highest at apoapsis to prevent the satellite from drifting away into deep space.',
        'Velocity depends only on the mass of the satellite, not on orbital radius.',
      ],
      correctOptionIndex: 1,
      explanation:
        'Total specific orbital energy ε = v²/2 - μ/r = -μ/(2a) is strictly conserved. At periapsis, radius r is minimal, so potential energy (-μ/r) is most negative. To preserve constant total energy, kinetic energy (v²/2) and orbital velocity v must be maximal.',
      deepStructureConcept: 'Gravitational Potential & Kinetic Energy Exchange',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Energy Conservation Metacognition',
          promptText:
            'As an object falls closer to Earth, what happens to its potential energy and kinetic energy?',
          mediatorRationale: 'Connects orbital dynamics to intuitive gravitational free-fall.',
          structuralPrinciple: 'Loss of gravitational potential energy converts to kinetic energy.',
          cognitiveLoadImpact: 1.8,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Constant Semi-Major Axis Energy',
          promptText:
            'In an unperturbed Keplerian orbit, semi-major axis a is invariant. Thus ε = -μ/(2a) is strictly constant across all points on the ellipse.',
          mediatorRationale: 'Emphasizes mechanical energy invariance.',
          structuralPrinciple: 'Constant specific energy ε along the entire orbit.',
          cognitiveLoadImpact: 3.0,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Radius Substitution',
          promptText:
            'Look at the term (2/r - 1/a). When r is small (periapsis), 2/r is very large, making v² large.',
          mediatorRationale: 'Direct inspection of the algebraic formula behavior.',
          structuralPrinciple: 'Monotonic inverse dependence of v on distance r.',
          cognitiveLoadImpact: 4.4,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Numerical Comparison',
          promptText:
            'For a = 10,000 km: at periapsis r = 7,000 km, (2/7000 - 1/10000) = 0.000185. At apoapsis r = 13,000 km, (2/13000 - 1/10000) = 0.000053. Velocity at periapsis is nearly double!',
          mediatorRationale: 'Quantifies the velocity differential.',
          structuralPrinciple: 'Explicit numerical validation of speed disparity.',
          cognitiveLoadImpact: 5.7,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Full Worked Model Demonstration',
          promptText:
            'The Vis-Viva equation v² = μ(2/r - 1/a) directly expresses energy conservation: specific kinetic energy v²/2 plus specific potential energy -μ/r equals total energy -μ/(2a). Because a is constant for a given orbit, decreasing r increases -μ/r, requiring v to increase. Therefore, speed reaches its maximum at periapsis and its minimum at apoapsis.',
          mediatorRationale: 'Full physical and mathematical derivation.',
          structuralPrinciple: 'Universal Keplerian kinetic-potential trade-off.',
          cognitiveLoadImpact: 7.1,
          weight: 5,
        },
      ],
    },
    mediatedProblem: {
      id: 'aero_med_01',
      title: 'Hohmann Transfer Ellipse Geometry',
      context:
        'Transferring a spacecraft from low circular orbit r1 = 7,000 km to geostationary orbit r2 = 42,000 km.',
      question:
        'What is the semi-major axis a_transfer of the elliptical Hohmann transfer orbit connecting r1 and r2?',
      options: [
        'a_transfer = (r1 + r2) / 2 = 24,500 km',
        'a_transfer = sqrt(r1 * r2) = 17,146 km',
        'a_transfer = r2 - r1 = 35,000 km',
        'a_transfer = 2 * r1 + r2 = 56,000 km',
      ],
      correctOptionIndex: 0,
      explanation:
        'The Hohmann transfer ellipse is tangent to both circular orbits. Its periapsis is r1 and its apoapsis is r2. Because major axis 2a is the distance from periapsis to apoapsis (2a = r1 + r2), the semi-major axis is exactly the arithmetic mean: a = (r1 + r2) / 2 = 24,500 km.',
      deepStructureConcept: 'Collinear Tangent Orbit Coupling & Major Axis Bisection',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Ellipse Axis Geometry Reflection',
          promptText:
            'Draw an ellipse in your mind: What is the total length of the major axis from periapsis to apoapsis in terms of r1 and r2?',
          mediatorRationale: 'Prompts geometric spatial reasoning of major axis.',
          structuralPrinciple: 'Major axis 2a = r_periapsis + r_apoapsis.',
          cognitiveLoadImpact: 1.9,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Tangency Minimizes Delta-V',
          promptText:
            'A Hohmann transfer is tangent to both circles at opposite apsides (180 degrees apart), eliminating steering losses.',
          mediatorRationale: 'Explains physical rationale for co-apsidal tangency.',
          structuralPrinciple: 'Tangential burns produce zero radial velocity waste.',
          cognitiveLoadImpact: 3.1,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Arithmetic Mean Heuristic',
          promptText: 'Semi-major axis a is half of the major axis 2a. Divide (r1 + r2) by 2.',
          mediatorRationale: 'Direct arithmetic mapping.',
          structuralPrinciple: 'a = (r_periapsis + r_apoapsis) / 2.',
          cognitiveLoadImpact: 4.5,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Dimension Calculation',
          promptText:
            'Calculate: 7,000 + 42,000 = 49,000 km. Dividing by 2 gives a_transfer = 24,500 km.',
          mediatorRationale: 'Explicit step calculation.',
          structuralPrinciple: 'Arithmetic midpoint calculation.',
          cognitiveLoadImpact: 5.8,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Hohmann Geometry Model',
          promptText:
            'A Hohmann transfer ellipse connects two concentric coplanar circular orbits. The departure point at r1 serves as the transfer ellipse periapsis, and the arrival point at r2 serves as its apoapsis. The full diameter of the ellipse is 2a = r1 + r2. Therefore, semi-major axis a_transfer = (r1 + r2)/2.',
          mediatorRationale: 'Comprehensive orbital geometry proof.',
          structuralPrinciple: 'Complete Hohmann transfer orbital parameters.',
          cognitiveLoadImpact: 7.2,
          weight: 5,
        },
      ],
    },
    postTestProblem: {
      id: 'aero_post_01',
      title: 'Oberth Effect Impulsive Efficiency',
      context:
        'A rocket performs an impulsive burn of Δv = 1,000 m/s to escape Earth orbit. The spacecraft can fire its engines either at periapsis (r = 6,600 km, v = 10,000 m/s) or at apoapsis (r = 40,000 km, v = 2,000 m/s).',
      question:
        'Why does firing the rocket engine at periapsis yield a far greater change in total orbital mechanical energy than firing at apoapsis (the Oberth Effect)?',
      options: [
        'Because Earth atmospheric drag is lower at periapsis.',
        'Because the change in specific kinetic energy is Δ(v²/2) = v*Δv + (Δv)²/2; thus higher initial velocity v multiplies the energy gained per unit of fuel.',
        'Because rocket engines produce higher thrust at lower altitudes.',
        'Because gravity turns off momentarily at periapsis.',
      ],
      correctOptionIndex: 1,
      explanation:
        'Kinetic energy is quadratic with velocity (E_k = 0.5 * m * v²). Taking the differential: dE_k = m * v * dv. For a fixed burn Δv, the mechanical work done on the spacecraft is W = F * d = F * v * dt. Because speed v is highest at periapsis, the propulsive energy transferred to the spacecraft is dramatically maximized.',
      deepStructureConcept: 'Quadratic Work-Energy Coupling & Velocity Multiplication',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Work Equation Self-Reflection',
          promptText:
            'Work done is Force multiplied by Distance (W = F * s). In time dt, distance is v * dt. When is distance traveled during a burn highest?',
          mediatorRationale:
            'Reframes rocket thrust through classical mechanics definition of work.',
          structuralPrinciple:
            'Power P = F * v; energy transfer rate scales linearly with velocity.',
          cognitiveLoadImpact: 2.0,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Quadratic Energy Growth',
          promptText:
            'Notice that squaring a large number yields much bigger differences than squaring a small number: (11² - 10²) = 21, whereas (3² - 2²) = 5.',
          mediatorRationale: 'Illuminates the mathematical asymmetry of quadratic functions.',
          structuralPrinciple: 'Non-linear amplification of kinetic energy differentials.',
          cognitiveLoadImpact: 3.3,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Delta-V Expansion Heuristic',
          promptText:
            'Expand (v + Δv)² / 2 = v²/2 + v*Δv + (Δv)²/2. The cross term v*Δv directly demonstrates that initial velocity v scales the energy gain.',
          mediatorRationale: 'Direct algebraic demonstration of velocity multiplication.',
          structuralPrinciple: 'Cross-term energy amplification in vector velocity increments.',
          cognitiveLoadImpact: 4.7,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Energy Gain Comparison',
          promptText:
            'Compare: at v = 10,000 m/s with Δv = 1,000 m/s, ΔE_k = 10,000*1,000 + 500,000 = 10.5 MJ/kg. At v = 2,000 m/s, ΔE_k = 2,000*1,000 + 500,000 = 2.5 MJ/kg. Over 4x greater energy gain at periapsis!',
          mediatorRationale: 'Explicit quantitative comparison of energy gains.',
          structuralPrinciple: 'Four-fold energy multiplication verified numerically.',
          cognitiveLoadImpact: 6.0,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Oberth Effect Model',
          promptText:
            'The Oberth effect states that rocket engines generate higher mechanical energy when traveling at high speed. Because kinetic energy is proportional to v², the change in energy ΔE_k = m(v*Δv + 0.5*Δv²) is directly proportional to initial velocity v. At periapsis, velocity is maximal, so a fixed rocket burn Δv converts chemical propellant energy into spacecraft orbital energy with maximum thermodynamic efficiency.',
          mediatorRationale: 'Complete astrodynamic synthesis.',
          structuralPrinciple: 'Complete Oberth effect formulation.',
          cognitiveLoadImpact: 7.4,
          weight: 5,
        },
      ],
    },
    transferProbes: [
      {
        id: 'aero_trans_near',
        distance: 'near',
        title: 'Bi-Elliptic Transfer Delta-V Trade-Off (Near Transfer)',
        surfaceContext:
          'Transferring between two coplanar circular orbits where radius ratio r2/r1 exceeds 11.94 using an intermediate apoapsis r_b.',
        isomorphicPrinciple:
          'Exploiting extreme apoapsis velocity reduction to perform low-energy plane changes and circularization.',
        question:
          'When ratio r2/r1 > 11.94, why does a 3-burn bi-elliptic transfer require less total Δv than a 2-burn Hohmann transfer despite covering a much larger distance?',
        options: [
          'Because gravity vanishes beyond geostationary orbit.',
          'Because expanding to a distant intermediate apoapsis r_b drops orbital velocity near zero, allowing the major plane/orbit change burn to be performed with negligible Δv cost.',
          'Because bi-elliptic transfers utilize solar wind sails automatically.',
          'Because 3 burns always take less fuel than 2 burns in rocketry.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Orbital speed decreases with distance (v ~ 1/sqrt(r)). By boosting to an extreme intermediate apoapsis r_b >> r2, the spacecraft slows down to a crawl. Performing the second burn at this sluggish velocity requires very little Δv to raise periapsis to r2, offsetting the extra boost cost.',
      },
      {
        id: 'aero_trans_med',
        distance: 'medium',
        title: 'Interplanetary Gravity Assist Slingshot (Medium Transfer)',
        surfaceContext:
          'Voyager 2 flyby of Jupiter gaining heliocentric velocity without burning propellant.',
        isomorphicPrinciple:
          'Conservation of momentum in moving reference frames: elastic hyperbolic scattering transferring planet orbital momentum.',
        question:
          'In a planetary gravity assist flyby, how can a spacecraft gain velocity in the Sun-centered (heliocentric) frame when its speed relative to the planet is identical before and after the flyby?',
        options: [
          'The planet magnetic field acts like an electric motor driving the probe forward.',
          'In the planet-centric frame the encounter is an elastic hyperbolic deflection with v_in = v_out; but vector addition of the planet orbital velocity V_planet rotates and adds substantial speed in the heliocentric frame.',
          'The spacecraft burns fuel stealthily during closest approach.',
          'Jupiter loses mass by ejecting atmosphere into the spacecraft thrusters.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Relative to Jupiter, the spacecraft enters with speed v_inf and exits with speed v_inf (energy conservation in planet frame). However, the direction of the velocity vector is bent by angle delta. When transforming back to the heliocentric frame by adding Jupiter orbital velocity vector V_J, the vector sum |v_inf_out + V_J| can be substantially greater than |v_inf_in + V_J|.',
      },
      {
        id: 'aero_trans_far',
        distance: 'far',
        title:
          'Elastic Billiard Collision & Momentum Transfer (Far Transfer - Classical Mechanics)',
        surfaceContext:
          'A light cue ball (mass m) colliding elastically with a heavy moving 8-ball (mass M >> m).',
        isomorphicPrinciple:
          'Frame of reference transformation where relative velocity reverses sign while target velocity doubles transfer.',
        question:
          'If a stationary ping-pong ball (mass m) is struck head-on by a heavy bowling ball (mass M >> m) moving at speed V, what is the resulting speed of the ping-pong ball, and how does this match gravity assist physics?',
        options: [
          'V (the ping-pong ball moves at the same speed as the bowling ball).',
          '2V (in the bowling ball frame the ping-pong ball approaches at V and rebounds at V; transforming back to ground frame yields V + V = 2V).',
          '0.5V (energy is lost in sound).',
          '4V (kinetic energy is quadrupled).',
        ],
        correctOptionIndex: 1,
        explanation:
          'In the bowling ball rest frame, the ping-pong ball approaches at speed V. Because M >> m, the collision is an elastic reflection, sending the ping-pong ball backwards at speed V relative to the bowling ball. Transforming back to the laboratory frame by adding the bowling ball velocity V yields V + V = 2V. This is the exact 1D analog of a maximum gravity assist!',
      },
    ],
  },
  {
    id: 'law_strict_scrutiny',
    domain: 'Constitutional Law & Jurisprudence',
    title: 'Judicial Scrutiny Standards & Fundamental Rights',
    subtitle: 'From Rational Basis review to Strict Scrutiny and Proportionality Balancing',
    theoreticalCore:
      'Equal Protection Clause tiers of scrutiny (United States v. Carolene Products Footnote 4) and Narrow Tailoring.',
    preTestProblem: {
      id: 'law_pre_01',
      title: 'Three Tiers of Judicial Review',
      context:
        'A state legislature passes a statute restricting an activity. A plaintiff challenges the statute under the 14th Amendment Equal Protection Clause.',
      question:
        'What are the core requirements of the Strict Scrutiny standard of review, and when does the court apply it?',
      options: [
        'The law must be rationally related to a legitimate government interest; applied to economic regulations.',
        'The law must be substantially related to an important government interest; applied to gender classifications.',
        'The law must be narrowly tailored to advance a compelling government interest using the least restrictive means; applied to suspect classifications (e.g. race) or fundamental rights.',
        'The law must be approved by a supermajority of voters in a statewide referendum.',
      ],
      correctOptionIndex: 2,
      explanation:
        'Strict Scrutiny is the highest level of judicial review. It requires the government to prove that the challenged statute is narrowly tailored to serve a compelling state interest and uses the least restrictive means available. It is triggered by suspect classifications (race, national origin) or burdens on fundamental constitutional rights.',
      deepStructureConcept: 'Burden of Proof Inversion & Narrow Tailoring Mandate',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Burden of Proof Metacognition',
          promptText:
            'Who carries the burden of proof under strict scrutiny: the citizen challenging the law, or the government defending it?',
          mediatorRationale: 'Focuses on the crucial presumption of invalidity.',
          structuralPrinciple: 'Presumption of unconstitutionality in strict scrutiny.',
          cognitiveLoadImpact: 1.9,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Means-End Fit Rigor',
          promptText:
            'Tiers of scrutiny represent a graduated scale of means-end fit: Rational Basis = rational/legitimate, Intermediate = substantial/important, Strict = narrow/compelling.',
          mediatorRationale: 'Organizes constitutional review into a 3-tier matrix.',
          structuralPrinciple: 'Monotonic escalation of means-ends evidentiary burden.',
          cognitiveLoadImpact: 3.2,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Least Restrictive Means Heuristic',
          promptText:
            'If the government could achieve its goal through an alternative policy that infringes less on civil rights, the law fails narrow tailoring.',
          mediatorRationale: 'Defines the operational test for narrow tailoring.',
          structuralPrinciple: 'Least restrictive alternative requirement.',
          cognitiveLoadImpact: 4.6,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Classification Example',
          promptText:
            'Economic tax brackets use rational basis (presumed valid). Gender uses intermediate scrutiny. Racial classifications and free speech restrictions trigger strict scrutiny.',
          mediatorRationale: 'Categorizes concrete statutory triggers.',
          structuralPrinciple: 'Doctrinal trigger taxonomy.',
          cognitiveLoadImpact: 5.9,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Strict Scrutiny Doctrine',
          promptText:
            'Under Carolene Products Footnote 4, legislation targeting discrete and insular minorities or fundamental rights triggers strict scrutiny. Unlike rational basis review where statutes enjoy a strong presumption of constitutionality, strict scrutiny inverts the burden: the government must demonstrate that the law serves a compelling interest, is narrowly tailored, and uses the least restrictive means.',
          mediatorRationale: 'Comprehensive constitutional jurisprudence synthesis.',
          structuralPrinciple: 'Complete strict scrutiny legal doctrine.',
          cognitiveLoadImpact: 7.3,
          weight: 5,
        },
      ],
    },
    mediatedProblem: {
      id: 'law_med_01',
      title: 'Narrow Tailoring: Overinclusiveness vs Underinclusiveness',
      context:
        'A city bans all commercial and non-commercial billboards to reduce driver distraction and enhance traffic safety.',
      question:
        'Why does a statute fail narrow tailoring if it is either substantially overinclusive or substantially underinclusive?',
      options: [
        'Overinclusive laws burden more protected speech than necessary to achieve the goal, while underinclusive laws exempt similar conduct, proving the asserted interest is not truly compelling.',
        'Judges prefer statutes that are at least 1,000 pages long to prevent loopholes.',
        'Overinclusiveness violates the Commerce Clause, while underinclusiveness violates the 2nd Amendment.',
        'Statutes that mention billboards are automatically void under maritime law.',
      ],
      correctOptionIndex: 0,
      explanation:
        'A statute is overinclusive if it sweeps in protected activities that do not cause the targeted harm (failing least restrictive means). It is underinclusive if it fails to regulate identical conduct that poses the exact same risk, revealing that the stated interest is either a pretext or not genuinely compelling.',
      deepStructureConcept: 'Geometric Congruence of Statutory Means to State Ends',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Venn Diagram Mental Model',
          promptText:
            'Picture two overlapping circles: Circle A is "Activities targeted by the law" and Circle B is "Activities causing the actual harm". What do the non-overlapping regions represent?',
          mediatorRationale: 'Uses visual set theory to ground statutory fit.',
          structuralPrinciple: 'Set intersection of statutory reach vs legitimate objective.',
          cognitiveLoadImpact: 2.1,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Evidentiary Skepticism',
          promptText:
            'If a city bans signs for safety but allows neon electronic advertising on taxis, does the city truly view signs as a safety hazard?',
          mediatorRationale: 'Highlights underinclusiveness as evidence of hypocrisy/pretext.',
          structuralPrinciple: 'Underinclusiveness undermines asserted governmental urgency.',
          cognitiveLoadImpact: 3.3,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Fit Heuristic',
          promptText:
            'Overinclusiveness = catching innocent fish in a wide net. Underinclusiveness = claiming you want to stop all fishing, but letting industrial trawlers pass freely.',
          mediatorRationale: 'Memorable dual metaphor for statutory defects.',
          structuralPrinciple: 'Dual failure modes of narrow tailoring.',
          cognitiveLoadImpact: 4.7,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Legal Precedent',
          promptText:
            'In City of Ladue v. Gilleo, banning residential yard signs was overinclusive because it eliminated an entire revered medium of personal political speech without adequate alternatives.',
          mediatorRationale: 'Anchors the concept in landmark precedent.',
          structuralPrinciple: 'Precedent verification.',
          cognitiveLoadImpact: 6.0,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Narrow Tailoring Formulation',
          promptText:
            'Narrow tailoring requires precision of fit between ends and means. Overinclusiveness infringes more protected liberties than the compelling interest requires, violating least restrictive means. Underinclusiveness leaves major sources of the same harm untouched, showing the asserted interest is either not compelling or discriminatory.',
          mediatorRationale: 'Complete doctrinal synthesis.',
          structuralPrinciple: 'Narrow tailoring mathematical set congruence.',
          cognitiveLoadImpact: 7.4,
          weight: 5,
        },
      ],
    },
    postTestProblem: {
      id: 'law_post_01',
      title: 'Commercial Speech & Central Hudson 4-Part Test',
      context:
        'A state regulatory agency prohibits utility companies from including promotional advertisements in monthly customer billing envelopes.',
      question:
        'Under the Central Hudson intermediate scrutiny framework for commercial speech, which prong is evaluated if the speech is lawful and not misleading?',
      options: [
        'The court asks whether the speech mentions any religious doctrines.',
        'The court evaluates whether the asserted government interest is substantial, whether the regulation directly advances that interest, and whether it is not more extensive than necessary.',
        'The court requires unanimous approval by the state Supreme Court.',
        'The court defers entirely to the legislative committee report under absolute immunity.',
      ],
      correctOptionIndex: 1,
      explanation:
        'Central Hudson Gas & Electric Corp. v. Public Service Commission (1980) established the 4-prong intermediate scrutiny test: 1) Speech must concern lawful activity and not be misleading; 2) The asserted government interest must be substantial; 3) The regulation must directly advance the governmental interest; 4) The regulation must not be more extensive than necessary (reasonable fit).',
      deepStructureConcept:
        'Intermediate Scrutiny Reasonable Fit vs Strict Scrutiny Least Restrictive Means',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Commercial vs Political Speech Hierarchy',
          promptText:
            'Is commercial speech afforded the exact same absolute protection as core political speech, or intermediate protection?',
          mediatorRationale: 'Reminds learner of constitutional speech hierarchy.',
          structuralPrinciple: 'Commercial speech receives intermediate protection.',
          cognitiveLoadImpact: 2.0,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: The 4-Part Ladder',
          promptText:
            'Central Hudson is a sequential ladder: Lawful/truthful -> Substantial interest -> Directly advances -> Reasonable fit.',
          mediatorRationale: 'Lays out sequential decision tree.',
          structuralPrinciple: 'Sequential multi-factor constitutional test.',
          cognitiveLoadImpact: 3.3,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Fit Distinction Heuristic',
          promptText:
            'Notice the difference from strict scrutiny: Central Hudson requires a "reasonable fit" (not necessarily the single least restrictive means possible, but proportionate).',
          mediatorRationale:
            'Contrasts intermediate fit with strict scrutiny least restrictive means.',
          structuralPrinciple:
            'Reasonable proportional fit versus absolute least restrictive means.',
          cognitiveLoadImpact: 4.7,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Holding in Central Hudson',
          promptText:
            'In Central Hudson, energy conservation was a substantial interest, but banning all promotional advertising in billing envelopes was more extensive than necessary because less restrictive disclaimers were viable.',
          mediatorRationale: 'Illustrates how prong 4 struck down the regulation.',
          structuralPrinciple: 'Prong 4 failure analysis.',
          cognitiveLoadImpact: 6.1,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Central Hudson Intermediate Framework',
          promptText:
            'Under Central Hudson, truthful commercial speech is protected under intermediate scrutiny. Once the threshold requirements of lawful and non-misleading speech are satisfied, the government must prove: 1) a substantial state interest, 2) that the restriction directly and materially advances that interest, and 3) that the regulation is narrowly tailored to achieve a reasonable fit without being more extensive than necessary.',
          mediatorRationale: 'Complete commercial speech jurisprudence.',
          structuralPrinciple: 'Complete Central Hudson intermediate doctrine.',
          cognitiveLoadImpact: 7.5,
          weight: 5,
        },
      ],
    },
    transferProbes: [
      {
        id: 'law_trans_near',
        distance: 'near',
        title: 'Time, Place, and Manner Speech Regulations (Near Transfer)',
        surfaceContext:
          'A municipal ordinance forbids amplified sound trucks in residential neighborhoods between 9 PM and 8 AM.',
        isomorphicPrinciple:
          'Content-neutral intermediate scrutiny requiring significant interest, narrow tailoring, and ample alternative channels.',
        question:
          'For a time, place, and manner regulation of speech to survive intermediate scrutiny, what critical condition must be satisfied regarding alternative channels of communication?',
        options: [
          'Alternative channels are irrelevant if the government owns the public streets.',
          'The regulation must leave open ample alternative channels for communication of the information.',
          'The speaker must be provided free broadcast airtime on public television.',
          'The ordinance must be reviewed by the United Nations Human Rights Council.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Ward v. Rock Against Racism establishes that content-neutral time, place, and manner restrictions are valid provided they are narrowly tailored to serve a significant governmental interest and leave open ample alternative channels of communication.',
      },
      {
        id: 'law_trans_med',
        distance: 'medium',
        title: 'European Proportionality Principle (Medium Transfer - Comparative Law)',
        surfaceContext:
          'The European Court of Human Rights (ECtHR) and German Federal Constitutional Court evaluating state interference with basic rights.',
        isomorphicPrinciple:
          'Four-stage proportionality analysis: Legitimate aim -> Suitability (Geeignetheit) -> Necessity (Erforderlichkeit) -> Proportionality stricto sensu (Angemessenheit).',
        question:
          'How does the German/European constitutional principle of "Necessity" (Erforderlichkeit) map isomorphically to US constitutional doctrine?',
        options: [
          'It maps to the presidential veto power.',
          'It is the exact functional equivalent of the "least restrictive means" requirement, asking whether an equally effective measure could achieve the same aim with less rights infringement.',
          'It requires judges to pass a mandatory written exam every two years.',
          'It applies only to military conscription laws.',
        ],
        correctOptionIndex: 1,
        explanation:
          'In European proportionality analysis, Necessity (Erforderlichkeit) asks whether there is any milder, less rights-intrusive measure that is equally capable of achieving the state legitimate aim. This is the precise structural isomorphic equivalent of the US least-restrictive-means requirement.',
      },
      {
        id: 'law_trans_far',
        distance: 'far',
        title: 'Engineering Safety Factors & Redundant Constraint Design (Far Transfer)',
        surfaceContext:
          'Civil and aerospace structural engineering designing fail-safe bridges and pressure vessels with minimum weight penalties.',
        isomorphicPrinciple:
          'Optimizing structural constraints to withstand critical load limits without redundant material deadweight.',
        question:
          'How does an engineering structural safety factor design correspond isomorphically to the narrow tailoring requirement in legal systems?',
        options: [
          'Engineers always make bridges 100 times heavier than necessary regardless of cost.',
          'Just as narrow tailoring avoids overinclusiveness, structural optimization ensures safety margins withstand peak stress without adding excessive extraneous material that collapses the structure under its own deadweight.',
          'Law and engineering share no structural principles because laws are subjective.',
          'Safety factors are determined solely by corporate marketing departments.',
        ],
        correctOptionIndex: 1,
        explanation:
          'In engineering design, adding excessive material to guarantee safety causes "overinclusiveness" (excessive deadweight that ironically degrades performance or induces structural failure). Optimal engineering achieves safety through precise geometric placement of braces, matching the narrow tailoring ideal of achieving the objective with minimal collateral restriction.',
      },
    ],
  },
  {
    id: 'econ_general_equilibrium',
    domain: 'Microeconomics & Mechanism Design',
    title: 'General Equilibrium & Welfare Theorems',
    subtitle: 'From Edgeworth Box contract curves to Pigouvian Externalities and Social Welfare',
    theoreticalCore:
      'First Fundamental Theorem of Welfare Economics (Walrasian equilibrium is Pareto optimal) and MRS tangency.',
    preTestProblem: {
      id: 'econ_pre_01',
      title: 'Pareto Efficiency in the Edgeworth Box',
      context:
        'Two consumers, Alice and Bob, have endowments of goods X and Y in an exchange economy. At the current allocation, Alice Marginal Rate of Substitution is MRS_A = 4 (she gives up 4 Y for 1 X), while Bob is MRS_B = 1 (he gives up 1 Y for 1 X).',
      question:
        'Why is this initial allocation NOT Pareto efficient, and how can both individuals be made strictly better off through trade?',
      options: [
        'It is Pareto efficient because both individuals have positive quantities of both goods.',
        'Because MRS_A !== MRS_B, Alice values X much more than Bob does; Bob can trade 1 unit of X to Alice in exchange for between 1 and 4 units of Y, increasing both utility levels without harming anyone.',
        'Trade is impossible because prices must be set by a central government commissar.',
        'Pareto efficiency requires both consumers to own exactly equal quantities of every good.',
      ],
      correctOptionIndex: 1,
      explanation:
        'Pareto efficiency in exchange requires equality of marginal rates of substitution: MRS_A = MRS_B. When MRS_A = 4 and MRS_B = 1, Alice is willing to pay up to 4 units of Y for 1 X, while Bob requires only 1 unit of Y to surrender 1 X. Any exchange price P_x/P_y between 1 and 4 generates a mutually beneficial gains-from-trade surplus.',
      deepStructureConcept:
        'Marginal Rate of Substitution Disparity as Mutually Beneficial Arbitrage',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Subjective Valuation Comparison',
          promptText:
            'Who values good X more at the margin: Alice (who trades 4 Y for 1 X) or Bob (who trades only 1 Y for 1 X)?',
          mediatorRationale: 'Prompts intuitive realization of comparative valuation.',
          structuralPrinciple: 'Higher MRS indicates higher subjective relative valuation.',
          cognitiveLoadImpact: 1.8,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Indifference Curve Tangency',
          promptText:
            'In an Edgeworth box, Pareto efficient allocations lie along the Contract Curve where Alice and Bob indifference curves are tangent (slopes are equal).',
          mediatorRationale: 'Connects economic valuation to geometric curve tangency.',
          structuralPrinciple: 'Tangency condition MRS_A = MRS_B = P_x/P_y.',
          cognitiveLoadImpact: 3.1,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Mutually Beneficial Price Corridor',
          promptText:
            'Identify the mutually agreeable price range: Any price P where 1 < P < 4 allows Bob to sell X for more than his cost, and Alice to buy X for less than her maximum bid.',
          mediatorRationale: 'Constructs the gains-from-trade pricing corridor.',
          structuralPrinciple: 'Surplus creation inside the lens between indifference curves.',
          cognitiveLoadImpact: 4.5,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Trade Example',
          promptText:
            'Suppose Bob gives Alice 1 X in exchange for 2 Y. Bob needed only 1 Y, so he gains +1 Y of surplus. Alice was willing to pay 4 Y, so she saves 2 Y of surplus. Both win!',
          mediatorRationale: 'Concrete numerical confirmation of Pareto improvement.',
          structuralPrinciple: 'Explicit positive-sum exchange arithmetic.',
          cognitiveLoadImpact: 5.8,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Contract Curve Model',
          promptText:
            'Pareto efficiency requires that no reallocation can make one person better off without making another worse off. When MRS_A differs from MRS_B, the indifference curves cross rather than kiss, opening a lens of mutually beneficial trades. Only when MRS_A = MRS_B are the curves tangent, exhausting all gains from trade and reaching the contract curve.',
          mediatorRationale: 'Complete microeconomic general equilibrium derivation.',
          structuralPrinciple: 'Complete Edgeworth box contract curve theorem.',
          cognitiveLoadImpact: 7.2,
          weight: 5,
        },
      ],
    },
    mediatedProblem: {
      id: 'econ_med_01',
      title: 'First Fundamental Theorem of Welfare Economics',
      context:
        'A competitive market economy with complete markets, perfect information, and zero transaction costs.',
      question:
        'What does the First Fundamental Theorem of Welfare Economics state, and what is its primary behavioral assumption regarding market participants?',
      options: [
        'Every competitive market equilibrium with price-taking behavior and complete markets is Pareto efficient.',
        'Governments must set price floors on all agricultural goods to prevent poverty.',
        'Market equilibria always produce equal income distribution across all citizens.',
        'Monopolies naturally maximize consumer surplus without regulation.',
      ],
      correctOptionIndex: 0,
      explanation:
        'The First Welfare Theorem proves that if every consumer and firm acts as a price taker in complete markets without externalities, the resulting Walrasian general equilibrium is Pareto optimal. Because all consumers face identical market price ratios (P_x/P_y), each equates their MRS to this common price ratio, automatically guaranteeing MRS_A = MRS_B.',
      deepStructureConcept: 'Decentralized Price Vector as Universal MRS Coordinator',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Price Signals as Information Conveyors',
          promptText:
            'Do consumers need to know each other personal utility functions to reach optimal trade, or does the public price price-ratio provide all necessary information?',
          mediatorRationale: 'Highlights Hayekian price information efficiency.',
          structuralPrinciple:
            'Price ratios serve as sufficient statistics for marginal valuation.',
          cognitiveLoadImpact: 2.0,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: Common Budget Line Tangency',
          promptText:
            'Both consumers optimize against the same market price line slope (-Px/Py). Therefore, MRS_A = Px/Py and MRS_B = Px/Py, which implies MRS_A = MRS_B automatically!',
          mediatorRationale: 'Shows how common price ratios force equality between consumers.',
          structuralPrinciple: 'Transitivity of equality through a shared price ratio vector.',
          cognitiveLoadImpact: 3.2,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Absence of Externalities Assumption',
          promptText:
            'Remember the boundary conditions: The theorem holds only when there are no unpriced side-effects (externalities) and no market power (monopoly price-setting).',
          mediatorRationale: 'Isolates the crucial assumptions of the theorem.',
          structuralPrinciple: 'Zero-externality and price-taking requirements.',
          cognitiveLoadImpact: 4.6,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Competitive Equilibrium Step',
          promptText:
            'If Px = $10 and Py = $5, every utility-maximizing consumer independently adjusts their consumption until their MRS = 10/5 = 2. Without speaking to each other, all MRS values align perfectly at 2.',
          mediatorRationale: 'Numerical verification of decentralized equilibrium alignment.',
          structuralPrinciple: 'Decentralized convergence to contract curve.',
          cognitiveLoadImpact: 5.9,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete First Welfare Theorem Formulation',
          promptText:
            'The First Fundamental Theorem of Welfare Economics demonstrates that a competitive equilibrium achieves a Pareto optimal allocation. In a competitive market, all agents take prices as given. Utility maximization leads each consumer i to set MRS_i = Px/Py. Because prices are identical for all agents, MRS_1 = MRS_2 = ... = MRS_n, which is the exact mathematical condition for Pareto efficiency in exchange.',
          mediatorRationale: 'Full analytical proof structure.',
          structuralPrinciple: 'Complete first welfare theorem proof.',
          cognitiveLoadImpact: 7.3,
          weight: 5,
        },
      ],
    },
    postTestProblem: {
      id: 'econ_post_01',
      title: 'Pigouvian Taxes & Negative Externalities',
      context:
        'A chemical factory emits toxic effluents into a river, imposing an uncompensated marginal external cost MEC = $30 per ton on downstream fisheries. Market price is P = $100 and private marginal cost is PMC = 20 + 2Q.',
      question:
        'Why does a competitive market overproduce the polluting good relative to the social optimum, and how does a Pigouvian tax restore Pareto efficiency?',
      options: [
        'A competitive market underproduces pollution; the government should subsidize factory expansion.',
        'Because the factory ignores external damages, Private Marginal Cost (PMC) is lower than Social Marginal Cost (SMC = PMC + MEC); setting a per-unit Pigouvian tax t = MEC forces the firm to internalize the full social cost, aligning private output with social efficiency.',
        'Taxes always decrease efficiency because they cause deadweight loss.',
        'The factory should be nationalized and shut down completely regardless of chemical demand.',
      ],
      correctOptionIndex: 1,
      explanation:
        'When negative externalities exist, competitive firms set P = PMC, ignoring MEC. This results in Social Marginal Cost exceeding Marginal Benefit, creating deadweight loss. Setting a Pigouvian tax equal to marginal external damage (t = MEC) shifts the private supply curve upward to match SMC, restoring the First Welfare Theorem efficiency conditions.',
      deepStructureConcept:
        'Internalization of Marginal External Cost to Align Private and Social Marginals',
      prompts: [
        {
          tier: 'tier_1_metacognitive_orientation',
          tierLevel: 1,
          title: 'Social vs Private Cost Metacognition',
          promptText:
            'Who pays for the dead fish downstream when the factory does not pay for wastewater disposal?',
          mediatorRationale: 'Prompts recognition of unpriced third-party costs.',
          structuralPrinciple: 'Externalities represent missing markets for social harm.',
          cognitiveLoadImpact: 1.9,
          weight: 1,
        },
        {
          tier: 'tier_2_structural_invariant',
          tierLevel: 2,
          title: 'Structural Invariant: The Wedge Between PMC and SMC',
          promptText:
            'Social Marginal Cost equals Private Marginal Cost plus Marginal External Damage: SMC = PMC + MEC. When MEC > 0, PMC lies strictly below SMC.',
          mediatorRationale: 'Formulates the mathematical cost divergence.',
          structuralPrinciple: 'SMC = PMC + MEC wedge invariant.',
          cognitiveLoadImpact: 3.2,
          weight: 2,
        },
        {
          tier: 'tier_3_strategic_heuristic',
          tierLevel: 3,
          title: 'Strategic Price Correction Heuristic',
          promptText:
            'The factory responds to price signals. If you levy tax t = MEC per ton, the factory new private marginal cost becomes PMC + t = PMC + MEC = SMC.',
          mediatorRationale: 'Shows how price-based regulation repairs missing market incentives.',
          structuralPrinciple: 'Pigouvian tax closes the wedge between private and social cost.',
          cognitiveLoadImpact: 4.6,
          weight: 3,
        },
        {
          tier: 'tier_4_concrete_subgoal',
          tierLevel: 4,
          title: 'Concrete Output Calculation',
          promptText:
            'Without tax: P = PMC -> 100 = 20 + 2Q -> Q_market = 40. Social optimum: P = SMC -> 100 = (20 + 2Q) + 30 -> 2Q = 50 -> Q_social = 25. The market overproduces by 15 units!',
          mediatorRationale: 'Explicit numerical calculation of overproduction.',
          structuralPrinciple: 'Quantification of negative externality overproduction.',
          cognitiveLoadImpact: 6.0,
          weight: 4,
        },
        {
          tier: 'tier_5_worked_demonstration',
          tierLevel: 5,
          title: 'Complete Pigouvian Welfare Model',
          promptText:
            'Negative externalities violate the complete markets assumption of the First Welfare Theorem. Because producers do not pay for environmental damage, private marginal cost is artificially depressed, causing competitive output to exceed the Pareto optimal level. Arthur Pigou demonstrated that imposing a corrective tax exactly equal to marginal external damage (t = MEC) restores price signals, eliminating the deadweight loss triangle and maximizing total social surplus.',
          mediatorRationale: 'Full environmental microeconomic synthesis.',
          structuralPrinciple: 'Complete Pigouvian tax optimality proof.',
          cognitiveLoadImpact: 7.4,
          weight: 5,
        },
      ],
    },
    transferProbes: [
      {
        id: 'econ_trans_near',
        distance: 'near',
        title: 'Cap-and-Trade Tradable Permits (Near Transfer)',
        surfaceContext:
          'The European Union Emissions Trading System (EU ETS) auctioning sulfur and carbon dioxide allowances.',
        isomorphicPrinciple:
          'Dual quantity-based mechanism where tradable allowances create an endogenous permit price equal to the Pigouvian tax.',
        question:
          'Why is a perfectly competitive tradable permit market with total cap Q_social theoretically equivalent to an optimal Pigouvian tax t = MEC under perfect certainty?',
        options: [
          'Because permits are made of recycled paper.',
          'Under certainty, price and quantity controls are duals: fixing the quantity cap at Q_social forces the equilibrium market price of permits to clear at exactly P_permit = MEC, achieving identical cost-effective abatement.',
          'Permits eliminate the need for accounting audits.',
          'Tradable permits require all factories to use solar power.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Martin Weitzman (1974) proved that under certainty, price and quantity mechanisms are duals. Setting a quantity cap at Q_social causes the market price of permits to settle at the marginal abatement cost of the last unit of reduction, which equals marginal external damage MEC.',
      },
      {
        id: 'econ_trans_med',
        distance: 'medium',
        title: 'Public Goods & Lindahl Equilibrium (Medium Transfer)',
        surfaceContext:
          'Financing non-rival, non-excludable national defense or clean air research across citizens with diverse valuations.',
        isomorphicPrinciple:
          'Vertical summation of marginal willingness-to-pay (Samuelson condition sum(MRS) = MRT) replacing horizontal summation.',
        question:
          'In provision of pure public goods, why must individual marginal rates of substitution be summed VERTICALLY (sum(MRS) = MRT) rather than horizontally as in private goods?',
        options: [
          'Because public goods are taller than private goods.',
          'Because public goods are non-rival, meaning every citizen simultaneously consumes the exact same physical unit; therefore total social value is the sum of everyone marginal valuations for that single unit.',
          'Vertical summation is a computational shortcut to save ink on economic graphs.',
          'Because governments can only tax vertical income brackets.',
        ],
        correctOptionIndex: 1,
        explanation:
          'For private goods, consumers divide up the total quantity (Q = q1 + q2), so demand curves sum horizontally. For public goods, everyone consumes the identical aggregate quantity G (q1 = q2 = G). Thus, social marginal benefit is the vertical sum of everyone individual willingness to pay: sum(MRS_i) = MRT (the Samuelson condition).',
      },
      {
        id: 'econ_trans_far',
        distance: 'far',
        title:
          'Network Bandwidth Congestion & TCP Vegas Packet Dropping (Far Transfer - Computer Networks)',
        surfaceContext:
          'Internet routers dropping packets under queue saturation to signal congestion to TCP sender windows.',
        isomorphicPrinciple:
          'Packet delay imposed on subsequent network traffic acts as an unpriced negative congestion externality.',
        question:
          'How does packet queuing delay in internet routers correspond isomorphically to a negative economic externality, and how does TCP Explicit Congestion Notification (ECN) mirror Pigouvian regulation?',
        options: [
          'Internet packets are financial securities regulated by the SEC.',
          'When a host transmits high-frequency packets, it increases queue delay for all subsequent streams (negative externality); ECN marking or AQM latency drop signals inject a virtual "cost" that compels senders to throttle windows to the social throughput optimum.',
          'Routers consume more electricity when queues are empty.',
          'TCP packets are only sent when consumers agree to pay credit card fees.',
        ],
        correctOptionIndex: 1,
        explanation:
          'In network economics (Kelly 1997 rate control), an unconstrained sender maximizes private transmission rate, filling router buffers and inflicting latency/jitter on all concurrent streams (classic negative congestion externality). Explicit Congestion Notification (ECN) and Active Queue Management (AQM) act as virtual Pigouvian feedback signals, compelling decentralized endpoint algorithms to internalize queue delay and converge to Pareto optimal network utilization.',
      },
    ],
  },
]

// ============================================================================
// 3. CORE ZPD & MODIFIABILITY MATHEMATICAL FUNCTIONS
// ============================================================================

/**
 * Calculates comprehensive ZPD, Learning Potential, and Modifiability metrics.
 *
 * Grounded in:
 * - Vygotsky (1978): ZPD = Potential (PDL) - Actual (ADL)
 * - Budoff (1987) Learning Potential Score: LPS = (Post - Pre) / (Max - Pre)
 * - Feuerstein (1979) Structural Cognitive Modifiability Index: CMI
 * - Campione & Brown (1987) Prompt Efficiency: PE = 1.0 - (PromptsUsed / 5)
 *
 * @param preTestScore Score achieved independently on pre-test [0..100]
 * @param postTestScore Score achieved after mediation / post-test [0..100]
 * @param promptsConsumed Count of graduated prompts accessed [0..5]
 * @param transferScores Array of scores on transfer tasks [0..100]
 * @param promptHistory Optional array of detailed prompt timestamp events
 */
export function calculateZpdMetrics(
  preTestScore: number,
  postTestScore: number,
  promptsConsumed: number,
  transferScores: number[] = [],
  promptHistory: PromptAttemptEvent[] = [],
): ZpdMetrics {
  const adl = Math.max(0, Math.min(100, preTestScore))
  const pdl = Math.max(adl, Math.min(100, postTestScore))
  const zpdBandwidth = Math.max(0, pdl - adl)

  // Budoff Gain Score: LPS = (Post - Pre) / (Max - Pre)
  let lps = 0
  if (adl >= 100) {
    lps = 1.0
  } else if (pdl > adl) {
    lps = (pdl - adl) / (100 - adl)
  }
  lps = Math.max(0, Math.min(1.0, lps))

  // Prompts consumed count clamped to [0, 5]
  const pCount = Math.max(0, Math.min(5, promptsConsumed))

  // Campione & Brown prompt efficiency score: 1.0 = zero hints needed, 0.0 = all hints needed
  const promptEfficiencyScore = 1.0 - pCount / 5.0

  // Transfer Autonomy Score (TAS)
  let transferAutonomy = 0.5
  if (transferScores.length > 0) {
    const avgTransfer = transferScores.reduce((acc, v) => acc + v, 0) / transferScores.length
    transferAutonomy = Math.max(0, Math.min(1.0, avgTransfer / 100))
  }

  // Feuerstein Cognitive Modifiability Index (CMI):
  // Measures efficiency of structural change relative to prompt expenditure weighted by transfer
  const promptWeightSum = (pCount * (pCount + 1)) / 2 // sum of weights 1..pCount
  const rawCmi = ((pdl - adl) / (promptWeightSum + 1.0)) * (0.5 + 0.5 * transferAutonomy)
  // Normalized to [0, 1] assuming max delta = 100
  const cmi = Math.max(0, Math.min(1.0, rawCmi / 15.0))

  // Scaffolding decay rate lambda: fitted from prompt events or estimated from efficiency
  let scaffoldingDecayRate = 0.4
  if (promptHistory.length >= 2) {
    const firstDuration = promptHistory[0].timeSpentMs || 1000
    const lastDuration = promptHistory[promptHistory.length - 1].timeSpentMs || 1000
    // If learner spends less time on subsequent hints, positive decay
    scaffoldingDecayRate = Math.log(Math.max(1.1, firstDuration) / Math.max(1.0, lastDuration))
    scaffoldingDecayRate = Math.max(-1.0, Math.min(2.0, scaffoldingDecayRate))
  } else {
    scaffoldingDecayRate = promptEfficiencyScore * 0.8
  }

  // Learner Typology Determination (Budoff / Guthke)
  let typology: LearnerTypology = 'moderate_gainer'
  let typologyDescription = ''

  if (adl >= 75) {
    typology = 'high_achiever'
    typologyDescription =
      'High baseline mastery. Minimal scaffolding required; excels in autonomous near and far transfer.'
  } else if (lps >= 0.45) {
    typology = 'high_potential_gainer'
    typologyDescription =
      'Exceptional structural modifiability (Feuerstein LPAD). Low initial baseline, but expands dramatically with mediated guidance.'
  } else if (lps >= 0.18) {
    typology = 'moderate_gainer'
    typologyDescription =
      'Responsive to graduated prompts. Internalizes subgoals steadily with systematic scaffolding decay.'
  } else {
    typology = 'emerging_learner'
    typologyDescription =
      'Constrained modifiability on current schema. Requires foundational concept grounding before multi-step transfer.'
  }

  // Frustration Horizon (Beyond assisted capacity where overload occurs)
  const frustrationHorizon = Math.min(100, pdl + Math.max(8, (100 - pdl) * 0.4))

  return {
    actualDevelopmentalLevel: Number(adl.toFixed(1)),
    potentialDevelopmentalLevel: Number(pdl.toFixed(1)),
    zpdBandwidth: Number(zpdBandwidth.toFixed(1)),
    learningPotentialScore: Number(lps.toFixed(3)),
    cognitiveModifiabilityIndex: Number(cmi.toFixed(3)),
    promptEfficiencyScore: Number(promptEfficiencyScore.toFixed(3)),
    transferAutonomyScore: Number(transferAutonomy.toFixed(3)),
    promptsConsumedCount: pCount,
    scaffoldingDecayRate: Number(scaffoldingDecayRate.toFixed(2)),
    typology,
    typologyDescription,
    frustrationHorizon: Number(frustrationHorizon.toFixed(1)),
  }
}

/**
 * Evaluates answer choice for a given problem and returns correctness and feedback.
 */
export function evaluateProblemChoice(
  problem: AssessmentProblem | TransferProbe,
  selectedOptionIndex: number,
): { isCorrect: boolean; feedback: string; explanation: string } {
  const isCorrect = selectedOptionIndex === problem.correctOptionIndex
  return {
    isCorrect,
    feedback: isCorrect
      ? 'Correct! You have identified the core structural invariant.'
      : 'Not quite. Consider the underlying relational constraints rather than surface appearances.',
    explanation: problem.explanation,
  }
}

/**
 * Returns the graduated prompt for a given problem at tier level 1..5.
 */
export function getGraduatedPromptAtTier(
  problem: AssessmentProblem,
  tierLevel: number,
): GraduatedPrompt | undefined {
  const clamped = Math.max(1, Math.min(5, tierLevel))
  return problem.prompts.find((p) => p.tierLevel === clamped)
}

/**
 * Generates an FSRS-6 review flashcard deck calibrated with the learner's ZPD metrics.
 * Modulates initial stability S₀ using Learning Potential Score (LPS) and Transfer Autonomy (TAS).
 */
export function generateFSRSZpdDeck(
  scenario: DynamicAssessmentScenario,
  metrics: ZpdMetrics,
): FSRSZpdFlashcard[] {
  // Stability scaling: High modifiability + high transfer autonomy = longer initial retention
  const stabilityMultiplier =
    0.8 + 0.4 * metrics.learningPotentialScore + 0.3 * metrics.transferAutonomyScore

  const cards: FSRSZpdFlashcard[] = [
    {
      id: `${scenario.id}_core_concept`,
      scenarioId: scenario.id,
      concept: scenario.title,
      front: `What is the core structural invariant governing ${scenario.title} (${scenario.domain})?`,
      back: `${scenario.theoreticalCore}\n\nDeep Structure: ${scenario.preTestProblem.deepStructureConcept}`,
      principle: scenario.theoreticalCore,
      recommendedStabilityDays: Number((3.5 * stabilityMultiplier).toFixed(1)),
      difficultyScore: 5.5,
      tags: ['zpd', 'dynamic-assessment', scenario.domain, 'structural-invariant'],
    },
    {
      id: `${scenario.id}_mediated_transition`,
      scenarioId: scenario.id,
      concept: `${scenario.title} - Mediated Recurrence`,
      front: `How does ${scenario.mediatedProblem.title} resolve the core conflict in ${scenario.domain}?`,
      back: `${scenario.mediatedProblem.explanation}\n\nKey Subgoal: ${scenario.mediatedProblem.deepStructureConcept}`,
      principle: scenario.mediatedProblem.deepStructureConcept,
      recommendedStabilityDays: Number((4.2 * stabilityMultiplier).toFixed(1)),
      difficultyScore: 6.0,
      tags: ['zpd', 'dynamic-assessment', 'mediated-learning', 'feuerstein'],
    },
    {
      id: `${scenario.id}_post_synthesis`,
      scenarioId: scenario.id,
      concept: `${scenario.title} - Post-Test Synthesis`,
      front: `Explain the synthesis in: ${scenario.postTestProblem.title}`,
      back: `${scenario.postTestProblem.explanation}`,
      principle: scenario.postTestProblem.deepStructureConcept,
      recommendedStabilityDays: Number((5.0 * stabilityMultiplier).toFixed(1)),
      difficultyScore: 6.8,
      tags: ['zpd', 'post-test', 'synthesis'],
    },
    ...scenario.transferProbes.map((probe) => ({
      id: `${scenario.id}_transfer_${probe.distance}`,
      scenarioId: scenario.id,
      concept: `${probe.title} (${probe.distance.toUpperCase()} Transfer)`,
      front: `[${probe.distance.toUpperCase()} TRANSFER Probe]\n\nContext: ${probe.surfaceContext}\n\nProblem: ${probe.question}`,
      back: `Isomorphic Principle: ${probe.isomorphicPrinciple}\n\nResolution: ${probe.explanation}`,
      principle: probe.isomorphicPrinciple,
      recommendedStabilityDays: Number(
        (
          (probe.distance === 'far' ? 6.5 : probe.distance === 'medium' ? 5.2 : 4.0) *
          stabilityMultiplier
        ).toFixed(1),
      ),
      difficultyScore: probe.distance === 'far' ? 8.0 : probe.distance === 'medium' ? 6.5 : 5.0,
      tags: ['zpd', 'transfer-distance', probe.distance, 'analogical-abstraction'],
    })),
  ]

  return cards
}

/**
 * Retrieves a scenario by ID.
 */
export function getZpdScenarioById(id: string): DynamicAssessmentScenario | undefined {
  return CANONICAL_ZPD_SCENARIOS.find((s) => s.id === id)
}

/**
 * Lists all available canonical ZPD assessment scenarios.
 */
export function listZpdScenarios(): DynamicAssessmentScenario[] {
  return CANONICAL_ZPD_SCENARIOS
}

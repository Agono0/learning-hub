/**
 * @file pf-engine.ts
 * @description Productive Failure & Canonical Consolidation Cognitive Engine
 *
 * Implements the two-phase Productive Failure (PF) pedagogical architecture
 * pioneered by Manu Kapur (2008, 2012, 2016) and Tanmay Sinha & Manu Kapur (2021):
 *
 * 1. Phase 1: Unguided Exploration & Problem Solving (Generation / Exploration)
 *    - Learners explore novel, complex, ill-structured problems prior to direct instruction.
 *    - Activates prior knowledge networks, uncovers critical structural features,
 *      and stimulates generation of diverse intuitive representations (SGRs).
 *    - Guides learner to experience an epistemic impasse (awareness of boundary limitations,
 *      cognitive gaps, and the necessity of higher-order abstractions).
 *
 * 2. Phase 2: Canonical Consolidation & Comparison (Assembly / Consolidation)
 *    - Expert direct instruction consolidates formal principles by explicitly juxtaposing
 *      and contrasting student-generated intuitive models against canonical representations (CERs).
 *    - Demonstrates why intuitive heuristics break down under boundary conditions and how
 *      canonical models resolve structural invariants.
 *
 * References:
 * - Kapur, M. (2008). Productive failure. Cognition and Instruction, 26(3), 379-424.
 * - Kapur, M. (2012). Productive failure in learning the concept of variance. Instructional Science, 40(4), 651-672.
 * - Kapur, M. (2016). Examining mechanisms of productive failure. Educational Psychologist, 51(2), 289-306.
 * - Sinha, T., & Kapur, M. (2021). When problem solving followed by instruction works: An explanatory predictor approach. Journal of Educational Psychology, 113(5), 909-932.
 * - Loibl, K., Roll, I., & Rummel, N. (2017). Towards a theory of when and how problem solving prior to instruction facilitates learning. Educational Psychology Review, 29(3), 413-435.
 */

import { z } from 'zod'

/* ==========================================================================
 * ZOD SCHEMAS & TYPES
 * ========================================================================== */

export const PFPhaseEnum = z.enum([
  'exploration',
  'impasse',
  'consolidation',
  'transfer',
  'reflection',
])
export type PFPhase = z.infer<typeof PFPhaseEnum>

export const PFTransferDistanceEnum = z.enum(['near', 'medium', 'far'])
export type PFTransferDistance = z.infer<typeof PFTransferDistanceEnum>

export const ConceptualDepthEnum = z.enum(['intuitive', 'impasse', 'canonical', 'transfer'])
export type ConceptualDepth = z.infer<typeof ConceptualDepthEnum>

export const AlignmentStatusEnum = z.enum(['convergent', 'divergent', 'incomplete'])
export type AlignmentStatus = z.infer<typeof AlignmentStatusEnum>

/**
 * Schema for a student-generated intuitive representation (SGR).
 */
export const StudentGeneratedRepresentationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  mechanism: z.string().min(1),
  structuralFeaturesIdentified: z.array(z.string()),
  assumptions: z.array(z.string()),
  limitationsEncountered: z.array(z.string()),
  intuitivePlausibilityScore: z.number().min(0).max(100),
  formalValidityScore: z.number().min(0).max(100),
})
export type StudentGeneratedRepresentation = z.infer<typeof StudentGeneratedRepresentationSchema>

/**
 * Schema for learner impasse analysis and affective diagnostic.
 */
export const ImpasseAnalysisSchema = z.object({
  impasseEncountered: z.boolean(),
  failureModeIdentified: z.string().min(1),
  boundaryConditionsTested: z.array(z.string()),
  knowledgeGapArticulated: z.string().min(1),
  affectiveImpasseRating: z.number().min(1).max(5), // 1 = mild friction, 5 = total cognitive dissonance
  impasseDepthScore: z.number().min(0).max(100),
})
export type ImpasseAnalysis = z.infer<typeof ImpasseAnalysisSchema>

/**
 * Schema for mapping student intuitive concepts to canonical formal parameters.
 */
export const JuxtapositionMappingSchema = z.object({
  studentConcept: z.string().min(1),
  canonicalConcept: z.string().min(1),
  alignmentStatus: AlignmentStatusEnum,
  explanation: z.string().min(1),
  contrastiveInsight: z.string().min(1),
})
export type JuxtapositionMapping = z.infer<typeof JuxtapositionMappingSchema>

/**
 * Schema for canonical consolidation instructional assembly.
 */
export const CanonicalConsolidationSchema = z.object({
  expertPrincipleTitle: z.string().min(1),
  formalFormulaOrModel: z.string().min(1),
  formalParameters: z.array(
    z.object({
      name: z.string().min(1),
      symbol: z.string().min(1),
      meaning: z.string().min(1),
      cognitiveRole: z.string().min(1),
    }),
  ),
  juxtapositionMappings: z.array(JuxtapositionMappingSchema),
  structuralInvariants: z.array(z.string()),
  whyIntuitionFailed: z.string().min(1),
  howExpertModelSolvesIt: z.string().min(1),
})
export type CanonicalConsolidation = z.infer<typeof CanonicalConsolidationSchema>

/**
 * Schema for adaptive transfer probes (Near, Medium, Far).
 */
export const PFTransferProbeOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().min(1),
})
export type PFTransferProbeOption = z.infer<typeof PFTransferProbeOptionSchema>

export const PFTransferProbeSchema = z.object({
  probeId: z.string().min(1),
  transferDistance: PFTransferDistanceEnum,
  targetDomain: z.string().min(1),
  problemStatement: z.string().min(1),
  options: z.array(PFTransferProbeOptionSchema).min(2),
  deepStructuralInvariant: z.string().min(1),
  surfaceFeaturesDifference: z.string().min(1),
})
export type PFTransferProbe = z.infer<typeof PFTransferProbeSchema>

/**
 * Seed flashcard for FSRS-6 spaced repetition consolidation.
 */
export const PFSeedCardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  targetFactor: z.string().min(1),
  conceptualDepth: ConceptualDepthEnum,
})
export type PFSeedCard = z.infer<typeof PFSeedCardSchema>

/**
 * Full Productive Failure problem scenario definition.
 */
export const PFScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  subtitle: z.string().min(1),
  priorKnowledgeContext: z.string().min(1),
  challengePrompt: z.string().min(1),
  targetConcept: z.string().min(1),
  intuitiveStarterPrompts: z.array(z.string()),
  exemplarStudentRepresentations: z.array(StudentGeneratedRepresentationSchema),
  canonicalConsolidation: CanonicalConsolidationSchema,
  transferProbes: z.array(PFTransferProbeSchema),
  reflectionQuestions: z.array(z.string()),
  seedCards: z.array(PFSeedCardSchema),
})
export type PFScenario = z.infer<typeof PFScenarioSchema>

/**
 * Quantitative cognitive metrics computed from the Productive Failure trajectory.
 */
export const PFMasteryBandEnum = z.enum([
  'Novice Intuition',
  'Developing Explorer',
  'Consolidated Thinker',
  'Master Adaptive Transferer',
])
export type PFMasteryBand = z.infer<typeof PFMasteryBandEnum>

export const PFMetricsSchema = z.object({
  generationDiversityIndex: z.number().min(0).max(1), // GDI in [0, 1]
  impasseSensitivityScore: z.number().min(0).max(100), // ISS in [0, 100]
  consolidationIntegrationGain: z.number().min(0).max(100), // CIG in [0, 100]
  adaptiveTransferScore: z.number().min(0).max(100), // ATS in [0, 100]
  productiveFailureIndex: z.number().min(0).max(100), // PFI in [0, 100]
  failureToMasteryRatio: z.number(), // Normalized coefficient
  masteryBand: PFMasteryBandEnum,
  qualitativeFeedback: z.string().min(1),
  recommendedIntervention: z.string().min(1),
})
export type PFMetrics = z.infer<typeof PFMetricsSchema>

/* ==========================================================================
 * 5 CANONICAL MULTIDISCIPLINARY SCENARIOS
 * ========================================================================== */

const CANONICAL_PF_SCENARIOS: PFScenario[] = [
  {
    id: 'pf-variance-dispersion',
    title: 'Mathematical Consistency & Dispersion',
    domain: 'Statistics & Data Science',
    subtitle: 'Intuitive Range/MAD vs Standard Deviation (Kapur 2012 Benchmark)',
    priorKnowledgeContext:
      'Arithmetic mean (average) and basic order statistics (minimum, maximum).',
    challengePrompt:
      'Two basketball players scored the following points over 5 playoff games:\nPlayer Alpha: [18, 19, 20, 21, 22] (Mean = 20)\nPlayer Beta: [10, 15, 20, 25, 30] (Mean = 20)\nPlayer Gamma: [2, 20, 20, 20, 38] (Mean = 20)\n\nDesign a mathematical formula or numerical metric that precisely ranks the consistency/predictability of these players. Do not look up any official statistical formulas; generate your own metric from first principles.',
    targetConcept:
      'Variance (σ²) and Standard Deviation (σ) as squared Euclidean distance from the mean',
    intuitiveStarterPrompts: [
      'How would you use the highest and lowest scores to gauge consistency?',
      'What happens if you calculate the difference of each game from the average and sum them up?',
      'How should a metric treat one wild outlier compared to mild, consistent fluctuations?',
    ],
    exemplarStudentRepresentations: [
      {
        id: 'sgr-range',
        title: 'Extreme Span Metric (Range)',
        description: 'Take Max - Min to see how wide the spread is.',
        mechanism: 'Dispersion = Max(X) - Min(X)',
        structuralFeaturesIdentified: ['boundary extremes', 'simplicity'],
        assumptions: ['The extreme scores tell the whole story of dispersion.'],
        limitationsEncountered: [
          'Ignores the distribution of all interior scores; Player Beta and Player Gamma have completely different internal consistency but might look identical or misleading.',
          'Hyper-sensitive to a single anomalous fluke.',
        ],
        intuitivePlausibilityScore: 75,
        formalValidityScore: 40,
      },
      {
        id: 'sgr-signed-diff',
        title: 'Sum of Raw Deviations',
        description: 'Subtract the mean from each score and sum up the differences.',
        mechanism: 'Dispersion = Σ(x_i - μ)',
        structuralFeaturesIdentified: ['deviation from center', 'mean balance'],
        assumptions: ['Positive and negative differences accumulate to reflect total deviation.'],
        limitationsEncountered: [
          'Because the mean is the center of gravity, Σ(x_i - μ) always equals exactly ZERO! The positives and negatives cancel out completely.',
        ],
        intuitivePlausibilityScore: 85,
        formalValidityScore: 10,
      },
      {
        id: 'sgr-mad',
        title: 'Mean Absolute Deviation (MAD)',
        description: 'Take the absolute value of each difference from the mean, then average them.',
        mechanism: 'Dispersion = (1/N) * Σ|x_i - μ|',
        structuralFeaturesIdentified: [
          'absolute magnitude',
          'symmetric distance',
          'full sample inclusion',
        ],
        assumptions: ['Linear distance from the mean captures true spread without direction bias.'],
        limitationsEncountered: [
          'Fails to disproportionately penalize dangerous extreme outliers (like Player Gamma having a game with 2 points).',
          'Absolute value function has a sharp non-differentiable cusp at zero (|x| at x=0), making optimization and analytical gradient calculus intractable in higher dimensions.',
        ],
        intuitivePlausibilityScore: 95,
        formalValidityScore: 80,
      },
    ],
    canonicalConsolidation: {
      expertPrincipleTitle: 'Variance and Standard Deviation',
      formalFormulaOrModel:
        'Variance: σ² = (1/N) * Σ(x_i - μ)²  |  Standard Deviation: σ = √[(1/N) * Σ(x_i - μ)²]',
      formalParameters: [
        {
          name: 'Population Size',
          symbol: 'N',
          meaning: 'Number of observations in the dataset',
          cognitiveRole: 'Normalizes for sample length to give average spread',
        },
        {
          name: 'Observation',
          symbol: 'x_i',
          meaning: 'Individual data point value',
          cognitiveRole: 'Represents atomic performance event',
        },
        {
          name: 'Arithmetic Mean',
          symbol: 'μ',
          meaning: 'Center of mass / expected value Σx_i / N',
          cognitiveRole: 'The baseline reference anchor for balance',
        },
        {
          name: 'Squared Deviation',
          symbol: '(x_i - μ)²',
          meaning: 'Quadratic Euclidean distance from the mean',
          cognitiveRole:
            'Eliminates negative signs while quadratically penalizing larger divergences',
        },
      ],
      juxtapositionMappings: [
        {
          studentConcept: 'Sum of raw deviations Σ(x - μ)',
          canonicalConcept: 'Zero balance property of the mean',
          alignmentStatus: 'divergent',
          explanation:
            'Raw deviations sum to zero by definition of the mean as the center of mass.',
          contrastiveInsight:
            'Squaring deviations preserves magnitude while eliminating cancellation without non-differentiable absolute value corners.',
        },
        {
          studentConcept: 'Extreme Span (Max - Min)',
          canonicalConcept: 'Sample Range (Order Statistic)',
          alignmentStatus: 'incomplete',
          explanation:
            'Captures total span but blind to the density distribution of interior points.',
          contrastiveInsight:
            'Variance integrates every single data point weighted by its distance from the mean.',
        },
        {
          studentConcept: 'Mean Absolute Deviation (MAD)',
          canonicalConcept: 'L1 Norm vs L2 Norm (Euclidean Distance)',
          alignmentStatus: 'convergent',
          explanation:
            'MAD measures L1 Manhattan distance; Variance/StdDev measures L2 Euclidean distance.',
          contrastiveInsight:
            'L2 squaring is smooth, infinitely differentiable, and connects directly to Pythagorean distance, Gaussian normal distributions, and least-squares regression.',
        },
      ],
      structuralInvariants: [
        'Rotational and translation invariance in Euclidean metric spaces',
        'Quadratic penalty scaling for catastrophic variance',
        'Smooth differentiability everywhere enabling gradient descent and convex optimization',
      ],
      whyIntuitionFailed:
        'Intuition sought linear magnitude (absolute values or range), which failed to account for mathematical differentiability, analytical geometry (Pythagorean theorem in N dimensions), and disproportionate risk penalty for extreme outlier variance.',
      howExpertModelSolvesIt:
        'Squaring deviations turns distances into surface areas (L2 norm), making the function smooth and convex, eliminating sign cancellation, and linking directly to the central limit theorem and Chi-square distributions.',
    },
    transferProbes: [
      {
        probeId: 'tp-variance-near',
        transferDistance: 'near',
        targetDomain: 'Quality Control in Precision Manufacturing',
        problemStatement:
          'Factory A produces ball bearings with diameters [9.9, 10.0, 10.1, 10.0, 10.0] mm (Mean 10.0). Factory B produces bearings with [9.5, 10.0, 10.0, 10.0, 10.5] mm (Mean 10.0). A bearing outside ±0.3 mm jams the jet turbine and causes catastrophic failure. Which metric best differentiates the risk of Factory B, and why?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'Arithmetic Mean, because both factories average exactly 10.0 mm.',
            isCorrect: false,
            explanation:
              'Mean is identical and completely blinds the engineer to catastrophic variance.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Standard Deviation (L2), because squaring differences penalizes the ±0.5 mm deviations exponentially more than mild ±0.1 mm fluctuations.',
            isCorrect: true,
            explanation:
              'Quadratic scaling in variance severely flags the severe outlier risk that causes turbine seizure.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Mode, because 10.0 mm appears most frequently in both factories.',
            isCorrect: false,
            explanation:
              'Mode ignores the fatal deviations entirely, making it dangerously misleading.',
          },
        ],
        deepStructuralInvariant: 'Quadratic cost functions in risk assessment under dispersion',
        surfaceFeaturesDifference:
          'Basketball point scores vs micro-millimeter jet turbine bearing tolerances',
      },
      {
        probeId: 'tp-variance-medium',
        transferDistance: 'medium',
        targetDomain: 'Machine Learning Loss Functions',
        problemStatement:
          'In training a neural network for autonomous vehicle braking distance, why is Mean Squared Error (MSE = (1/N)Σ(y - ŷ)²) preferred over Mean Absolute Error (MAE = (1/N)Σ|y - ŷ|) when penalizing large prediction errors, despite MAE being easier to explain in raw meters?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'MSE is differentiable everywhere and imposes a quadratic loss gradient that aggressively corrects catastrophic under-braking errors.',
            isCorrect: true,
            explanation:
              'Smooth derivative 2(y - ŷ) drives larger gradient updates for large errors and avoids the zero-derivative plateau of absolute values.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'MSE produces numbers in squared meters which always match human perception better than linear meters.',
            isCorrect: false,
            explanation:
              'Squared units actually complicate direct human interpretation; MSE is chosen for mathematical and gradient optimization properties.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'MSE is completely immune to dataset outliers and never overfits.',
            isCorrect: false,
            explanation:
              'MSE is actually MORE sensitive to outliers because of squaring, not immune.',
          },
        ],
        deepStructuralInvariant:
          'Convex optimization and quadratic penalty gradient in high-dimensional error surfaces',
        surfaceFeaturesDifference:
          'Statistical player consistency vs machine learning backpropagation loss functions',
      },
      {
        probeId: 'tp-variance-far',
        transferDistance: 'far',
        targetDomain: 'Quantum Mechanics & Heisenberg Uncertainty Principle',
        problemStatement:
          'In quantum mechanics, why is the uncertainty in a particle position Δx defined as the standard deviation σ_x = √[⟨x²⟩ - ⟨x⟩²] of the position operator rather than an intuitive bounding interval [x_min, x_max]?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'Quantum wavefunctions |ψ(x)|² often extend to infinity with exponential tails; bounding intervals are undefined, whereas root-mean-square variance captures statistical probability dispersion in Hilbert space.',
            isCorrect: true,
            explanation:
              'Wave packets have infinite support; standard deviation provides the rigorous Hilbert-space inner product dispersion required for the Cauchy-Schwarz inequality in the Heisenberg relation Δx·Δp ≥ ℏ/2.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Because physicists prefer square roots over linear numbers.',
            isCorrect: false,
            explanation: 'Trivial and incorrect.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Because standard deviation proves particles have definite classical trajectories when unmeasured.',
            isCorrect: false,
            explanation:
              'Standard deviation reflects intrinsic probabilistic dispersion, not hidden classical trajectories.',
          },
        ],
        deepStructuralInvariant:
          'Inner product dispersion (L2 norm) in infinite-dimensional vector spaces',
        surfaceFeaturesDifference:
          'Discrete sports scores vs continuous probability density amplitudes in quantum mechanics',
      },
    ],
    reflectionQuestions: [
      'Why did your initial intuitive representation struggle to handle outlier points or sign cancellation?',
      'How does squaring distances in variance mirror the Pythagorean theorem in multi-dimensional space?',
      'In what real-world scenarios would you intentionally choose Mean Absolute Deviation over Standard Deviation?',
    ],
    seedCards: [
      {
        front:
          'Productive Failure: Why does summing raw differences Σ(x - μ) always fail as a measure of dispersion?',
        back: 'By definition of the arithmetic mean as the physical center of gravity, positive deviations above the mean exactly cancel negative deviations below it, resulting in a sum of zero.',
        targetFactor: 'Sum of Deviations Impasse',
        conceptualDepth: 'impasse',
      },
      {
        front:
          'Productive Failure: Why did statisticians adopt squaring (x - μ)² instead of absolute values |x - μ| for variance?',
        back: 'Squaring provides smooth, continuous differentiability everywhere (enabling calculus and gradient optimization), connects directly to Euclidean distance in N dimensions, and heavily penalizes dangerous extreme outliers.',
        targetFactor: 'Quadratic L2 Invariant',
        conceptualDepth: 'canonical',
      },
      {
        front:
          'Productive Failure: What is the deep structural invariant linking Variance in statistics to Mean Squared Error in machine learning?',
        back: 'Both utilize quadratic L2 loss penalties to reward clustering around the central tendency while imposing steep gradient penalties on large errors.',
        targetFactor: 'L2 Transfer Invariant',
        conceptualDepth: 'transfer',
      },
    ],
  },
  {
    id: 'pf-distributed-consensus',
    title: 'Distributed Consensus & Fault Tolerance',
    domain: 'Distributed Systems & Computer Science',
    subtitle: 'Timeout Retries & Master Nodes vs Quorum Epochs (Paxos/Raft)',
    priorKnowledgeContext: 'Client-server architecture, network latency, and server crashes.',
    challengePrompt:
      'You are building a distributed bank ledger replicated across 5 server nodes in different cities. The network is unreliable (messages can be delayed, dropped, or duplicated). Servers can crash and reboot at any moment without warning.\n\nDesign an algorithm that guarantees that once a transaction (e.g., Transfer $100) is confirmed to a client, all surviving servers will agree on that transaction in the exact same chronological order, even if 2 of the 5 servers crash or the network between cities splits in half. Do not look up Paxos or Raft; invent your protocol.',
    targetConcept:
      'Quorum intersection (⌊N/2⌋ + 1), term-based leader epochs, and monotonic log replication',
    intuitiveStarterPrompts: [
      'What happens if you designate one single master server to dictate all decisions?',
      'What happens if you require all 5 servers to vote yes before accepting a transaction?',
      'If the network splits into two isolated groups (3 nodes in North America, 2 in Europe), how should they decide whether to process writes?',
    ],
    exemplarStudentRepresentations: [
      {
        id: 'sgr-single-master',
        title: 'Central Master with Timeout Retries',
        description:
          'Node 1 is the Master. All transactions go to Node 1, which broadcasts to the others. If a node fails, Node 1 retries with a timeout.',
        mechanism: 'Leader-only decision broadcasting with retry loops',
        structuralFeaturesIdentified: ['central coordination', 'simplicity'],
        assumptions: ['The master node will remain online or can be permanently trusted.'],
        limitationsEncountered: [
          'Single Point of Failure: If Node 1 crashes or gets disconnected, the entire bank halts.',
          'Split-Brain: If Node 1 is merely disconnected from Europe, Europe might elect Node 2 as a new master while Node 1 is still accepting writes in America, corrupting the ledger with conflicting transactions.',
        ],
        intuitivePlausibilityScore: 80,
        formalValidityScore: 35,
      },
      {
        id: 'sgr-unanimous-vote',
        title: 'Unanimous 100% Agreement (2-Phase Commit)',
        description:
          'Every transaction must receive a YES confirmation from all 5 nodes before being committed.',
        mechanism: '5/5 unanimous quorum',
        structuralFeaturesIdentified: ['strict consistency', 'no split-brain possibility'],
        assumptions: [
          'All nodes are expected to stay alive or transactions can wait indefinitely.',
        ],
        limitationsEncountered: [
          'Zero Fault Tolerance: If even ONE node crashes or suffers network lag, the system can NEVER process another write. A 5-node cluster becomes LESS available than a single node!',
        ],
        intuitivePlausibilityScore: 70,
        formalValidityScore: 40,
      },
      {
        id: 'sgr-majority-vote',
        title: 'Simple Majority Vote (3 out of 5)',
        description: 'Require 3 out of 5 nodes to agree on a transaction before confirming.',
        mechanism: 'Majority Quorum = 3/5',
        structuralFeaturesIdentified: ['fault tolerance', 'quorum overlap', 'majority agreement'],
        assumptions: ['Any group of 3 nodes will always make compatible decisions over time.'],
        limitationsEncountered: [
          'Lacks term epochs and log sequence ordering: two competing majorities across time might commit conflicting log entries if network delays deliver old leader messages after a new leader has been elected.',
        ],
        intuitivePlausibilityScore: 90,
        formalValidityScore: 70,
      },
    ],
    canonicalConsolidation: {
      expertPrincipleTitle: 'Quorum Consensus with Leader Epochs (Raft/Paxos)',
      formalFormulaOrModel:
        'Quorum Size Q = ⌊N/2⌋ + 1  |  Quorum Intersection: (Q_A ∩ Q_B) ≥ 1  |  Monotonic Term Epochs: e_t+1 > e_t',
      formalParameters: [
        {
          name: 'Cluster Size',
          symbol: 'N',
          meaning: 'Total number of consensus nodes (typically odd: 2f + 1)',
          cognitiveRole: 'Defines system boundary and fault budget f',
        },
        {
          name: 'Fault Tolerance Budget',
          symbol: 'f',
          meaning: 'Maximum crash failures tolerated: f = ⌊(N - 1) / 2⌋',
          cognitiveRole: 'Ensures cluster survives f failures without halting',
        },
        {
          name: 'Quorum',
          symbol: 'Q',
          meaning: 'Strict majority of nodes: ⌊N/2⌋ + 1',
          cognitiveRole: 'Pigeonhole principle ensures any two quorums share at least one node',
        },
        {
          name: 'Leader Term / Epoch',
          symbol: 'e',
          meaning: 'Monotonically increasing logical clock counter',
          cognitiveRole: 'Invalidates stale messages from disconnected former leaders',
        },
      ],
      juxtapositionMappings: [
        {
          studentConcept: 'Single Master',
          canonicalConcept: 'Elected Leader with Lease / Heartbeat',
          alignmentStatus: 'incomplete',
          explanation:
            'A leader is required for sequential ordering, but it cannot be static; it must be dynamic and replaceable via term-based elections.',
          contrastiveInsight:
            'Static masters cause catastrophic downtime upon failure; dynamic leaders require quorum consensus to assume office.',
        },
        {
          studentConcept: 'Unanimous 100% Agreement',
          canonicalConcept: 'Availability vs Consistency Trade-off (CAP)',
          alignmentStatus: 'divergent',
          explanation:
            'Requiring 5/5 nodes guarantees consistency but destroys availability under any crash.',
          contrastiveInsight:
            'Majority quorum (3/5) achieves both 100% linearizable consistency AND fault tolerance for up to 2 crashes.',
        },
        {
          studentConcept: 'Simple Majority Vote',
          canonicalConcept: 'Quorum Intersection + Monotonic Log Commit',
          alignmentStatus: 'convergent',
          explanation:
            'Recognized that 3/5 is necessary, but missed the requirement for term epochs to discard delayed messages.',
          contrastiveInsight:
            'Any two majorities of 5 must overlap by at least 1 node (3 + 3 = 6 > 5). That overlapping node guarantees that the newest term knows the committed history.',
        },
      ],
      structuralInvariants: [
        'Pigeonhole Principle in Quorum Overlap: Any two majorities in N share at least one node',
        'State Machine Safety: Log entries committed in term e are present in all leaders of terms > e',
        'Lamport Logical Clocks / Monotonic Term ordering suppressing Byzantine/stale split-brain actions',
      ],
      whyIntuitionFailed:
        'Intuition either relied on a fragile single coordinator or demanded perfection (unanimity), failing to realize that odd-numbered majority sets mathematically intersect, creating a bridge of historical truth across leadership transitions.',
      howExpertModelSolvesIt:
        'Combines majority quorum voting (Pigeonhole principle) with monotonically increasing term numbers. Every new leader must assemble a quorum, which is guaranteed to contain at least one node that voted for the previous leader, passing along the true uncorrupted state machine history.',
    },
    transferProbes: [
      {
        probeId: 'tp-consensus-near',
        transferDistance: 'near',
        targetDomain: 'High-Availability Database Clustering',
        problemStatement:
          'In a 5-node Raft cluster, a network partition divides the nodes into Partition A (Node 1, Node 2) and Partition B (Node 3, Node 4, Node 5). A client sends a write request to Node 1. What happens?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'Node 1 commits the write immediately and sends it to Node 2.',
            isCorrect: false,
            explanation:
              'Node 1 and Node 2 only form a minority (2/5 < 3). Committing would cause a split-brain.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Node 1 cannot commit the write because it cannot reach a quorum (3 nodes); the write is rejected or queued, while Partition B can safely elect a leader and commit writes.',
            isCorrect: true,
            explanation:
              'Only the majority partition (Partition B with 3 nodes) can achieve quorum intersection and safely advance state.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Both partitions accept writes and will merge them later by taking the average of the account balance.',
            isCorrect: false,
            explanation:
              'A banking ledger cannot average account balances; strict linearizability is required.',
          },
        ],
        deepStructuralInvariant: 'Quorum intersection preventing dual-primary split brain',
        surfaceFeaturesDifference:
          'Abstract consensus algorithm vs specific database network partition scenario',
      },
      {
        probeId: 'tp-consensus-medium',
        transferDistance: 'medium',
        targetDomain: 'Spacecraft Triple Modular Redundancy (TMR)',
        problemStatement:
          'Deep space probes use 3 flight computers running identical software in lockstep to protect against cosmic ray bit flips. If one computer flips a bit and calculates trajectory thrust as 450N while the other two calculate 500N, how does majority voting guarantee mission survival?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'A 2-out-of-3 majority quorum isolates the single faulty computer (f = 1 in N = 3) and executes the 500N thrust command without waiting for human intervention from Earth.',
            isCorrect: true,
            explanation:
              'N=3 has quorum Q=2. When 2 nodes agree, the mathematical majority mask the 1 corrupted node instantly.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'The spacecraft halts all thrusters and waits 4 hours for NASA ground control to inspect the RAM.',
            isCorrect: false,
            explanation: 'Halting during critical orbital burns causes mission loss.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'The computers average the values: (450 + 500 + 500)/3 = 483N.',
            isCorrect: false,
            explanation: 'Averaging propagates corrupt values instead of masking them.',
          },
        ],
        deepStructuralInvariant: 'Quorum majority masking hardware fault boundaries (2f + 1)',
        surfaceFeaturesDifference:
          'Network message passing in data centers vs radiation bit-flips in avionics hardware voting',
      },
      {
        probeId: 'tp-consensus-far',
        transferDistance: 'far',
        targetDomain: 'Constitutional Law & Supreme Court Quorum Governance',
        problemStatement:
          'Why does the United States Supreme Court require a statutory quorum of 6 justices (out of 9) to hear a case, and a simple majority of participating justices to issue a binding precedent?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'The 6-justice threshold ensures super-majority participation to prevent a minority rump faction from creating irreversible nationwide jurisprudence, while majority voting ensures decisive resolution.',
            isCorrect: true,
            explanation:
              'Quorum rules in institutional governance serve the exact same formal function as distributed consensus: preventing unrepresentative minority factions from capturing state authority.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Because 6 is an even number which guarantees ties can never be broken.',
            isCorrect: false,
            explanation: 'Nonsensical.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Because judges are required to agree 100% on every single legal opinion.',
            isCorrect: false,
            explanation: 'Dissenting opinions are standard; unanimity is not required.',
          },
        ],
        deepStructuralInvariant:
          'Institutional quorum thresholds preventing minority state mutation',
        surfaceFeaturesDifference:
          'Distributed computer logs vs judicial quorum and jurisprudential precedent',
      },
    ],
    reflectionQuestions: [
      'Why does requiring 100% agreement make a distributed system less available instead of more reliable?',
      'How does the Pigeonhole principle prove that any two majority groups in a cluster must share at least one node?',
      'What is the role of the term/epoch counter in disarming a zombie master that suddenly wakes up after a network partition?',
    ],
    seedCards: [
      {
        front:
          'Productive Failure: Why does 2-Phase Commit (2PC) fail the availability test in unreliable distributed networks?',
        back: '2PC requires 100% unanimity from all participants. If a single coordinator or node crashes or experiences network delay, all resources remain locked and the system halts indefinitely.',
        targetFactor: 'Unanimity Impasse',
        conceptualDepth: 'impasse',
      },
      {
        front:
          'Productive Failure: What mathematical principle guarantees that two Raft/Paxos quorums cannot make conflicting decisions?',
        back: 'The Pigeonhole Principle: In a cluster of size N, any two majorities of size ⌊N/2⌋ + 1 must share at least one overlapping node. That overlapping node guarantees knowledge of previous commits.',
        targetFactor: 'Quorum Overlap Theorem',
        conceptualDepth: 'canonical',
      },
      {
        front:
          'Productive Failure: What deep structural invariant connects Raft consensus in cloud servers to Triple Modular Redundancy in aerospace avionics?',
        back: 'Both rely on majority quorum voting (2f + 1) to isolate and mask faulty nodes without halting system operation.',
        targetFactor: 'Fault-Masking Invariant',
        conceptualDepth: 'transfer',
      },
    ],
  },
  {
    id: 'pf-carnot-thermodynamics',
    title: 'Thermodynamics & Heat Engine Limits',
    domain: 'Physics & Mechanical Engineering',
    subtitle: 'Perpetual Loops vs Carnot Efficiency (η = 1 - T_C/T_H)',
    priorKnowledgeContext:
      'Conservation of Energy (First Law: ΔU = Q - W) and heat as thermal energy.',
    challengePrompt:
      'An inventor patents an engine that extracts heat from oceanic surface water (at 300K / 27°C) and converts 100% of that thermal energy directly into electric work to propel a ship, rejecting zero heat into the environment. The inventor claims:\n"Since energy is conserved (100 J of thermal energy in = 100 J of electrical work out), this violates no physical laws."\n\nExplain why this engine is physically impossible from first principles, and derive or describe the theoretical limit on how much useful work can ever be extracted from heat.',
    targetConcept:
      'The Second Law of Thermodynamics, Entropy generation (dS ≥ 0), and the Carnot efficiency limit (η = 1 - T_C / T_H)',
    intuitiveStarterPrompts: [
      'If heat flows naturally from hot to cold, what happens when there is no cold reservoir?',
      'To make an engine run continuously in a closed cycle, how does the working fluid return to its original pressure and volume?',
      'Why cannot you convert 100% of disordered thermal motion into ordered directional kinetic work?',
    ],
    exemplarStudentRepresentations: [
      {
        id: 'sgr-insulation-perpetual',
        title: 'Perfect Insulation & Zero Heat Loss',
        description:
          'Insulate the pistons perfectly with aerogel so that zero heat escapes into the surrounding ocean.',
        mechanism: 'Zero thermal leakage leads to 100% mechanical conversion',
        structuralFeaturesIdentified: ['thermal leakage reduction', 'insulation'],
        assumptions: [
          'Waste heat is merely an engineering defect that can be eliminated with better materials.',
        ],
        limitationsEncountered: [
          'An engine must undergo a cyclic process. Expanding a gas does work, but to compress it back to the starting point to repeat the cycle, you MUST either do equal work on it (producing zero net work) or cool it by dumping heat into a cold reservoir!',
        ],
        intuitivePlausibilityScore: 70,
        formalValidityScore: 20,
      },
      {
        id: 'sgr-recycle-exhaust',
        title: 'Closed Loop Exhaust Recycling',
        description:
          'Feed the hot exhaust gas directly back into the intake valve to reuse all remaining heat.',
        mechanism: 'Recirculation loop for thermal conservation',
        structuralFeaturesIdentified: ['energy conservation', 'cyclic recirculation'],
        assumptions: ['Recycling exhaust avoids thermal rejection to the outside world.'],
        limitationsEncountered: [
          'If the exhaust is fed directly back into the intake without cooling, the back-pressure matches the forward pressure, causing the piston to lock up and do zero net work.',
        ],
        intuitivePlausibilityScore: 80,
        formalValidityScore: 25,
      },
      {
        id: 'sgr-temperature-differential',
        title: 'Thermal Drop Proportionality',
        description:
          'Work is generated only as heat falls from a higher temperature to a lower temperature, like water falling over a dam.',
        mechanism: 'Work = Function of (T_Hot - T_Cold)',
        structuralFeaturesIdentified: [
          'temperature differential requirement',
          'hydrodynamic analogy',
        ],
        assumptions: [
          'Efficiency is strictly proportional to the raw difference in degrees Celsius.',
        ],
        limitationsEncountered: [
          'Recognizes that a cold sink is mandatory, but uses linear subtraction (T_H - T_C) without absolute temperature scaling (Kelvin), failing to determine the exact theoretical upper efficiency bound.',
        ],
        intuitivePlausibilityScore: 92,
        formalValidityScore: 75,
      },
    ],
    canonicalConsolidation: {
      expertPrincipleTitle: 'The Second Law and Carnot Cycle Efficiency',
      formalFormulaOrModel:
        'Maximum Efficiency: η_Carnot = 1 - (T_C / T_H) = (T_H - T_C) / T_H  |  Clausius Inequality: ∮ (dQ / T) ≤ 0  |  Entropy: ΔS_universe ≥ 0',
      formalParameters: [
        {
          name: 'Hot Reservoir Temperature',
          symbol: 'T_H',
          meaning: 'Absolute temperature of the heat source (in Kelvin)',
          cognitiveRole: 'Supplies thermal energy Q_H with entropy S_in = Q_H / T_H',
        },
        {
          name: 'Cold Reservoir Temperature',
          symbol: 'T_C',
          meaning: 'Absolute temperature of the heat sink (in Kelvin)',
          cognitiveRole: 'Mandatory heat sink absorbing Q_C with entropy S_out = Q_C / T_C',
        },
        {
          name: 'Carnot Efficiency',
          symbol: 'η_Carnot',
          meaning: 'Theoretical maximum fraction of heat converted to work',
          cognitiveRole:
            'Proves 100% conversion (η = 1) requires T_C = 0K (Absolute Zero, impossible by 3rd Law)',
        },
      ],
      juxtapositionMappings: [
        {
          studentConcept: 'Perfect Insulation eliminates waste heat',
          canonicalConcept: 'Kelvin-Planck Statement of the Second Law',
          alignmentStatus: 'divergent',
          explanation:
            'Waste heat is not an engineering flaw; it is a fundamental thermodynamic necessity of cyclic compression.',
          contrastiveInsight:
            'To reset the working fluid in a closed cycle without spending all generated work on recompression, heat MUST be dumped into a colder reservoir.',
        },
        {
          studentConcept: 'Recycle exhaust to intake',
          canonicalConcept: 'State Function & Pressure-Volume (P-V) Enclosure',
          alignmentStatus: 'divergent',
          explanation: 'Net work is the enclosed area in a P-V indicator diagram: ∮ P dV.',
          contrastiveInsight:
            'Without cooling the return stroke along a lower pressure curve, the enclosed work area collapses to zero.',
        },
        {
          studentConcept: 'Work depends on (T_Hot - T_Cold)',
          canonicalConcept: 'Carnot Ratio (T_H - T_C) / T_H',
          alignmentStatus: 'convergent',
          explanation:
            'Correctly identified the waterfall analogy of temperature differential, but missed the denominator.',
          contrastiveInsight:
            'Efficiency is normalized by T_H in absolute Kelvin. If T_H = 300K and T_C = 290K, efficiency is at most (300 - 290)/300 = 3.3%!',
        },
      ],
      structuralInvariants: [
        'Entropy Conservation in Reversible Cycles: Q_H / T_H = Q_C / T_C',
        'State Function Invariance: Cyclic integral of state variables ∮ dS = 0 and ∮ dU = 0',
        'Impossibility of perpetual motion machines of the second kind (Kelvin-Planck & Clausius equivalence)',
      ],
      whyIntuitionFailed:
        'Intuition relied on the First Law (Conservation of Energy) which allows any energy transformation as long as bookkeeping balances. It failed to account for Entropy (the directional arrow of statistical microstates) and the geometric requirement of cyclic reset in thermodynamic phase space.',
      howExpertModelSolvesIt:
        'Demonstrates through the reversible Carnot cycle (isothermal expansion, adiabatic expansion, isothermal compression, adiabatic compression) that entropy balance requires Q_C = Q_H * (T_C / T_H), fixing the universal ceiling η = 1 - T_C / T_H.',
    },
    transferProbes: [
      {
        probeId: 'tp-carnot-near',
        transferDistance: 'near',
        targetDomain: 'Geothermal Power Generation',
        problemStatement:
          'A geothermal plant extracts boiling brine at 150°C (423K) and rejects waste heat into cooling river water at 15°C (288K). What is the maximum theoretical efficiency possible for this power plant?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: '90%, because boiling water carries high energy density.',
            isCorrect: false,
            explanation: 'Energy density does not determine thermodynamic conversion efficiency.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Approximately 31.9%: η = 1 - (288 / 423) = 0.319.',
            isCorrect: true,
            explanation:
              'Applying the Carnot formula in Kelvin: 1 - 288/423 = 31.9%. Real plants achieve ~15-20%.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: '100%, if the turbines use frictionless magnetic levitation bearings.',
            isCorrect: false,
            explanation:
              'Friction is an irreversible loss; Carnot limit applies even with zero friction.',
          },
        ],
        deepStructuralInvariant: 'Carnot ceiling defined by absolute temperature ratio',
        surfaceFeaturesDifference:
          'Ocean thermal energy conversion vs geothermal rock brine and river cooling',
      },
      {
        probeId: 'tp-carnot-medium',
        transferDistance: 'medium',
        targetDomain: 'Supercomputing & Data Center Liquid Cooling',
        problemStatement:
          'A high-performance GPU cluster generates 1 Megawatt of heat at 70°C (343K). An engineer proposes using a miniature Stirling heat engine to convert this waste heat back into electricity to power the cooling fans in a room at 25°C (298K). Why is this economically and physically impractical?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'The Carnot limit is only 1 - (298 / 343) ≈ 13.1%; real engines achieve < 5%, which cannot offset the capital cost and weight of the Stirling engine.',
            isCorrect: true,
            explanation:
              'Low-temperature waste heat has high entropy and severely constrained Carnot efficiency.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Silicon heat cannot be converted into work because electricity and heat are incompatible.',
            isCorrect: false,
            explanation:
              'Heat from silicon is standard thermal energy; the issue is the low temperature differential.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Fans require AC current while Stirling engines produce only DC power.',
            isCorrect: false,
            explanation:
              'Generators can produce AC or DC; this is irrelevant to the thermodynamic limit.',
          },
        ],
        deepStructuralInvariant:
          'Low-grade waste heat exergy limits under modest thermal differentials',
        surfaceFeaturesDifference:
          'Ship steam propulsion vs semiconductor thermal dissipation in cloud servers',
      },
      {
        probeId: 'tp-carnot-far',
        transferDistance: 'far',
        targetDomain: 'Information Theory & Landauer Limit',
        problemStatement:
          'Rolf Landauer (1961) proved that erasing 1 bit of physical information in a computer at temperature T dissipates a minimum heat of Q = k_B * T * ln(2). How is Landauer erasure fundamentally linked to the Carnot engine limit?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'Erasing a bit reduces the informational entropy of the memory register (from 2 states to 1 state: ΔS = -k_B ln 2); to satisfy the Second Law (ΔS_total ≥ 0), this entropy must be expelled into the thermal environment as heat Q = T ΔS.',
            isCorrect: true,
            explanation:
              'Information is physical. Resetting a computational register is identical to compressing working gas in a Carnot engine: it requires expelling entropy to the thermal sink.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'It proves that computers should be made out of steam valves rather than transistors.',
            isCorrect: false,
            explanation: 'Nonsensical.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'It shows that electrical resistance in copper wires is caused by software bugs.',
            isCorrect: false,
            explanation:
              'Resistance is solid-state electron scattering; Landauer limit is fundamental entropy.',
          },
        ],
        deepStructuralInvariant:
          'Entropy expulsion requirement during state reset (Information-Thermodynamic equivalence)',
        surfaceFeaturesDifference:
          'Pistons compressing gas vs irreversible logical bit erasure in computer registers',
      },
    ],
    reflectionQuestions: [
      'Why does the First Law of Thermodynamics allow a perpetual heat engine, but the Second Law forbids it?',
      'How does the requirement to return the working gas to its initial state force heat rejection?',
      'Why is low-temperature heat (like 35°C ocean water) considered "low quality" energy compared to 1000°C steam?',
    ],
    seedCards: [
      {
        front:
          'Productive Failure: Why cannot a heat engine convert 100% of heat into work even with zero friction?',
        back: 'In a continuous cyclic engine, the working fluid must return to its original pressure and volume. Compressing it without spending all produced work requires cooling it, which demands rejecting heat (Q_C > 0) to a lower-temperature reservoir.',
        targetFactor: 'Cyclic Reset Necessity',
        conceptualDepth: 'impasse',
      },
      {
        front:
          'Productive Failure: What is the Carnot Efficiency formula and what does it reveal about absolute temperature?',
        back: 'η_Carnot = 1 - (T_C / T_H) in Kelvin. It proves that 100% efficiency is impossible unless the cold reservoir is at Absolute Zero (0 Kelvin), which is prohibited by the Third Law of Thermodynamics.',
        targetFactor: 'Carnot Efficiency Bound',
        conceptualDepth: 'canonical',
      },
      {
        front:
          'Productive Failure: What deep invariant connects Carnot engine heat rejection to Landauer bit erasure in computers?',
        back: 'Both are state-reset processes: compressing a thermodynamic fluid or erasing a bit reduces internal state entropy, which strictly mandates expelling heat into the environment to prevent total entropy reduction (ΔS_universe ≥ 0).',
        targetFactor: 'Landauer-Carnot Invariance',
        conceptualDepth: 'transfer',
      },
    ],
  },
  {
    id: 'pf-b-plus-tree-indexing',
    title: 'Database Indexing & Storage I/O',
    domain: 'Software Architecture & Storage Systems',
    subtitle: 'In-Memory BST / Flat Binary Search vs Block-Aligned B+ Trees',
    priorKnowledgeContext:
      'Binary Search Trees (O(log N)), array binary search, and disk read latency.',
    challengePrompt:
      'You are designing a storage engine for a database with 100,000,000 user profiles. The index must be stored on persistent secondary storage (NVMe/SSD). Storage devices read data in fixed hardware blocks of 4 Kilobytes (4,096 bytes). An in-memory pointer dereference takes 50 nanoseconds, but reading a 4KB block from disk takes 100 microseconds (2,000x slower!).\n\nDesign an on-disk index data structure that supports both:\n1. Blazing fast single-key lookup (Find user by ID)\n2. Fast range scans (Find all users aged between 25 and 35 in sorted order)\nDo not look up B-Trees or B+ Trees; design your data structure from hardware constraints.',
    targetConcept:
      'B+ Tree multi-way fan-out aligned to hardware block pages with linked sequential leaves',
    intuitiveStarterPrompts: [
      'What happens if you store an AVL or Red-Black Binary Search Tree on disk?',
      'How would a flat sorted array handle inserts when you have 100 million rows?',
      'If reading 4KB costs the exact same I/O time as reading 8 bytes, how can you exploit that full 4KB block?',
    ],
    exemplarStudentRepresentations: [
      {
        id: 'sgr-on-disk-bst',
        title: 'On-Disk Binary Search Tree (AVL/Red-Black)',
        description: 'Store nodes with (Key, LeftChildPointer, RightChildPointer) on disk.',
        mechanism: 'Binary branching across disk addresses',
        structuralFeaturesIdentified: ['logarithmic search', 'dynamic inserts'],
        assumptions: ['Binary branching is optimal because O(log2 N) is standard for search.'],
        limitationsEncountered: [
          'I/O Disaster: For 100M items, tree height is log2(100M) ≈ 27. Each child pointer jumps to a random disk address. Traversing 27 levels requires 27 separate 4KB block reads (2.7 milliseconds of latency!).',
          'Severe I/O waste: Each 4KB page read only uses ~32 bytes for one node, wasting 99.2% of loaded bandwidth.',
        ],
        intuitivePlausibilityScore: 85,
        formalValidityScore: 30,
      },
      {
        id: 'sgr-sorted-array-binary',
        title: 'Flat Sorted Array with Binary Search',
        description: 'Keep an array of keys sorted contiguously on disk and binary search over it.',
        mechanism: 'Contiguous array binary search',
        structuralFeaturesIdentified: ['contiguous locality', 'fast range scans'],
        assumptions: ['Binary search on contiguous memory minimizes pointer overhead.'],
        limitationsEncountered: [
          'Insert Catastrophe: Inserting a single new record in the middle requires shifting up to 50 million records on disk (gigabytes of write amplification!).',
        ],
        intuitivePlausibilityScore: 75,
        formalValidityScore: 35,
      },
      {
        id: 'sgr-hash-table-disk',
        title: 'On-Disk Hash Table with Buckets',
        description: 'Hash the User ID to an index and store records in 4KB bucket pages.',
        mechanism: 'O(1) direct hash indexing',
        structuralFeaturesIdentified: ['constant time lookup', 'block page packing'],
        assumptions: ['O(1) hash lookup is always faster than tree search.'],
        limitationsEncountered: [
          'Total failure on range queries: Hash functions destroy sorted order. Finding "users aged 25 to 35" requires scanning every single bucket in the entire 100M database (full table scan!).',
        ],
        intuitivePlausibilityScore: 85,
        formalValidityScore: 50,
      },
    ],
    canonicalConsolidation: {
      expertPrincipleTitle: 'The B+ Tree: Hardware Block-Aligned Indexing',
      formalFormulaOrModel:
        'Tree Height: h ≤ ⌈log_B(N)⌉  |  Fan-out B = ⌊PageSize / (KeySize + PointerSize)⌋  |  I/O Operations ≤ h',
      formalParameters: [
        {
          name: 'Hardware Page / Block Size',
          symbol: 'PageSize',
          meaning: 'Atomic storage read size (e.g., 4,096 bytes)',
          cognitiveRole: 'Defines the structural unit of the tree node',
        },
        {
          name: 'Fan-out Branching Factor',
          symbol: 'B',
          meaning: 'Number of child pointers packed into a single 4KB block',
          cognitiveRole:
            'With 16-byte keys and 8-byte pointers, B ≈ 4096 / 24 ≈ 170 child keys per block',
        },
        {
          name: 'Tree Height',
          symbol: 'h',
          meaning: 'Number of disk reads required from root to leaf',
          cognitiveRole: 'For 100M keys, log_170(100M) ≤ 4 disk reads (vs 27 in a binary tree!)',
        },
        {
          name: 'Linked Leaf Chain',
          symbol: 'Leaves',
          meaning: 'Double-linked list connecting all bottom leaf pages',
          cognitiveRole: 'Enables O(k) sequential scan for range queries without tree backtracking',
        },
      ],
      juxtapositionMappings: [
        {
          studentConcept: 'Binary Search Tree on disk',
          canonicalConcept: 'Wide Multi-Way B-Tree Fan-out',
          alignmentStatus: 'incomplete',
          explanation:
            'Binary trees optimize CPU comparisons (where branches cost 0 I/O); B-Trees optimize disk block fetches.',
          contrastiveInsight:
            'Since loading 4KB costs the same as 32 bytes, packing 170 keys into one block shrinks tree depth from 27 down to 3, cutting disk latency by 89%!',
        },
        {
          studentConcept: 'Flat Sorted Array',
          canonicalConcept: 'Page Splitting and Balancing',
          alignmentStatus: 'incomplete',
          explanation: 'Both maintain sorted order, but arrays require O(N) shift on insert.',
          contrastiveInsight:
            'B+ Trees divide data into autonomous 4KB leaf pages. When a page fills, it splits into two 50% full pages, localizing insert work to O(B) instead of O(N).',
        },
        {
          studentConcept: 'Hash Table',
          canonicalConcept: 'B+ Tree Linked Leaf Layer',
          alignmentStatus: 'divergent',
          explanation: 'Hash tables provide O(1) single-key lookup but cannot do range scans.',
          contrastiveInsight:
            'B+ Trees store all actual data records strictly in the bottom leaf nodes and link them in a doubly linked list, providing fast log_B(N) search AND lightning-fast sorted range traversal.',
        },
      ],
      structuralInvariants: [
        'Hardware Block Geometry Alignment (node size matches disk transfer block size)',
        'Balanced Multi-way Invariant: All leaf nodes reside at the exact same depth',
        'Separation of Navigation (internal routing keys) from Storage (leaf data records)',
      ],
      whyIntuitionFailed:
        'Intuition carried over in-memory algorithmic assumptions (binary branching and hash maps) where memory access has uniform low latency. It failed to account for the asymmetric hardware reality of block-based mechanical or flash storage.',
      howExpertModelSolvesIt:
        'Maximizes fan-out to fit the hardware block page, flattening tree depth to 3-4 levels. It segregates navigation into internal index nodes while chaining leaf records in sorted linked order for continuous range scans.',
    },
    transferProbes: [
      {
        probeId: 'tp-btree-near',
        transferDistance: 'near',
        targetDomain: 'PostgreSQL & MySQL InnoDB Storage Engines',
        problemStatement:
          'In MySQL InnoDB, the default page size is 16KB. If an index has 8-byte integer IDs and 6-byte child pointers, approximately how many records can a 3-level B+ Tree index before needing a 4th disk level?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'Over 1 billion records: Fan-out B ≈ 16384 / 14 ≈ 1,170. A 3-level tree indexes ~1,170³ ≈ 1.6 billion keys in only 3 disk reads!',
            isCorrect: true,
            explanation:
              'Massive fan-out keeps tree depth exceptionally shallow; root and level 1 are typically cached in RAM, requiring only 1 physical disk read for leaf data.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Only 3,000 records, because 16KB can only hold 3,000 bytes of data.',
            isCorrect: false,
            explanation: '16KB is 16,384 bytes, and trees branch exponentially.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Exactly 256 records, limited by 8-bit addressing.',
            isCorrect: false,
            explanation: '6-byte pointers support 281 terabytes of addressing.',
          },
        ],
        deepStructuralInvariant: 'Exponential scaling of shallow trees under high block fan-out',
        surfaceFeaturesDifference:
          'Generic 4KB block design vs MySQL InnoDB 16KB table space implementation',
      },
      {
        probeId: 'tp-btree-medium',
        transferDistance: 'medium',
        targetDomain: 'Write-Heavy Storage: Log-Structured Merge (LSM) Trees',
        problemStatement:
          'For massive write workloads (e.g. logging 500,000 telemetry events per second in Apache Cassandra or RocksDB), why do systems switch from B+ Trees to Log-Structured Merge (LSM) Trees?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'B+ Trees perform random in-place page writes on disk which cause high write amplification and SSD wear; LSM Trees append all writes sequentially to an in-memory MemTable and flush large sorted immutable files (SSTables) in sequential disk bursts.',
            isCorrect: true,
            explanation:
              'Hardware storage writes sequential blocks orders of magnitude faster than random block updates. LSM trees trade read amplification for maximum sequential write throughput.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'LSM trees do not use RAM at all and run directly on CPU registers.',
            isCorrect: false,
            explanation: 'LSM trees rely heavily on RAM for the MemTable.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'B+ Trees are only allowed to store text strings, not telemetry numbers.',
            isCorrect: false,
            explanation: 'B+ trees index any sortable data type.',
          },
        ],
        deepStructuralInvariant:
          'Sequential vs Random I/O write patterns in secondary physical storage',
        surfaceFeaturesDifference:
          'Read-optimized B+ Tree indexing vs append-only LSM tree telemetry streaming',
      },
      {
        probeId: 'tp-btree-far',
        transferDistance: 'far',
        targetDomain: 'Organizational Management & Span of Control',
        problemStatement:
          'In corporate management theory, why do large global enterprises (like 500,000-employee conglomerates) adopt a wide "span of control" (e.g., 8-15 direct reports per director) rather than a narrow binary hierarchy (2 reports per manager)?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'A binary tree of 500,000 employees would require 19 bureaucratic management layers (log2(500k) ≈ 19), creating massive communication latency and signal distortion; a fan-out of 10-15 flattens the hierarchy to only 4-5 layers (log10(500k) ≈ 5.7), preserving executive responsiveness.',
            isCorrect: true,
            explanation:
              'The exact same structural invariant governs information routing depth in human hierarchies as in disk storage systems: high fan-out minimizes traversal latency.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Because companies are legally forbidden from having more than 3 managers.',
            isCorrect: false,
            explanation: 'Absurd.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Because binary trees are copyrighted by computer scientists and cannot be used in business.',
            isCorrect: false,
            explanation: 'Nonsensical.',
          },
        ],
        deepStructuralInvariant:
          'Minimization of traversal latency in hierarchical communication networks through increased node fan-out',
        surfaceFeaturesDifference:
          'Disk block pointers vs corporate managerial reporting hierarchies',
      },
    ],
    reflectionQuestions: [
      'Why is an algorithm that is mathematically optimal in RAM (like an AVL tree) catastrophic on secondary disk storage?',
      'How does packing multiple keys into a single block turn the hardware reality of 4KB disk reads into an advantage?',
      'Why does linking leaf nodes in a doubly linked list solve range queries better than traversing parent index pointers?',
    ],
    seedCards: [
      {
        front:
          'Productive Failure: Why is a Binary Search Tree (AVL / Red-Black) disastrous as an on-disk database index?',
        back: 'For 100M rows, a binary tree requires ~27 levels of depth. Because disk I/O reads fixed blocks (4KB) at millisecond latency, fetching 27 scattered 32-byte nodes wastes 99% of loaded block bandwidth and causes 27 separate high-latency disk seeks.',
        targetFactor: 'Binary Tree Disk Impasse',
        conceptualDepth: 'impasse',
      },
      {
        front:
          'Productive Failure: How does the B+ Tree leverage hardware block size to minimize disk latency?',
        back: 'It matches node size to disk page size (e.g. 4KB/16KB), packing hundreds of keys per block (fan-out B ≈ 100-1000). This flattens tree height to 3-4 levels, reducing disk seeks from 27 down to 3.',
        targetFactor: 'Block-Aligned Fan-Out',
        conceptualDepth: 'canonical',
      },
      {
        front:
          'Productive Failure: What structural invariant links database B+ Tree fan-out to organizational corporate hierarchy design?',
        back: 'Both minimize communication traversal latency across large populations by expanding node fan-out, reducing logarithmic layer depth from ~20 down to ~4-5 levels.',
        targetFactor: 'Hierarchical Fan-Out Transfer',
        conceptualDepth: 'transfer',
      },
    ],
  },
  {
    id: 'pf-herd-immunity-epidemiology',
    title: 'Epidemiological Herd Immunity',
    domain: 'Public Health & Mathematical Biology',
    subtitle:
      'Symptom Isolation vs Basic Reproduction Number and Critical Threshold (V_c = 1 - 1/R_0)',
    priorKnowledgeContext: 'Pathogen transmission, viral contagion, and immunization.',
    challengePrompt:
      'A novel respiratory virus enters a city of 1,000,000 citizens. Each infected person, on average, transmits the virus to 4 susceptible people over the course of their illness in an unconstrained population.\n\nThe health minister proposes:\n"We only need to isolate people once they develop a fever, and we only need to vaccinate the elderly (about 25% of the city). For the rest, personal hygiene is enough."\n\nExplain why this strategy will fail to stop the epidemic, and derive from first principles the exact percentage of the population that MUST be immunized to permanently extinguish the viral spread without locking everyone in their homes.',
    targetConcept:
      'The Basic Reproduction Number (R_0), Effective Reproduction Number (R_t = R_0 * S), and Herd Immunity Threshold (V_c = 1 - 1 / R_0)',
    intuitiveStarterPrompts: [
      'If each person infects 4 people, how does the number of cases grow over 5 generations (1 -> 4 -> 16 -> ...)?',
      'What happens if 50% of the population is vaccinated: how many people does an infected person now infect on average?',
      'At what exact point does an infected person transmit to fewer than 1 susceptible person on average?',
    ],
    exemplarStudentRepresentations: [
      {
        id: 'sgr-symptom-isolation',
        title: 'Reactive Symptom Quarantine',
        description: 'Isolate anyone who exhibits symptoms (cough, fever) immediately.',
        mechanism: 'Post-symptomatic physical containment',
        structuralFeaturesIdentified: ['physical isolation', 'observable illness detection'],
        assumptions: ['Transmission occurs only when a person feels sick and displays symptoms.'],
        limitationsEncountered: [
          'Presymptomatic and asymptomatic transmission: Infected individuals shed viral particles 24-48 hours BEFORE developing symptoms. By the time they isolate, they have already infected their quota of people, allowing the virus to spread exponentially.',
        ],
        intuitivePlausibilityScore: 80,
        formalValidityScore: 25,
      },
      {
        id: 'sgr-linear-vax-percentage',
        title: 'Targeted High-Risk Protection (25%)',
        description: 'Vaccinate only the 25% vulnerable segment to reduce hospital pressure.',
        mechanism: 'Direct individual shield',
        structuralFeaturesIdentified: ['vulnerability stratification', 'resource conservation'],
        assumptions: [
          'Protecting vulnerable people stops the pathogen from overwhelming hospitals.',
        ],
        limitationsEncountered: [
          'Because 75% remain susceptible and R_0 = 4, the virus continues to circulate exponentially in the general population. Breakthrough infections and individuals with weakened immune systems who cannot be vaccinated will inevitably be infected.',
        ],
        intuitivePlausibilityScore: 75,
        formalValidityScore: 30,
      },
      {
        id: 'sgr-proportional-transmission-drop',
        title: 'Transmission Damping to Sub-Unity',
        description:
          'Vaccinate enough people so that an infected person encounters mostly immune people, reducing net transmission below 1.',
        mechanism: 'Net secondary infections < 1.0',
        structuralFeaturesIdentified: [
          'probabilistic transmission',
          'chain reaction break',
          'sub-critical decay',
        ],
        assumptions: [
          'Transmission scales linearly with the proportion of susceptible people remaining.',
        ],
        limitationsEncountered: [
          'Correct conceptual mechanism, but often miscalculates the exact algebraic threshold or assumes 100% vaccination is required to achieve safety.',
        ],
        intuitivePlausibilityScore: 95,
        formalValidityScore: 85,
      },
    ],
    canonicalConsolidation: {
      expertPrincipleTitle: 'The SIR Model and Herd Immunity Threshold (V_c = 1 - 1/R_0)',
      formalFormulaOrModel:
        'Effective R: R_t = R_0 * S  |  Extinction Condition: R_t < 1  |  Herd Immunity Threshold: V_c = 1 - (1 / R_0)',
      formalParameters: [
        {
          name: 'Basic Reproduction Number',
          symbol: 'R_0',
          meaning:
            'Average number of secondary cases caused by one infectious individual in a fully susceptible population',
          cognitiveRole: 'Intrinsic viral contagiousness metric (e.g., R_0 = 4)',
        },
        {
          name: 'Susceptible Fraction',
          symbol: 'S',
          meaning: 'Proportion of the population that can catch the disease (S = 1 - V)',
          cognitiveRole: 'Filters the transmission pool; must be driven below 1/R_0',
        },
        {
          name: 'Immunized Fraction',
          symbol: 'V',
          meaning:
            'Proportion of population with sterilizing immunity via vaccination or prior recovery',
          cognitiveRole: 'Absorbs transmission chains as an immunological firewall',
        },
        {
          name: 'Critical Vaccination Threshold',
          symbol: 'V_c',
          meaning:
            'Minimum fraction immunized to guarantee exponential viral decay: V_c = 1 - 1/R_0',
          cognitiveRole: 'For R_0 = 4: V_c = 1 - 1/4 = 0.75 (75% must be immune)',
        },
      ],
      juxtapositionMappings: [
        {
          studentConcept: 'Isolate symptomatic people only',
          canonicalConcept: 'Presymptomatic Generation Interval (k)',
          alignmentStatus: 'divergent',
          explanation: 'Pathogens with presymptomatic shedding bypass symptom-based screening.',
          contrastiveInsight:
            'Population immunity stops transmission regardless of whether symptoms are present, breaking chains invisibly.',
        },
        {
          studentConcept: 'Vaccinate only high-risk (25%)',
          canonicalConcept: 'Indirect Communal Protection (Herd Immunity)',
          alignmentStatus: 'incomplete',
          explanation:
            'High-risk individuals cannot always be vaccinated and vaccines are not 100% effective.',
          contrastiveInsight:
            'When the broader population reaches 1 - 1/R_0, the pathogen cannot find transmission pathways, shielding the vulnerable indirectly.',
        },
        {
          studentConcept: 'Reduce net transmission below 1',
          canonicalConcept: 'Sub-critical Branching Process (R_t < 1)',
          alignmentStatus: 'convergent',
          explanation:
            'Accurately grasped that an epidemic collapses if each case spawns < 1 successor.',
          contrastiveInsight:
            'Derives the exact mathematical threshold: setting R_t = R_0 * (1 - V_c) = 1 yields 1 - V_c = 1/R_0, so V_c = 1 - 1/R_0.',
        },
      ],
      structuralInvariants: [
        'Super-critical vs Sub-critical Branching Processes (Threshold Phase Transition at R = 1)',
        'Indirect Protection as an Emergent Network Property (immunized nodes act as firewall buffers)',
        'Algebraic Inversion of Contagiousness: Higher R_0 demands asymptotically steeper immunity (R_0=2 -> 50%, R_0=4 -> 75%, R_0=18 -> 94.4%)',
      ],
      whyIntuitionFailed:
        'Intuition viewed disease as an individual medical event rather than a percolation phase transition on a contact graph. It failed to account for presymptomatic transmission and the nonlinear dynamics of chain-reaction branching.',
      howExpertModelSolvesIt:
        'Frames contagion as a branching process where the average offspring count is R_t = R_0 * (1 - V). Setting R_t < 1 yields the exact universal percolation threshold V_c = 1 - 1/R_0, guaranteeing exponential decay of cases without requiring 100% vaccination.',
    },
    transferProbes: [
      {
        probeId: 'tp-herd-near',
        transferDistance: 'near',
        targetDomain: 'Measles Outbreak Containment',
        problemStatement:
          'Measles has an extraordinary basic reproduction number of R_0 = 18. What percentage of school children must be fully vaccinated to prevent a classroom measles outbreak from turning into an exponential community epidemic?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'At least 94.4%: V_c = 1 - (1 / 18) = 17 / 18 ≈ 94.4%.',
            isCorrect: true,
            explanation:
              'Because R_0 is 18, even a small drop in community vaccination below 95% triggers immediate measles outbreaks.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: '50%, because half the population forms a majority.',
            isCorrect: false,
            explanation: 'At 50% immunity, R_t = 18 * 0.5 = 9, which remains hyper-explosive.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: '18%, matching the R_0 number directly.',
            isCorrect: false,
            explanation: 'Confuses R_0 with percentage.',
          },
        ],
        deepStructuralInvariant: 'Threshold formula V_c = 1 - 1/R_0 under extreme contagiousness',
        surfaceFeaturesDifference:
          'Hypothetical R_0 = 4 virus vs real-world airborne measles R_0 = 18',
      },
      {
        probeId: 'tp-herd-medium',
        transferDistance: 'medium',
        targetDomain: 'Computer Network Cybersecurity & Malware Worms',
        problemStatement:
          'An autonomous network worm (like WannaCry) replicates by scanning IP addresses. Each infected server infects on average 5 other unpatched servers (R_0 = 5). What percentage of servers in an enterprise intranet must have the security patch installed to prevent the worm from cascading across the corporate network?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: '80%: V_c = 1 - (1 / 5) = 4/5 = 80%. Once 80% are patched, an infected server encounters unpatched nodes with probability < 0.2, so R_t < 1 and the worm dies out.',
            isCorrect: true,
            explanation:
              'Cybersecurity worm percolation follows the exact same branching math as viral contagion.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: '100% of servers must be disconnected from the internet permanently.',
            isCorrect: false,
            explanation:
              'Percolation threshold breaks the epidemic without requiring total disconnection.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Only the main gateway router needs to be patched.',
            isCorrect: false,
            explanation: 'Internal lateral movement bypasses perimeter firewalls.',
          },
        ],
        deepStructuralInvariant: 'Percolation firewalling in network graph contagion',
        surfaceFeaturesDifference:
          'Biological human respiratory contagion vs automated TCP packet worm replication',
      },
      {
        probeId: 'tp-herd-far',
        transferDistance: 'far',
        targetDomain: 'Financial Contagion & Systemic Banking Risk',
        problemStatement:
          'During a liquidity panic, the default of one bank causes counterparty defaults in on average 2.5 connected banks through derivative margin calls (R_0 = 2.5). How does the Central Bank capital reserve requirement act as "herd immunity" against systemic banking collapse?',
        options: [
          {
            id: 'opt-a',
            label: 'A',
            text: 'Mandating that banks hold safe liquidity reserves acts like vaccination: if more than 1 - (1 / 2.5) = 60% of institutions have impenetrable capital buffers, any single default will trigger on average < 1 secondary failure (R_t < 1), quenching the systemic liquidity panic.',
            isCorrect: true,
            explanation:
              'Solvency buffers absorb default shocks, preventing the cascading chain reaction from reaching super-criticality.',
          },
          {
            id: 'opt-b',
            label: 'B',
            text: 'Banks should print unlimited paper money to buy gold coins.',
            isCorrect: false,
            explanation: 'Nonsensical.',
          },
          {
            id: 'opt-c',
            label: 'C',
            text: 'Closing all banks permanently guarantees zero bankruptcies.',
            isCorrect: false,
            explanation: 'Destroys economic activity.',
          },
        ],
        deepStructuralInvariant:
          'Absorbing nodes in interconnected network graph arresting cascade percolation',
        surfaceFeaturesDifference:
          'Biological pathogens vs financial counterparty liquidity debt contagion',
      },
    ],
    reflectionQuestions: [
      'Why does symptom-based quarantine fail against viruses with high presymptomatic transmission?',
      'Why does an increase in R_0 from 2 to 4 increase required immunity by 25%, but an increase from 4 to 18 only increases it by ~19%?',
      'How does herd immunity protect people who are medically unable to be vaccinated?',
    ],
    seedCards: [
      {
        front:
          'Productive Failure: Why does isolating sick individuals fail to halt high R_0 respiratory epidemics?',
        back: 'Infected individuals frequently transmit the pathogen during presymptomatic and asymptomatic phases before symptoms emerge, allowing exponential spread (R_t > 1) to continue unhindered.',
        targetFactor: 'Presymptomatic Transmission Impasse',
        conceptualDepth: 'impasse',
      },
      {
        front:
          'Productive Failure: What is the Herd Immunity formula and the condition for epidemic extinction?',
        back: 'V_c = 1 - (1 / R_0). When the immune fraction V exceeds V_c, the effective reproduction number R_t = R_0 * (1 - V) drops below 1.0, causing the chain reaction to decay exponentially to extinction.',
        targetFactor: 'Herd Immunity Threshold',
        conceptualDepth: 'canonical',
      },
      {
        front:
          'Productive Failure: What structural invariant links vaccination in epidemiology to cyber worm patching and banking capital reserves?',
        back: 'All three are percolation barriers on network graphs: when a critical threshold of nodes (1 - 1/R_0) absorb shocks without transmitting them, cascading chain reactions collapse sub-critically (R_t < 1).',
        targetFactor: 'Percolation Invariant Transfer',
        conceptualDepth: 'transfer',
      },
    ],
  },
]

/* ==========================================================================
 * SCENARIO ACCESSORS
 * ========================================================================== */

/**
 * Returns all canonical Productive Failure scenarios.
 */
export function getCanonicalPFScenarios(): PFScenario[] {
  return CANONICAL_PF_SCENARIOS
}

/**
 * Retrieves a specific Productive Failure scenario by ID.
 */
export function getPFScenarioById(scenarioId: string): PFScenario | undefined {
  return CANONICAL_PF_SCENARIOS.find((s) => s.id === scenarioId)
}

/* ==========================================================================
 * METRICS CALCULATION & ALGORITHMS
 * ========================================================================== */

export interface CalculatePFMetricsParams {
  representations: StudentGeneratedRepresentation[]
  impasse: ImpasseAnalysis
  consolidationRatings: {
    featureAlignment: number // 0 to 100
    parameterMapping: number // 0 to 100
    invariantGrasp: number // 0 to 100
  }
  transferResults: Array<{
    probeId: string
    isCorrect: boolean
    confidence: number // 1 to 5
  }>
}

/**
 * Calculates quantitative Productive Failure metrics according to the
 * Sinha & Kapur (2021) explanatory predictor model.
 */
export function calculatePFMetrics(params: CalculatePFMetricsParams): PFMetrics {
  const { representations, impasse, consolidationRatings, transferResults } = params

  // 1. Generation Diversity Index (GDI in [0, 1])
  // Rewards both number of distinct representations and breadth of structural features explored
  const repCount = representations.length
  const allFeatures = new Set<string>()
  for (const rep of representations) {
    for (const f of rep.structuralFeaturesIdentified) {
      allFeatures.add(f.trim().toLowerCase())
    }
  }

  let gdi = 0
  if (repCount > 0) {
    const countScore = Math.min(1.0, repCount / 3.0)
    const featureScore = Math.min(1.0, allFeatures.size / 4.0)
    gdi = Math.round((0.5 * countScore + 0.5 * featureScore) * 100) / 100
  }

  // 2. Impasse Sensitivity Score (ISS in [0, 100])
  // High impasse sensitivity indicates the learner recognized why heuristics failed
  let iss = 0
  if (impasse.impasseEncountered) {
    const boundaryScore = Math.min(40, impasse.boundaryConditionsTested.length * 15)
    const gapScore = impasse.knowledgeGapArticulated.trim().length > 15 ? 30 : 15
    const affectiveScore = (impasse.affectiveImpasseRating / 5.0) * 30
    iss = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          0.4 * impasse.impasseDepthScore + 0.6 * (boundaryScore + gapScore + affectiveScore),
        ),
      ),
    )
  }

  // 3. Consolidation Integration Gain (CIG in [0, 100])
  // Measures conceptual assembly when juxtaposing SGRs with CERs
  const cig = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        0.35 * consolidationRatings.featureAlignment +
          0.35 * consolidationRatings.parameterMapping +
          0.3 * consolidationRatings.invariantGrasp,
      ),
    ),
  )

  // 4. Adaptive Transfer Score (ATS in [0, 100])
  // Weighted performance across Near (1.0x), Medium (1.5x), Far (2.0x) probes
  let ats = 0
  if (transferResults.length > 0) {
    let weightedScore = 0
    let totalWeight = 0

    transferResults.forEach((t, idx) => {
      // Weight progressive probes: index 0 (near)=1.0, 1 (med)=1.5, 2 (far)=2.0
      const weight = idx === 0 ? 1.0 : idx === 1 ? 1.5 : 2.0
      totalWeight += weight
      if (t.isCorrect) {
        // High confidence correct earns full weight; confidence calibration factor
        const confFactor = 0.8 + (t.confidence / 5.0) * 0.2
        weightedScore += weight * confFactor * 100
      }
    })

    ats = totalWeight > 0 ? Math.min(100, Math.round(weightedScore / totalWeight)) : 0
  }

  // 5. Productive Failure Index (PFI in [0, 100])
  // Synergy formulation: Exploration * Impasse * (1 + Consolidation)
  // Learners with high generation + high impasse experience massive consolidation dividends
  const explorationComponent = gdi * 100
  let pfi = Math.round(0.25 * explorationComponent + 0.25 * iss + 0.25 * cig + 0.25 * ats)

  // Synergy bonus: If learner explored diversely (GDI >= 0.6) and experienced true impasse (ISS >= 60),
  // they receive Kapur's consolidation readiness bonus (+8 points)
  if (gdi >= 0.6 && iss >= 60) {
    pfi = Math.min(100, pfi + 8)
  }

  // 6. Failure-to-Mastery Ratio (Phi coefficient)
  // Ratio of deep transfer mastery (ATS) to baseline intuitive validity
  const avgIntuitiveValidity =
    repCount > 0
      ? representations.reduce((acc, r) => acc + r.formalValidityScore, 0) / repCount
      : 30
  const failureToMasteryRatio = Math.round((ats / Math.max(10, avgIntuitiveValidity)) * 100) / 100

  // 7. Mastery Band Categorization
  let masteryBand: PFMasteryBand = 'Novice Intuition'
  if (pfi >= 80) {
    masteryBand = 'Master Adaptive Transferer'
  } else if (pfi >= 60) {
    masteryBand = 'Consolidated Thinker'
  } else if (pfi >= 35) {
    masteryBand = 'Developing Explorer'
  }

  // 8. Qualitative Feedback & Intervention Recommendation
  let qualitativeFeedback = ''
  let recommendedIntervention = ''

  if (masteryBand === 'Master Adaptive Transferer') {
    qualitativeFeedback =
      'Outstanding Productive Failure trajectory! You generated diverse representations, pinpointed the exact structural breakdown points, and fully consolidated the canonical invariants across near and far transfer domains.'
    recommendedIntervention =
      'Advance to generative problem posing and cross-disciplinary isomorphic mapping in the Analogical Transfer studio.'
  } else if (masteryBand === 'Consolidated Thinker') {
    qualitativeFeedback =
      'Strong conceptual integration. You discovered key limitations in your initial models and mapped them effectively onto the canonical parameters, achieving high near and medium transfer.'
    recommendedIntervention =
      'Engage with far-transfer probes and examine how the canonical invariants map onto non-traditional domains.'
  } else if (masteryBand === 'Developing Explorer') {
    qualitativeFeedback =
      'Good exploration effort. You generated interesting intuitive hypotheses, but encountered friction in reconciling your heuristics with the formal parameters.'
    recommendedIntervention =
      'Review the Juxtaposition Matrix: focus on why squaring or block-alignment resolves the specific edge cases where your intuition broke down.'
  } else {
    qualitativeFeedback =
      'Premature closure observed. Either too few representations were explored before looking at the solution, or the underlying impasse was not deeply analyzed.'
    recommendedIntervention =
      'Re-attempt the problem in Exploration mode: deliberately test extreme boundary conditions (e.g. zeros, infinities, single points) before consulting canonical formulas.'
  }

  return {
    generationDiversityIndex: gdi,
    impasseSensitivityScore: iss,
    consolidationIntegrationGain: cig,
    adaptiveTransferScore: ats,
    productiveFailureIndex: pfi,
    failureToMasteryRatio,
    masteryBand,
    qualitativeFeedback,
    recommendedIntervention,
  }
}

/**
 * Evaluates a learner's newly authored student-generated representation (SGR)
 * against the target concept's structural feature library.
 */
export function evaluateStudentRepresentation(
  scenarioId: string,
  input: {
    title: string
    description: string
    mechanism: string
    structuralFeatures: string[]
  },
): StudentGeneratedRepresentation {
  const scenario = getPFScenarioById(scenarioId)

  // Identify features matched
  const matchedFeatures: string[] = []
  const textBlob =
    `${input.title} ${input.description} ${input.mechanism} ${input.structuralFeatures.join(' ')}`.toLowerCase()

  if (scenario) {
    for (const exemplar of scenario.exemplarStudentRepresentations) {
      for (const feat of exemplar.structuralFeaturesIdentified) {
        if (textBlob.includes(feat.toLowerCase()) && !matchedFeatures.includes(feat)) {
          matchedFeatures.push(feat)
        }
      }
    }
  }

  // Add any explicitly provided features
  for (const f of input.structuralFeatures) {
    if (f.trim() && !matchedFeatures.includes(f.trim())) {
      matchedFeatures.push(f.trim())
    }
  }

  // Estimate plausibility and formal validity
  let plausibility = 70
  let formalValidity = 35

  if (textBlob.length > 50) plausibility += 10
  if (matchedFeatures.length >= 2) {
    plausibility = Math.min(95, plausibility + 15)
    formalValidity = Math.min(85, formalValidity + 25)
  }

  return {
    id: `sgr-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim() || 'Custom Representation',
    description: input.description.trim(),
    mechanism: input.mechanism.trim(),
    structuralFeaturesIdentified:
      matchedFeatures.length > 0 ? matchedFeatures : ['intuitive heuristic'],
    assumptions: ['Assumes standard conditions without extreme boundary tests'],
    limitationsEncountered: [
      'Edge cases and mathematical invariants require canonical formalization',
    ],
    intuitivePlausibilityScore: plausibility,
    formalValidityScore: formalValidity,
  }
}

/**
 * Generates calibrated FSRS-6 spaced repetition cards derived from the
 * Productive Failure session, tuning initial stability based on PFI.
 */
export function generatePFFSRSCards(
  scenario: PFScenario,
  metrics: PFMetrics,
): Array<{
  front: string
  back: string
  targetFactor: string
  conceptualDepth: ConceptualDepth
  initialStabilityDays: number
  initialDifficulty: number
}> {
  // Higher PFI -> greater retention and initial stability S0
  // Range: 1.2 to 4.5 days
  const initialStabilityDays =
    Math.round((1.2 + (metrics.productiveFailureIndex / 100.0) * 3.3) * 10) / 10

  // Higher Consolidation Gain -> lower perceived difficulty D0
  // Range: 3.0 (easy) to 7.5 (hard)
  const initialDifficulty =
    Math.round(
      Math.max(2.5, Math.min(8.5, 8.0 - (metrics.consolidationIntegrationGain / 100.0) * 4.5)) * 10,
    ) / 10

  return scenario.seedCards.map((card) => ({
    front: card.front,
    back: card.back,
    targetFactor: card.targetFactor,
    conceptualDepth: card.conceptualDepth,
    initialStabilityDays,
    initialDifficulty,
  }))
}

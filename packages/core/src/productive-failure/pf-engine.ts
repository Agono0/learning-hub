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

import { CANONICAL_PF_SCENARIOS } from './content'

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
 * CANONICAL SCENARIOS
 * Moved verbatim to `./content.ts` (TD-05: scenario corpora are content, not
 * logic). Imported from there above. Not re-exported — the corpus constant
 * was module-private before the move and stays module-private after it, so
 * the public barrel surface (`index.ts` → `export * from './pf-engine'`) is
 * unchanged.
 * ========================================================================== */

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

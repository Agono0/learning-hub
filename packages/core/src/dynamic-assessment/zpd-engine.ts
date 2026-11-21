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

import { CANONICAL_ZPD_SCENARIOS } from './content'

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

/**
 * Canonical input payload for ZPD trajectory evaluation and FSRS deck generation
 * (shared by the REST server, MCP tools, and CLI; hosts MUST NOT re-declare it).
 * Defaults describe the canonical demo trajectory: independent baseline (ADL) 25,
 * mediated post-test (PDL) 80, 2 graduated prompts consumed, near/medium/far
 * transfer scores 85/75/70 on the default dynamic-programming scenario.
 */
export const ZpdEvaluationInputSchema = z.object({
  scenarioId: z
    .string()
    .min(1)
    .default('algo_dynamic_programming')
    .describe('Assessment scenario identifier.'),
  preTestScore: z
    .number()
    .min(0)
    .max(100)
    .default(25)
    .describe('Independent baseline score (ADL).'),
  postTestScore: z.number().min(0).max(100).default(80).describe('Mediated post-test score (PDL).'),
  promptsConsumed: z
    .number()
    .int()
    .min(0)
    .max(5)
    .default(2)
    .describe('Graduated prompts accessed (0..5).'),
  transferScores: z
    .array(z.number().min(0).max(100))
    .default([85, 75, 70])
    .describe('Scores on near, medium, far transfer tasks.'),
})
export type ZpdEvaluationInput = z.infer<typeof ZpdEvaluationInputSchema>

/** Canonical input payload for graduated prompt retrieval at a tier level (1..5). */
export const ZpdPromptInputSchema = z.object({
  scenarioId: z
    .string()
    .min(1)
    .default('algo_dynamic_programming')
    .describe('Assessment scenario identifier.'),
  tierLevel: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(1)
    .describe('Graduated prompt tier level (1..5).'),
})
export type ZpdPromptInput = z.infer<typeof ZpdPromptInputSchema>

// ============================================================================
// 2. CANONICAL MULTIDISCIPLINARY SCENARIOS
// ============================================================================

/**
 * Scenario content moved verbatim to `./content.ts` (TD-05: scenario corpora
 * are content, not logic). Re-exported here so every existing import path
 * keeps working (`index.ts` does `export * from './zpd-engine'`).
 */
export { CANONICAL_ZPD_SCENARIOS } from './content'

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

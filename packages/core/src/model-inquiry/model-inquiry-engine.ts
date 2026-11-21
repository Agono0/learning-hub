/**
 * Model-Based Scientific Inquiry & Gedankenexperiment (Mental Simulation) Engine
 *
 * Grounded in:
 * - John Clement (2008). Creative Model Construction in Scientists and Students:
 *   The Role of Imagery, Analogy, and Mental Simulation. Springer.
 * - Nancy J. Nersessian (2002). The Cognitive Basis of Model-based Reasoning in Science.
 * - Nancy J. Nersessian (2008). Creating Scientific Concepts. MIT Press.
 * - Philip N. Johnson-Laird (1983). Mental Models: Towards a Cognitive Science of
 *   Language, Inference, and Consciousness. Harvard University Press.
 * - Michelene T. H. Chi & Ruth Wylie (2014). The ICAP Framework: Linking Cognitive
 *   Engagement to Active Learning Outcomes. Educational Psychologist.
 *
 * Key Theoretical Constructs:
 * 1. Model Construction Cycle: Initial Mental Model (M_0) -> Extreme Case Perturbation (EC) ->
 *    Dynamic Simulative Animation (SAF) -> Contradiction Crucible -> Bridging Analogy (BA) ->
 *    Revised Explanatory Model (M_{k+1}).
 * 2. Gedankenexperimente (Thought Experiments): Mental simulation of idealized, boundary-condition
 *    scenarios to reveal internal contradictions in folk models or deducing emergent laws.
 * 3. Extreme Cases: Perturbing system parameters to mathematical/physical limits (m -> 0,
 *    v -> c, T -> 0, friction -> 0) to expose structural invariance and isolate causal mechanisms.
 * 4. Bridging Analogies: Constructing intermediate structural analogs that connect an anchored
 *    intuitive scenario with an otherwise counter-intuitive target domain.
 * 5. Quantitative Telemetry:
 *    - Extreme Case Diagnostic Index (ECDI in [0, 100])
 *    - Simulative Animation Fidelity (SAF in [0, 100])
 *    - Bridging Analogy Score (BAS in [0, 100])
 *    - Model Modification Score (MMS in [0, 100])
 *    - Composite Model-Based Reasoning Index (MBRI in [0, 100])
 *    - 4 Cognitive Maturity Tiers (folk_intuition -> gedanken_theorist)
 * 6. Calibrated FSRS-6 Review Deck Generation.
 */

import { z } from 'zod'

// TD-05: scenario corpora (content, not logic) live in './content'.
import { GEDANKEN_SCENARIOS } from './content'

// ============================================================================
// 1. Zod Schemas & Types
// ============================================================================

export const GedankenDomainSchema = z.enum([
  'classical_mechanics',
  'thermodynamics',
  'relativity_modern_physics',
  'evolutionary_biology',
  'computational_logic',
])
export type GedankenDomain = z.infer<typeof GedankenDomainSchema>

export const ModelMaturityTierSchema = z.enum([
  'folk_intuition',
  'qualitative_mechanist',
  'perturbation_analyst',
  'gedanken_theorist',
])
export type ModelMaturityTier = z.infer<typeof ModelMaturityTierSchema>

export const ExtremeCaseVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  baselineValue: z.string(),
  extremeLimit: z.string(),
  intuitiveExpectation: z.string(),
  paradoxicalOutcome: z.string(),
  scientificExplanation: z.string(),
})
export type ExtremeCaseVariable = z.infer<typeof ExtremeCaseVariableSchema>

export const SimulativeStepSchema = z.object({
  id: z.string(),
  stepOrder: z.number(),
  action: z.string(),
  causalMechanism: z.string(),
  expectedObservation: z.string(),
  revealedContradiction: z.string().optional(),
})
export type SimulativeStep = z.infer<typeof SimulativeStepSchema>

export const BridgingAnalogySchema = z.object({
  id: z.string(),
  anchorIntuition: z.string(),
  intermediateBridge: z.string(),
  targetSystem: z.string(),
  sharedCausalStructure: z.string(),
  resolvingInsight: z.string(),
})
export type BridgingAnalogy = z.infer<typeof BridgingAnalogySchema>

export const FSRSCardTemplateSchema = z.object({
  question: z.string(),
  answer: z.string(),
  rationale: z.string(),
  difficulty: z.number().min(1).max(10),
})
export type FSRSCardTemplate = z.infer<typeof FSRSCardTemplateSchema>

export const GedankenScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: GedankenDomainSchema,
  historicalOrigin: z.string(),
  targetPhenomenon: z.string(),
  folkConception: z.string(),
  initialModelAssumptions: z.array(z.string()),
  extremeCases: z.array(ExtremeCaseVariableSchema),
  simulativeSteps: z.array(SimulativeStepSchema),
  bridgingAnalogies: z.array(BridgingAnalogySchema),
  canonicalResolution: z.object({
    title: z.string(),
    mechanism: z.string(),
    keyPrinciples: z.array(z.string()),
  }),
  reflectionPrompts: z.array(z.string()),
  fsrsItems: z.array(FSRSCardTemplateSchema),
})
export type GedankenScenario = z.infer<typeof GedankenScenarioSchema>

export const InquirySessionInputSchema = z.object({
  scenarioId: z.string(),
  initialModelNotes: z.string().optional(),
  selectedExtremeCaseIds: z.array(z.string()).optional().default([]),
  extremeCasePredictions: z.record(z.string(), z.string()).optional().default({}),
  simulativeStepOrder: z.array(z.string()).optional().default([]),
  identifiedContradictions: z.array(z.string()).optional().default([]),
  selectedBridgingId: z.string().optional(),
  bridgingExplanation: z.string().optional(),
  revisedModelHypothesis: z.string().optional(),
})
export type InquirySessionInput = {
  scenarioId: string
  initialModelNotes?: string
  selectedExtremeCaseIds?: string[]
  extremeCasePredictions?: Record<string, string>
  simulativeStepOrder?: string[]
  identifiedContradictions?: string[]
  selectedBridgingId?: string
  bridgingExplanation?: string
  revisedModelHypothesis?: string
}

export const InquiryEvaluationSchema = z.object({
  scenarioId: z.string(),
  extremeCaseScore: z.number().min(0).max(100),
  animationFidelityScore: z.number().min(0).max(100),
  bridgingAnalogyScore: z.number().min(0).max(100),
  modelModificationScore: z.number().min(0).max(100),
  compositeIndex: z.number().min(0).max(100),
  tier: ModelMaturityTierSchema,
  tierDescription: z.string(),
  feedback: z.object({
    strengths: z.array(z.string()),
    blindspots: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
  fsrsCardCount: z.number().nonnegative(),
})
export type InquiryEvaluation = z.infer<typeof InquiryEvaluationSchema>

export const GeneratedFSRSCardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  tags: z.array(z.string()),
  initialStability: z.number(),
  initialDifficulty: z.number(),
})
export type GeneratedFSRSCard = z.infer<typeof GeneratedFSRSCardSchema>

// ============================================================================
// 2. Canonical Gedankenexperiment Scenarios (5 Multidisciplinary Paradigms)
// ============================================================================

// TD-05: the canonical scenario corpora live in './content' (content, not logic).
export { GEDANKEN_SCENARIOS } from './content'

// ============================================================================
// 3. Quantitative Telemetry & Scoring Algorithms
// ============================================================================

/**
 * Extreme Case Diagnostic Index (ECDI in [0, 100])
 * Evaluates learner's selection and predictive accuracy on limiting parameters.
 */
export function calculateExtremeCaseScore(
  scenario: GedankenScenario,
  selectedExtremeCaseIds: string[],
  predictions: Record<string, string>,
): number {
  if (scenario.extremeCases.length === 0) return 100
  if (selectedExtremeCaseIds.length === 0) return 0

  let score = 0
  const maxPossible = scenario.extremeCases.length

  for (const ec of scenario.extremeCases) {
    if (selectedExtremeCaseIds.includes(ec.id)) {
      // Base credit for identifying extreme boundary condition
      score += 0.5

      // Credit for prediction noting paradox or boundary behavior
      const userPrediction = predictions[ec.id]?.toLowerCase().trim() || ''
      if (userPrediction.length > 10) {
        // Check for qualitative keywords indicating boundary insight
        const keywords = [
          'same',
          'cancel',
          'paradox',
          'vacuum',
          'erasure',
          'zero',
          'equal',
          'heat',
          'infinite',
          'loop',
        ]
        const matched = keywords.some((kw) => userPrediction.includes(kw))
        score += matched ? 0.5 : 0.25
      }
    }
  }

  const normalized = Math.round((score / maxPossible) * 100)
  return Math.max(0, Math.min(100, normalized))
}

/**
 * Simulative Animation Fidelity (SAF in [0, 100])
 * Evaluates the step-by-step kinetic/causal validity and contradiction identification.
 */
export function calculateAnimationFidelityScore(
  scenario: GedankenScenario,
  stepOrder: string[] = [],
  identifiedContradictions: string[] = [],
): number {
  if (scenario.simulativeSteps.length === 0) return 100
  if (!stepOrder || stepOrder.length === 0) return 0

  let orderScore = 0
  const canonicalSteps = scenario.simulativeSteps.map((s) => s.id)

  // 1. Sequence fidelity: check relative order preservation
  for (let i = 0; i < stepOrder.length; i++) {
    const canonicalIndex = canonicalSteps.indexOf(stepOrder[i])
    if (canonicalIndex !== -1) {
      // Bonus if within 1 position of canonical step
      const distance = Math.abs(canonicalIndex - i)
      if (distance === 0) orderScore += 1.0
      else if (distance === 1) orderScore += 0.6
      else orderScore += 0.2
    }
  }
  const sequenceRatio = orderScore / Math.max(1, canonicalSteps.length)

  // 2. Contradiction crucible identification
  const stepsWithContradiction = scenario.simulativeSteps.filter((s) => s.revealedContradiction)
  let contradictionScore = 0
  if (stepsWithContradiction.length > 0) {
    const found = identifiedContradictions.length
    contradictionScore = Math.min(1.0, found / stepsWithContradiction.length)
  } else {
    contradictionScore = 1.0
  }

  // Combine: 60% sequence validity, 40% contradiction exposure
  const combined = sequenceRatio * 60 + contradictionScore * 40
  return Math.max(0, Math.min(100, Math.round(combined)))
}

/**
 * Bridging Analogy Score (BAS in [0, 100])
 * Evaluates understanding of the anchor intuition and intermediate analog.
 */
export function calculateBridgingAnalogyScore(
  scenario: GedankenScenario,
  selectedBridgingId?: string,
  explanation?: string,
): number {
  if (!selectedBridgingId) return 0
  const bridge = scenario.bridgingAnalogies.find((b) => b.id === selectedBridgingId)
  if (!bridge) return 20

  let score = 50 // Base points for selecting valid bridging analogy

  const text = (explanation || '').toLowerCase().trim()
  if (text.length >= 20) {
    score += 25
    // Look for conceptual anchor words
    const words = [
      'structure',
      'anchor',
      'symmetry',
      'same',
      'mass',
      'filter',
      'inversion',
      'sieve',
      'erasure',
    ]
    const hasAnchorWord = words.some((w) => text.includes(w))
    if (hasAnchorWord) score += 25
  }

  return Math.min(100, score)
}

/**
 * Model Modification Score (MMS in [0, 100])
 * Evaluates learner's revised canonical explanation resolving initial folk misconceptions.
 */
export function calculateModelModificationScore(
  scenario: GedankenScenario,
  revisedHypothesis?: string,
): number {
  const text = (revisedHypothesis || '').toLowerCase().trim()
  if (text.length < 15) return 0

  let score = 40 // Starting base for formulation

  // Check length & depth
  if (text.length > 60) score += 20

  // Match key domain principles
  const principles = scenario.canonicalResolution.keyPrinciples.map((p) => p.toLowerCase())
  let principleHits = 0
  for (const principle of principles) {
    const tokens = principle.split(/\s+/).filter((t) => t.length > 4)
    if (tokens.some((token) => text.includes(token))) {
      principleHits++
    }
  }

  score += Math.min(40, principleHits * 15)
  return Math.min(100, Math.round(score))
}

/**
 * Composite Model-Based Reasoning Index (MBRI in [0, 100])
 * Harmonic weighted synthesis across the 4 inquiry dimensions.
 */
export function calculateCompositeModelInquiryIndex(
  ecdi: number,
  saf: number,
  bas: number,
  mms: number,
): number {
  // Weights: 25% Extreme Case, 30% Simulative Animation, 25% Bridging Analogy, 20% Model Modification
  const index = ecdi * 0.25 + saf * 0.3 + bas * 0.25 + mms * 0.2
  return Math.round(Math.max(0, Math.min(100, index)))
}

/**
 * Determine Cognitive Maturity Tier based on MBRI
 */
export function determineMaturityTier(mbri: number): {
  tier: ModelMaturityTier
  description: string
} {
  if (mbri >= 85) {
    return {
      tier: 'gedanken_theorist',
      description:
        'Mastery of Gedankenexperiment modeling: fluidly operates extreme boundary conditions, resolves deep structural paradoxes via bridging analogies, and formulates rigorous invariant laws.',
    }
  }
  if (mbri >= 65) {
    return {
      tier: 'perturbation_analyst',
      description:
        'Proficient analytical modeling: systematically stresses variables to asymptotic limits and identifies causal contradictions, requiring minor scaffolding for non-obvious analogical bridges.',
    }
  }
  if (mbri >= 40) {
    return {
      tier: 'qualitative_mechanist',
      description:
        'Emergent mechanistic intuition: traces linear cause-and-effect sequences, but occasionally relies on surface features or struggles to reconcile contradictory deduction branches.',
    }
  }
  return {
    tier: 'folk_intuition',
    description:
      'Intuitive folk conception: relies on unexamined experiential heuristics, vulnerable to correlation fallacies and conflating perceptual cues with causal mechanisms.',
  }
}

// ============================================================================
// 4. Primary Public API Functions
// ============================================================================

/**
 * List all available Gedankenexperiment scenarios
 */
export function listGedankenScenarios(): GedankenScenario[] {
  return GEDANKEN_SCENARIOS
}

/**
 * Get a specific scenario by unique ID
 */
export function getGedankenScenario(id: string): GedankenScenario | undefined {
  return GEDANKEN_SCENARIOS.find((s) => s.id === id)
}

/**
 * Simulate an extreme case perturbation
 */
export function perturbExtremeCase(
  scenarioId: string,
  extremeCaseId: string,
  parameterLimit?: string,
): {
  valid: boolean
  scenarioId: string
  extremeCase?: ExtremeCaseVariable
  asymptoticBehavior: string
  consequence: string
  contradictionRevealed: boolean
} {
  const scenario = getGedankenScenario(scenarioId)
  if (!scenario) {
    return {
      valid: false,
      scenarioId,
      asymptoticBehavior: 'Unknown scenario',
      consequence: 'No scenario found with given ID',
      contradictionRevealed: false,
    }
  }

  const ec = scenario.extremeCases.find((e) => e.id === extremeCaseId)
  if (!ec) {
    return {
      valid: false,
      scenarioId,
      asymptoticBehavior: 'Unknown extreme case variable',
      consequence: 'No variable found with given ID',
      contradictionRevealed: false,
    }
  }

  return {
    valid: true,
    scenarioId,
    extremeCase: ec,
    asymptoticBehavior: `Perturbing ${ec.name} to limit: ${parameterLimit || ec.extremeLimit}`,
    consequence: ec.paradoxicalOutcome,
    contradictionRevealed: true,
  }
}

/**
 * Run mental animation simulation across sequenced steps
 */
export function simulateMentalAnimation(
  scenarioId: string,
  orderedStepIds: string[],
): {
  valid: boolean
  scenarioId: string
  fidelityScore: number
  observations: string[]
  contradictionsExposed: string[]
} {
  const scenario = getGedankenScenario(scenarioId)
  if (!scenario) {
    return {
      valid: false,
      scenarioId,
      fidelityScore: 0,
      observations: [],
      contradictionsExposed: [],
    }
  }

  const observations: string[] = []
  const contradictions: string[] = []

  for (const stepId of orderedStepIds) {
    const step = scenario.simulativeSteps.find((s) => s.id === stepId)
    if (step) {
      observations.push(`Step ${step.stepOrder}: ${step.action} -> ${step.expectedObservation}`)
      if (step.revealedContradiction) {
        contradictions.push(step.revealedContradiction)
      }
    }
  }

  const fidelity = calculateAnimationFidelityScore(scenario, orderedStepIds, contradictions)

  return {
    valid: true,
    scenarioId,
    fidelityScore: fidelity,
    observations,
    contradictionsExposed: contradictions,
  }
}

/**
 * Evaluate an entire model inquiry session
 */
export function evaluateInquirySession(input: InquirySessionInput): InquiryEvaluation {
  const scenario = getGedankenScenario(input.scenarioId) || GEDANKEN_SCENARIOS[0]

  const ecdi = calculateExtremeCaseScore(
    scenario,
    input.selectedExtremeCaseIds ?? [],
    input.extremeCasePredictions ?? {},
  )
  const saf = calculateAnimationFidelityScore(
    scenario,
    input.simulativeStepOrder ?? [],
    input.identifiedContradictions ?? [],
  )
  const bas = calculateBridgingAnalogyScore(
    scenario,
    input.selectedBridgingId,
    input.bridgingExplanation,
  )
  const mms = calculateModelModificationScore(scenario, input.revisedModelHypothesis)
  const mbri = calculateCompositeModelInquiryIndex(ecdi, saf, bas, mms)
  const { tier, description } = determineMaturityTier(mbri)

  // Generate actionable diagnostic feedback
  const strengths: string[] = []
  const blindspots: string[] = []
  const recommendations: string[] = []

  if (ecdi >= 70) {
    strengths.push('Rigorous identification of extreme parameter boundaries and asymptotic limits.')
  } else {
    blindspots.push(
      'Tendency to remain within comfortable mid-range parameter values rather than testing limiting boundary conditions.',
    )
    recommendations.push(
      'Push variables to zero or infinity (m -> 0, v -> c, friction -> 0) to observe if structural relationships hold.',
    )
  }

  if (saf >= 70) {
    strengths.push(
      'Clear step-by-step kinetic animation without skipping intermediate causal links.',
    )
  } else {
    blindspots.push(
      'Premature jumping to conclusions without running the complete mental simulation sequence.',
    )
    recommendations.push(
      'Animate each physical component sequentially: specify action, mechanism, and predicted observation.',
    )
  }

  if (bas >= 70) {
    strengths.push(
      'Skillful mapping between concrete anchored intuition and abstract target domain.',
    )
  } else {
    blindspots.push(
      'Difficulty abstracting the underlying causal structure from superficial perceptual differences.',
    )
    recommendations.push(
      'Construct an intermediate stepping-stone bridge (e.g. two bricks connected by thread) before tackling the full abstraction.',
    )
  }

  if (mms >= 70) {
    strengths.push('Formulated a robust canonical model resolving the discovered contradiction.')
  } else {
    recommendations.push(
      `Incorporate key canonical principles: ${scenario.canonicalResolution.keyPrinciples[0] || 'invariant physical laws'}.`,
    )
  }

  return {
    scenarioId: scenario.id,
    extremeCaseScore: ecdi,
    animationFidelityScore: saf,
    bridgingAnalogyScore: bas,
    modelModificationScore: mms,
    compositeIndex: mbri,
    tier,
    tierDescription: description,
    feedback: { strengths, blindspots, recommendations },
    fsrsCardCount: scenario.fsrsItems.length,
  }
}

/**
 * Generate calibrated FSRS-6 spaced repetition cards
 */
export function generateModelInquiryFsrsDeck(
  scenarioId: string,
  evaluation?: InquiryEvaluation,
): GeneratedFSRSCard[] {
  const scenario = getGedankenScenario(scenarioId) || GEDANKEN_SCENARIOS[0]
  const cards: GeneratedFSRSCard[] = []

  // Base cards from scenario curriculum
  scenario.fsrsItems.forEach((item, idx) => {
    cards.push({
      id: `fsrs_${scenario.id}_${idx + 1}`,
      front: `[Gedankenexperiment: ${scenario.title}]\n\n${item.question}`,
      back: `${item.answer}\n\n*Rationale & Invariant:* ${item.rationale}`,
      tags: ['gedanken', scenario.domain, 'model-inquiry', 'mental-simulation'],
      initialStability: 2.5,
      initialDifficulty: item.difficulty,
    })
  })

  // Dynamic card generated from user evaluation if provided
  if (evaluation && evaluation.tier !== 'gedanken_theorist') {
    cards.push({
      id: `fsrs_${scenario.id}_synthesis_review`,
      front: `[Model Inquiry Synthesis: ${scenario.title}]\n\nWhat was the core contradiction revealed during the Gedankenexperiment, and how did the canonical model resolve it?`,
      back: `**Canonical Resolution:** ${scenario.canonicalResolution.title}\n\n**Mechanism:** ${scenario.canonicalResolution.mechanism}\n\n**Key Principles:**\n- ${scenario.canonicalResolution.keyPrinciples.join('\n- ')}`,
      tags: ['gedanken', scenario.domain, 'synthesis', 'fsrs-6'],
      initialStability: 2.0,
      initialDifficulty: 5,
    })
  }

  return cards
}

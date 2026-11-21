/**
 * Learning HUB — Dual-Process Diagnostic & Cognitive Forcing Engine
 *
 * Grounded in the foundational research of:
 * - Daniel Kahneman (2011): "Thinking, Fast and Slow"
 *   Dual-system cognitive architecture: System 1 (fast, autonomous, associative, low-effort)
 *   versus System 2 (slow, deliberative, rule-governed, high-effort).
 * - Keith E. Stanovich & Richard F. West (2000); Keith E. Stanovich (2009, 2011):
 *   "Rationality and the Reflective Mind" (Oxford University Press)
 *   Tripartite model of mind: Autonomous Mind (System 1 heuristics),
 *   Algorithmic Mind (System 2 fluid intelligence, working memory, cognitive decoupling),
 *   and Reflective Mind (System 2 epistemic regulation, rational thinking dispositions, heuristic override).
 * - Pat Croskerry (2002, 2003):
 *   "Achieving Quality in Clinical Decision Making: Cognitive Strategies and Detection of Bias"
 *   "Cognitive Forcing Functions in Clinical Decision Making"
 *   Universal, generic, and specific Cognitive Forcing Functions (CFFs) to prevent premature closure,
 *   anchoring, search satisficing, confirmation bias, and framing effects.
 * - Jonathan St. B. T. Evans (2008):
 *   "Dual-Processing Accounts of Reasoning, Judgment, and Social Cognition"
 *   Default-interventionist paradigm: System 1 generates default responses;
 *   System 2 intervenes only when reflective monitoring detects cognitive conflict.
 */

import { z } from 'zod'
import { CANONICAL_COGNITIVE_BIAS_CATALOG } from './content'

// TD-05: scenario corpora (bias catalog, calibrated diagnostic scenarios) are
// CONTENT, not logic — they live in ./content.ts so engine diffs stay about
// algorithms. Re-exported so every existing import path keeps working (the barrel
// does `export * from` this file).
export { CANONICAL_COGNITIVE_BIAS_CATALOG, CALIBRATED_DIAGNOSTIC_SCENARIOS } from './content'

// -----------------------------------------------------------------------------
// Schemas & Types
// -----------------------------------------------------------------------------

export const MindSystemSchema = z.enum([
  'autonomous_mind', // System 1: heuristic, associative, effortless, rapid
  'algorithmic_mind', // System 2: cognitive decoupling, hypothetical simulation, rule application
  'reflective_mind', // System 2: epistemic vigilance, cognitive override, rationality dispositions
])
export type MindSystem = z.infer<typeof MindSystemSchema>

export const CognitiveBiasTypeSchema = z.enum([
  'premature_closure', // Ceasing diagnostic enquiry once a plausible answer is reached
  'anchoring_adjustment', // Disproportionate reliance on initial presentation data
  'search_satisficing', // Settling on the first acceptable solution found, ignoring superior ones
  'confirmation_bias', // Actively seeking confirmatory cues while ignoring contradictory anomalies
  'availability_heuristic', // Overestimating probability of diagnoses recently seen or emotionally vivid
  'base_rate_neglect', // Ignoring prior statistical frequency in favor of salient descriptive traits
  'framing_effect', // Reaching divergent conclusions based on how data is semantically presented
])
export type CognitiveBiasType = z.infer<typeof CognitiveBiasTypeSchema>

export const CognitiveForcingFunctionTypeSchema = z.enum([
  'universal_pause', // Mandatory 5-second metacognitive timeout: "What else could this be?"
  'differential_divergence', // Generation of at least 3 distinct competing pathophysiological/systemic causes
  'disconfirmation_crucible', // Deliberate search for anomalies that falsify the preferred working hypothesis
  'base_rate_recalibration', // Explicit calculation of Bayes prior vs likelihood ratio
  'devils_advocate_inversion', // Arguing why the leading diagnosis is completely fatal or invalid
])
export type CognitiveForcingFunctionType = z.infer<typeof CognitiveForcingFunctionTypeSchema>

export const DiagnosticHypothesisSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemicMechanism: z.string(),
  priorProbability: z.number().min(0).max(1), // Base rate P(H)
  confirmatoryFeatures: z.array(z.string()),
  contradictoryAnomalies: z.array(z.string()),
  lethalityOrRiskTier: z.enum(['catastrophic', 'critical', 'moderate', 'benign']),
  isTargetOptimalSolution: z.boolean().default(false),
})
export type DiagnosticHypothesis = z.infer<typeof DiagnosticHypothesisSchema>

export const CognitiveForcingStepSchema = z.object({
  id: z.string(),
  type: CognitiveForcingFunctionTypeSchema,
  title: z.string(),
  instruction: z.string(),
  forcingQuestion: z.string(),
  targetBiasMitigated: CognitiveBiasTypeSchema,
  minimumExecutionSeconds: z.number().default(4),
})
export type CognitiveForcingStep = z.infer<typeof CognitiveForcingStepSchema>

export const DiagnosticScenarioSchema = z.object({
  id: z.string(),
  domain: z.enum([
    'emergency_medicine',
    'distributed_systems',
    'macro_finance',
    'gpu_architecture',
  ]),
  title: z.string(),
  leadPresenterNarrative: z.string(),
  initialSalientData: z.array(z.string()),
  vividHeuristicTrapDescription: z.string(),
  defaultSystem1DiagnosisId: z.string(),
  subtleAnomalies: z.array(z.string()),
  hypotheses: z.array(DiagnosticHypothesisSchema),
  cognitiveForcingSteps: z.array(CognitiveForcingStepSchema),
  authoritativeResolution: z.string(),
  epistemicTakeaway: z.string(),
})
export type DiagnosticScenario = z.infer<typeof DiagnosticScenarioSchema>

export const DualProcessSessionMetricsSchema = z.object({
  scenarioId: z.string(),
  system1InitialDiagnosisId: z.string(),
  system1DecisionLatencyMs: z.number(),
  system1InitialConfidence: z.number().min(0).max(1),
  completedForcingStepIds: z.array(z.string()),
  discoveredAnomalies: z.array(z.string()),
  system2FinalDiagnosisId: z.string(),
  system2FinalConfidence: z.number().min(0).max(1),
  reflectiveOverrideOccurred: z.boolean(),
  cognitiveDecouplingScore: z.number().min(0).max(1),
  biasVulnerabilityScore: z.number().min(0).max(1),
  reflectiveMindIndex: z.number().min(0).max(1),
  diagnosticAccuracyAchieved: z.boolean(),
})
export type DualProcessSessionMetrics = z.infer<typeof DualProcessSessionMetricsSchema>

export interface FSRSDebiasingCard {
  id: string
  scenarioDomain: string
  biasType: CognitiveBiasType
  forcingType: CognitiveForcingFunctionType
  question: string
  answer: string
  cognitiveMechanism: string
  croskerryRule: string
  heuristicTrapExample: string
}

// -----------------------------------------------------------------------------
// Bias Taxonomy Catalog & Cognitive Forcing Function Rules
// -----------------------------------------------------------------------------

export interface BiasCatalogEntry {
  type: CognitiveBiasType
  label: string
  definition: string
  classicManifestation: string
  croskerryAntidote: string
  primaryCFF: CognitiveForcingFunctionType
}

// Catalog moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// at the top of this file so import paths are unchanged.

// -----------------------------------------------------------------------------
// Calibrated Diagnostic Scenarios (Medicine, Systems, Finance, GPU)
// -----------------------------------------------------------------------------

// Scenario corpus moved verbatim to ./content.ts (TD-05 — content, not logic);
// re-exported at the top of this file so import paths are unchanged.

// -----------------------------------------------------------------------------
// Computational Heuristics & Scoring Functions
// -----------------------------------------------------------------------------

/**
 * Calculates Stanovich's Cognitive Decoupling score.
 * Cognitive decoupling is the algorithmic mind's ability to maintain a secondary
 * counterfactual mental model detached from default primary representations.
 */
export function calculateCognitiveDecouplingScore(params: {
  hypothesesConsideredCount: number
  anomaliesDiscoveredCount: number
  forcingStepsCompletedCount: number
  totalForcingStepsCount: number
}): number {
  const hypFactor = Math.min(1.0, params.hypothesesConsideredCount / 3.0)
  const anomFactor = Math.min(1.0, params.anomaliesDiscoveredCount / 3.0)
  const forcingFactor =
    params.totalForcingStepsCount > 0
      ? params.forcingStepsCompletedCount / params.totalForcingStepsCount
      : 0

  const decoupling = 0.35 * hypFactor + 0.35 * anomFactor + 0.3 * forcingFactor
  return Number(Math.max(0, Math.min(1, decoupling)).toFixed(3))
}

/**
 * Calculates Croskerry's Cognitive Bias Vulnerability score.
 * Decreases as the user executes Cognitive Forcing Functions (CFFs) and confronts anomalies.
 */
export function calculateBiasVulnerabilityScore(params: {
  initialDecisionLatencyMs: number
  forcingStepsCompletedCount: number
  totalForcingStepsCount: number
  anomaliesDiscoveredCount: number
  totalAnomaliesCount: number
}): number {
  // Fast snap judgements (< 3 seconds) dramatically inflate bias vulnerability
  const snapPenalty = params.initialDecisionLatencyMs < 3000 ? 0.35 : 0.05

  const forcingCoverage =
    params.totalForcingStepsCount > 0
      ? params.forcingStepsCompletedCount / params.totalForcingStepsCount
      : 0
  const anomalyCoverage =
    params.totalAnomaliesCount > 0
      ? params.anomaliesDiscoveredCount / params.totalAnomaliesCount
      : 0

  // Bias vulnerability starts high and is dismantled by CFF completion
  const rawVulnerability = 1.0 + snapPenalty - (0.55 * forcingCoverage + 0.4 * anomalyCoverage)
  return Number(Math.max(0.05, Math.min(1.0, rawVulnerability)).toFixed(3))
}

/**
 * Calculates the Stanovich Reflective Mind Index.
 *
 * R_index = w1 * Decoupling + w2 * (1 - Vulnerability) + w3 * ReflectiveOverrideBonus + w4 * Calibration
 */
export function calculateReflectiveMindIndex(params: {
  cognitiveDecouplingScore: number
  biasVulnerabilityScore: number
  reflectiveOverrideOccurred: boolean
  diagnosticAccuracyAchieved: boolean
}): number {
  const decoupling = params.cognitiveDecouplingScore
  const biasResistance = 1.0 - params.biasVulnerabilityScore
  const overrideBonus = params.reflectiveOverrideOccurred ? 1.0 : 0.2
  const accuracyScore = params.diagnosticAccuracyAchieved ? 1.0 : 0.3

  const reflectiveIndex =
    0.3 * decoupling + 0.3 * biasResistance + 0.2 * overrideBonus + 0.2 * accuracyScore

  return Number(Math.max(0, Math.min(1, reflectiveIndex)).toFixed(3))
}

export type ReflectiveMindTier =
  | 'heuristic_impulsive' // System 1 dominated, vulnerable to closure & anchors
  | 'algorithmic_novice' // System 2 active, but lacks structured forcing functions
  | 'reflective_calibrator' // System 2 actively decoupling and auditing biases
  | 'master_diagnostician' // Exceptional Stanovich reflective mind & Croskerry forcing execution

export function evaluateReflectiveMindTier(reflectiveIndex: number): ReflectiveMindTier {
  if (reflectiveIndex >= 0.85) return 'master_diagnostician'
  if (reflectiveIndex >= 0.65) return 'reflective_calibrator'
  if (reflectiveIndex >= 0.4) return 'algorithmic_novice'
  return 'heuristic_impulsive'
}

// -----------------------------------------------------------------------------
// FSRS-6 Debiasing Card Generator
// -----------------------------------------------------------------------------

/**
 * Generates high-yield FSRS-6 debiasing cards bridging Croskerry's Cognitive Forcing
 * Functions to spaced repetition retention.
 */
export function generateFSRSDebiasingDeck(scenario: DiagnosticScenario): FSRSDebiasingCard[] {
  const cards: FSRSDebiasingCard[] = []

  // 1. General Cognitive Forcing Rules for this scenario
  scenario.cognitiveForcingSteps.forEach((step, index) => {
    const bias = CANONICAL_COGNITIVE_BIAS_CATALOG[step.targetBiasMitigated]
    cards.push({
      id: `${scenario.id}_debiasing_cff_${index + 1}`,
      scenarioDomain: scenario.domain,
      biasType: step.targetBiasMitigated,
      forcingType: step.type,
      question: `[${scenario.title}] In diagnostic dilemma "${scenario.title}", what Cognitive Forcing Function (CFF) counteracts ${bias.label}?`,
      answer: `Implement ${step.title}: "${step.instruction}"\n\nForcing Question to demand: "${step.forcingQuestion}"`,
      cognitiveMechanism: `Stanovich Reflective Override: Intercepts autonomous System 1 heuristics (${bias.label}) by decoupling working memory to audit counterfactual hypotheses.`,
      croskerryRule: bias.croskerryAntidote,
      heuristicTrapExample: scenario.vividHeuristicTrapDescription,
    })
  })

  // 2. Falsification & Anomaly Cards
  scenario.subtleAnomalies.forEach((anomaly, index) => {
    cards.push({
      id: `${scenario.id}_anomaly_card_${index + 1}`,
      scenarioDomain: scenario.domain,
      biasType: 'confirmation_bias',
      forcingType: 'disconfirmation_crucible',
      question: `[${scenario.title}] What key anomaly falsifies the default heuristic hypothesis ("${scenario.defaultSystem1DiagnosisId}")?`,
      answer: `Anomaly ${index + 1}: ${anomaly}\n\nAuthoritative Resolution: ${scenario.authoritativeResolution}`,
      cognitiveMechanism:
        'Popperian Falsification: Disconfirming anomalies are given zero weight by default System 1, requiring active deliberate retrieval.',
      croskerryRule:
        'Actively seek the anomaly that invalidates the working diagnosis before writing orders.',
      heuristicTrapExample: scenario.vividHeuristicTrapDescription,
    })
  })

  return cards
}

/**
 * Learning HUB — Conceptual Change & Ontological Category Shift Engine
 *
 * Grounded in the foundational research of:
 * - Michelene T. H. Chi (1992, 2008, 2013):
 *   "Conceptual Change and Learning in Science" & "Two Kinds of Conceptual Change"
 *   Models robust science misconceptions not as factual gaps, but as ontological misattributions:
 *   assigning emergent processes (e.g. natural selection, diffusion, heat, electric current)
 *   to Direct-Process or Matter-Entity ontological branches rather than Emergent-System branches.
 * - Stella Vosniadou (1994, 2002):
 *   "Mental Models of the Earth: A study of conceptual change in childhood" & "Framework Theory"
 *   Explains the emergence of Synthetic Mental Models (flawed compromises) when naive presuppositions
 *   are forced to assimilate counter-intuitive scientific facts without ontological restructuring.
 * - Andrea diSessa (1988, 1993):
 *   "Toward an Epistemology of Physics" & "Knowledge in Pieces (KiP)"
 *   Phenomenological primitives (p-prims) like "Ohm's p-prim" (effort vs resistance), "dying away",
 *   and "closer means stronger" that learners intuitively activate to explain phenomena.
 * - George J. Posner, Kenneth A. Strike, Peter W. Hewson & William A. Gertzog (1982):
 *   "Accommodation of a Scientific Conception: Toward a Theory of Conceptual Change"
 *   The 4 prerequisite conditions for conceptual accommodation:
 *   1. Dissatisfaction with existing conception
 *   2. Intelligibility of new conception
 *   3. Plausibility of new conception
 *   4. Fruitfulness of new conception
 */

import { z } from 'zod'
import { CANONICAL_ATTRIBUTE_CATALOG } from './content'

// TD-05: scenario corpora (canonical attribute catalog, p-prim catalog, calibrated
// misconception scenarios) are CONTENT, not logic — they live in ./content.ts so
// engine diffs stay about algorithms. Re-exported so every existing import path
// keeps working (the barrel does `export * from` this file).
export {
  CANONICAL_ATTRIBUTE_CATALOG,
  CANONICAL_PPRIM_CATALOG,
  CALIBRATED_MISCONCEPTION_SCENARIOS,
} from './content'

// -----------------------------------------------------------------------------
// Schemas & Types
// -----------------------------------------------------------------------------

export const OntologicalBranchSchema = z.enum([
  'matter_entity', // Physical substance, fluid, material object, localized matter
  'direct_process', // Agent-driven, intentional, centralized, sequential, proportional
  'emergent_process', // Decentralized, simultaneous, uniform components, statistical aggregation
])
export type OntologicalBranch = z.infer<typeof OntologicalBranchSchema>

export const ProcessAttributeCategorySchema = z.enum([
  'agency', // Distinct agent vs Disjoint components
  'intentionality', // Goal-directed / teleological vs Stochastic interactions
  'control', // Centralized master controller vs Decentralized local rules
  'temporality', // Sequential pipeline stages vs Simultaneous parallel execution
  'hierarchy', // Unequal status (actor vs acted-upon) vs Uniform status components
  'causation', // Proportional direct cause vs Non-linear macroscopic aggregate pattern
])
export type ProcessAttributeCategory = z.infer<typeof ProcessAttributeCategorySchema>

export const ProcessAttributeSchema = z.enum([
  // Direct Process Attributes (Chi 2013)
  'distinct_agent',
  'intentional_purpose',
  'centralized_control',
  'sequential_stages',
  'unequal_status',
  'proportional_effect',

  // Emergent Process Attributes (Chi 2013)
  'disjoint_components',
  'random_interactions',
  'decentralized_control',
  'simultaneous_execution',
  'uniform_status',
  'aggregate_pattern',
])
export type ProcessAttribute = z.infer<typeof ProcessAttributeSchema>

export const PhenomenologicalPrimitiveSchema = z.enum([
  'ohms_effort_resistance', // More effort -> more effect; more resistance -> less effect
  'dying_away', // Inherent decay; motion or energy naturally exhausts itself
  'closer_means_stronger', // Proximity to source amplifies effect (e.g. heat, gravity, signal)
  'overcoming', // A larger force overpowers a smaller threshold
  'force_as_mover', // Continuous force is necessary to sustain continuous motion
  'balance_equilibrium', // Equal opposing forces produce static neutrality
])
export type PhenomenologicalPrimitive = z.infer<typeof PhenomenologicalPrimitiveSchema>

export const PosnerConditionsSchema = z.object({
  dissatisfaction: z.number().min(0).max(1), // D: Dissatisfaction with naive conception
  intelligibility: z.number().min(0).max(1), // I: Intelligibility of the emergent conception
  plausibility: z.number().min(0).max(1), // P: Plausibility of the emergent mechanism
  fruitfulness: z.number().min(0).max(1), // F: Fruitfulness in explaining novel anomalies
})
export type PosnerConditions = z.infer<typeof PosnerConditionsSchema>

export const MentalModelStageSchema = z.enum([
  'initial_naive_model', // Grounded in everyday sensorimotor intuitions & direct causation
  'synthetic_compromise_model', // Vosniadou synthetic hybrid: assimilating facts without restructuring
  'scientific_emergent_model', // Full Chi ontological shift to decentralized emergence
])
export type MentalModelStage = z.infer<typeof MentalModelStageSchema>

export const AttributeContrastPairSchema = z.object({
  dimension: ProcessAttributeCategorySchema,
  directAttribute: ProcessAttributeSchema,
  directDescription: z.string(),
  emergentAttribute: ProcessAttributeSchema,
  emergentDescription: z.string(),
})
export type AttributeContrastPair = z.infer<typeof AttributeContrastPairSchema>

export const ConceptualMisconceptionScenarioSchema = z.object({
  id: z.string(),
  domain: z.enum([
    'evolutionary_bio',
    'thermodynamics',
    'electromagnetism',
    'cellular_biophysics',
    'microeconomics',
  ]),
  title: z.string(),
  phenomenon: z.string(),
  naiveBeliefStatement: z.string(),
  naiveOntologicalBranch: OntologicalBranchSchema,
  dominantPPrim: PhenomenologicalPrimitiveSchema,
  syntheticModelCompromise: z.string(),
  scientificEmergentExplanation: z.string(),
  targetOntologicalBranch: OntologicalBranchSchema,
  attributeContrasts: z.array(AttributeContrastPairSchema),
  refutationalAnomalies: z.array(z.string()),
  emergenceMechanismSummary: z.string(),
})
export type ConceptualMisconceptionScenario = z.infer<typeof ConceptualMisconceptionScenarioSchema>

export const OntologicalDiagnosisResultSchema = z.object({
  scenarioId: z.string(),
  learnerBranch: OntologicalBranchSchema,
  targetBranch: OntologicalBranchSchema,
  isOntologicalMismatch: z.boolean(),
  discrepancyGap: z.number().min(0).max(1),
  detectedPPrim: PhenomenologicalPrimitiveSchema,
  mentalModelStage: MentalModelStageSchema,
  posnerAccommodationIndex: z.number().min(0).max(1),
  syntheticCompromiseRisk: z.number().min(0).max(1),
  conceptualShiftReadiness: z.number().min(0).max(1),
})
export type OntologicalDiagnosisResult = z.infer<typeof OntologicalDiagnosisResultSchema>

export interface FSRSConceptualShiftCard {
  id: string
  scenarioDomain: string
  attributeDimension: ProcessAttributeCategory
  prompt: string
  naiveTrap: string
  answer: string
  ontologicalShiftRule: string
  posnerMechanism: string
}

// -----------------------------------------------------------------------------
// Attribute Catalog & Definitions
// -----------------------------------------------------------------------------

export interface AttributeEntry {
  attribute: ProcessAttribute
  category: ProcessAttributeCategory
  branch: OntologicalBranch
  label: string
  definition: string
  cognitiveIndicator: string
}

// Catalog moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// at the top of this file so import paths are unchanged.

// -----------------------------------------------------------------------------
// Phenomenological Primitives Catalog (diSessa 1993)
// -----------------------------------------------------------------------------

export interface PPrimEntry {
  id: PhenomenologicalPrimitive
  name: string
  heuristicRule: string
  naiveApplication: string
  scientificRecontextualization: string
}

// Catalog moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// at the top of this file so import paths are unchanged.

// -----------------------------------------------------------------------------
// Calibrated Misconception Scenarios
// -----------------------------------------------------------------------------

// Scenario corpus moved verbatim to ./content.ts (TD-05 — content, not logic);
// re-exported at the top of this file so import paths are unchanged.

// -----------------------------------------------------------------------------
// Computational Diagnostic & Accommodation Functions
// -----------------------------------------------------------------------------

/**
 * Calculates the Ontological Discrepancy Gap between a learner's attributed process
 * attributes and the scientific target attributes.
 *
 * Gap = (Number of Direct Attributes Chosen) / (Total Attributes Evaluated)
 */
export function calculateOntologicalDiscrepancyGap(params: {
  selectedAttributes: ProcessAttribute[]
  scenario: ConceptualMisconceptionScenario
}): number {
  const { selectedAttributes } = params
  if (selectedAttributes.length === 0) return 0.5

  const directAttributes = selectedAttributes.filter(
    (attr) => CANONICAL_ATTRIBUTE_CATALOG[attr].branch === 'direct_process',
  )

  const gap = directAttributes.length / selectedAttributes.length
  return Number(gap.toFixed(3))
}

/**
 * Evaluates the Posner Accommodation Index based on the 4 prerequisite conditions:
 * Dissatisfaction (D), Intelligibility (I), Plausibility (P), Fruitfulness (F).
 *
 * Accommodation Index = 0.35 * D + 0.25 * I + 0.25 * P + 0.15 * F
 */
export function evaluatePosnerAccommodationIndex(conditions: PosnerConditions): number {
  const { dissatisfaction, intelligibility, plausibility, fruitfulness } = conditions

  const index =
    0.35 * dissatisfaction + 0.25 * intelligibility + 0.25 * plausibility + 0.15 * fruitfulness

  return Number(Math.max(0, Math.min(1, index)).toFixed(3))
}

/**
 * Detects the risk of a Vosniadou Synthetic Model compromise.
 * High risk occurs when Intelligibility is high but Dissatisfaction is low,
 * prompting the learner to hybridize naive presuppositions with scientific terms.
 */
export function detectSyntheticCompromiseRisk(params: {
  discrepancyGap: number
  posnerConditions: PosnerConditions
}): number {
  const { discrepancyGap, posnerConditions } = params
  const { dissatisfaction, intelligibility } = posnerConditions

  // High risk when learner retains direct attributes but finds emergent concepts intelligible
  // without sufficient dissatisfaction to abandon their naive presuppositions
  const hybridAffinity = intelligibility * (1.0 - dissatisfaction)
  const risk = 0.6 * hybridAffinity + 0.4 * discrepancyGap

  return Number(Math.max(0, Math.min(1, risk)).toFixed(3))
}

/**
 * Calculates overall Conceptual Change Readiness:
 * The likelihood that the learner is prepared for an irreversible Ontological Category Shift.
 *
 * Readiness = 0.50 * PosnerIndex + 0.30 * (1 - DiscrepancyGap) + 0.20 * (1 - SyntheticRisk)
 */
export function calculateConceptualChangeReadiness(params: {
  posnerIndex: number
  discrepancyGap: number
  syntheticRisk: number
}): number {
  const { posnerIndex, discrepancyGap, syntheticRisk } = params

  const readiness = 0.5 * posnerIndex + 0.3 * (1.0 - discrepancyGap) + 0.2 * (1.0 - syntheticRisk)

  return Number(Math.max(0, Math.min(1, readiness)).toFixed(3))
}

export type OntologicalMaturityTier =
  | 'naive_direct_realist' // Entrenched in matter/direct process with high p-prim reliance
  | 'synthetic_hybridizer' // Vosniadou compromise: applying emergent jargon to direct agents
  | 'transitional_accommodator' // High dissatisfaction, developing emergent schemas
  | 'emergent_ontologist' // Fully restructured ontological schema with zero teleological bias

export function evaluateOntologicalMaturityTier(readiness: number): OntologicalMaturityTier {
  if (readiness >= 0.8) return 'emergent_ontologist'
  if (readiness >= 0.6) return 'transitional_accommodator'
  if (readiness >= 0.4) return 'synthetic_hybridizer'
  return 'naive_direct_realist'
}

// -----------------------------------------------------------------------------
// FSRS-6 Conceptual Shift Flashcard Generator
// -----------------------------------------------------------------------------

/**
 * Generates spaced repetition flashcards specifically engineered to contrast
 * Direct Process misconceptions with Emergent Process realities (Chi 2013).
 */
export function generateFSRSConceptualShiftCards(
  scenario: ConceptualMisconceptionScenario,
  _diagnosis: OntologicalDiagnosisResult,
): FSRSConceptualShiftCard[] {
  const cards: FSRSConceptualShiftCard[] = []

  scenario.attributeContrasts.forEach((pair, idx) => {
    const directMeta = CANONICAL_ATTRIBUTE_CATALOG[pair.directAttribute]
    const emergentMeta = CANONICAL_ATTRIBUTE_CATALOG[pair.emergentAttribute]

    cards.push({
      id: `${scenario.id}_shift_card_${idx + 1}`,
      scenarioDomain: scenario.domain,
      attributeDimension: pair.dimension,
      prompt: `[${scenario.title}] In terms of ${pair.dimension.toUpperCase()}, why is this phenomenon NOT a "${directMeta.label}"?`,
      naiveTrap: `Naive Intuition (${directMeta.label}): ${pair.directDescription}`,
      answer: `Ontological Category Shift:\nThis is an EMERGENT PROCESS characterized by "${emergentMeta.label}".\n\nMechanism:\n${pair.emergentDescription}\n\nRefutation of Direct Model:\n${scenario.refutationalAnomalies[0]}`,
      ontologicalShiftRule: `Chi Ontological Contrast: Shift from [Direct: ${directMeta.label}] to [Emergent: ${emergentMeta.label}].`,
      posnerMechanism: `Posner Accommodation: Resolves dissatisfaction with ${scenario.dominantPPrim} through decentralized emergence.`,
    })
  })

  return cards
}

/**
 * @file packages/core/src/inquiry/inquiry-engine.ts
 * @description Dual-Space Scientific Discovery & Inquiry Simulation Engine.
 *
 * Implements rigorous cognitive science frameworks:
 * - David Klahr & Kevin Dunbar (1988) Scientific Discovery as Dual Search (SDDS):
 *   Coordination between Hypothesis Space Search and Experiment Space Search.
 * - Zhe Chen & David Klahr (1999) Control of Variables Strategy (VOTAT: Vary One Thing At A Time).
 * - Clark A. Chinn & William F. Brewer (1993) 8-Category Taxonomy of Learner Responses
 *   to Anomalous Data in Science Education.
 * - Ton de Jong & Wouter van Joolingen (1998) Scientific Discovery Learning with Computer Simulations.
 * - Barbara White & John Frederiksen (1998) Inquiry Cycles (Question -> Predict -> Experiment -> Model -> Apply).
 * - Peter Wason (1960) & Klayman & Ha (1987) Confirmation Bias & Positive Test Strategy dynamics.
 *
 * Grounded in strict Zod validation, multi-platform runtime neutrality,
 * and calibrated FSRS-6 review scheduling.
 */

import { z } from 'zod'

// TD-05: the canonical inquiry laboratory suite is CONTENT, not logic — it lives in
// ./content.ts so engine diffs stay about algorithms. Imported here for the accessors
// below; the constant itself stays module-private in this engine (its public surface
// remains the accessor functions), so no re-export is added.
import { CANONICAL_INQUIRY_LABS } from './content'

/* ==========================================================================
 * ZOD SCHEMAS & ENUMS
 * ========================================================================== */

/**
 * Chinn & Brewer (1993) 7-Category Taxonomy of Reactions to Anomalous Data.
 */
export const AnomalousDataReactionEnum = z.enum([
  'ignore', // Completely overlooks contradictory data
  'reject', // Claims experimental error or invalid instrument
  'exclude', // Treats as outside the domain or special boundary quirk
  'hold_in_abeyance', // Acknowledges conflict but defers resolution
  'reinterpretation', // Distorts empirical reading to preserve prior hypothesis
  'peripheral_change', // Modifies minor auxiliary detail without revising core causal invariant
  'theory_revision', // Authentic conceptual accommodation and schema restructuring
])
export type AnomalousDataReaction = z.infer<typeof AnomalousDataReactionEnum>

/**
 * Inquiry Mastery Performance Band.
 */
export const InquiryMasteryBandEnum = z.enum([
  'Master Empirical Scientist', // SDI >= 85: Strict VOTAT, Popperian falsification, authentic accommodation
  'Methodical Investigator', // 70 <= SDI < 85: Sound variable control, moderate confirmation bias
  'Emerging Experimenter', // 50 <= SDI < 70: Occasional confounders, partial variable isolation
  'Unsystematic Explorer', // SDI < 50: Multi-variable confounding, uncritical confirmation bias
])
export type InquiryMasteryBand = z.infer<typeof InquiryMasteryBandEnum>

/**
 * Single independent or environmental simulation variable.
 */
export const InquiryVariableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1),
  unit: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  defaultValue: z.number(),
  isCausallyActive: z.boolean(), // Does this variable actually alter the primary dependent outcome?
  description: z.string().min(1),
})
export type InquiryVariable = z.infer<typeof InquiryVariableSchema>

/**
 * Dependent variable produced by the simulation model.
 */
export const InquiryOutputMetricSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1),
  unit: z.string(),
  description: z.string().min(1),
})
export type InquiryOutputMetric = z.infer<typeof InquiryOutputMetricSchema>

/**
 * Single experimental trial submission.
 */
export const InquiryTrialInputSchema = z.object({
  trialIndex: z.number().int().nonnegative(),
  variableSettings: z.record(z.string(), z.number()),
  hypothesisRationale: z.string().optional(),
  isFalsificationProbe: z.boolean().default(false), // Explicitly intended to stress-test/refute hypothesis
})
export type InquiryTrialInput = z.infer<typeof InquiryTrialInputSchema>

/**
 * Result of executing an experimental trial through the laboratory simulation.
 */
export const InquiryTrialResultSchema = z.object({
  trialIndex: z.number().int().nonnegative(),
  variableSettings: z.record(z.string(), z.number()),
  observedOutputs: z.record(z.string(), z.number()),
  votatCompliantWithPrevious: z.boolean(), // True if strictly one variable varied relative to prior trial
  variedVariableIds: z.array(z.string()),
  confoundingVariableIds: z.array(z.string()),
})
export type InquiryTrialResult = z.infer<typeof InquiryTrialResultSchema>

/**
 * Student engagement with an anomalous observation.
 */
export const AnomalousDataSubmissionSchema = z.object({
  anomalyId: z.string().min(1),
  reaction: AnomalousDataReactionEnum,
  articulatedExplanation: z.string().min(1),
})
export type AnomalousDataSubmission = z.infer<typeof AnomalousDataSubmissionSchema>

/**
 * Specification of an anomalous data encounter seeded into the lab.
 */
export const AnomalousScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  triggerCondition: z.string().min(1),
  counterEvidenceObservation: z.string().min(1),
  naiveMisconceptionRefuted: z.string().min(1),
  canonicalExplanation: z.string().min(1),
})
export type AnomalousScenario = z.infer<typeof AnomalousScenarioSchema>

/**
 * Canonical Inquiry Laboratory Suite.
 */
export const InquiryLabSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  subtitle: z.string().min(1),
  researchQuestion: z.string().min(1),
  theoreticalPremise: z.string().min(1),
  canonicalInvariantLaw: z.string().min(1),
  independentVariables: z.array(InquiryVariableSchema).min(3),
  dependentOutputs: z.array(InquiryOutputMetricSchema).min(1),
  anomalousScenarios: z.array(AnomalousScenarioSchema).min(1),
  seedCards: z.array(
    z.object({
      front: z.string().min(1),
      back: z.string().min(1),
      targetFactor: z.string().min(1),
      cardDepth: z.enum(['variable_control', 'anomalous_data', 'causal_invariant']),
    }),
  ),
})
export type InquiryLab = z.infer<typeof InquiryLabSchema>

/**
 * Comprehensive Quantitative Metrics grounded in SDDS and VOTAT.
 */
export const InquiryMetricsSchema = z.object({
  votatRigorIndex: z.number().min(0).max(1), // VRI: Fraction of paired trials strictly following VOTAT
  confirmationBiasIndex: z.number().min(0).max(1), // CBI: Ratio of positive tests to falsification attempts
  anomalousDataResolutionIndex: z.number().min(0).max(100), // ADRI: Epistemic maturity weighting (Chinn & Brewer)
  hypothesisEvidenceAlignmentScore: z.number().min(0).max(100), // HEAS: Empirical validity of final model
  scientificDiscoveryIndex: z.number().min(0).max(100), // Composite SDI score
  inquiryMasteryBand: InquiryMasteryBandEnum,
  sddsSearchEfficiencyRatio: z.number().min(0).max(1), // Pruning efficiency in hypothesis-experiment spaces
  qualitativeDiagnostic: z.string().min(1),
  pedagogicalAdvice: z.string().min(1),
})
export type InquiryMetrics = z.infer<typeof InquiryMetricsSchema>

/* ==========================================================================
 * CANONICAL INQUIRY LABORATORIES — corpus moved verbatim to ./content.ts
 * (TD-05 — content, not logic); imported above for the accessors below.
 * ========================================================================== */

/* ==========================================================================
 * ACCESSORS & SIMULATION KERNEL
 * ========================================================================== */

export function getCanonicalInquiryLabs(): InquiryLab[] {
  return CANONICAL_INQUIRY_LABS
}

export function getInquiryLabById(id: string): InquiryLab | undefined {
  return CANONICAL_INQUIRY_LABS.find((l) => l.id === id)
}

/**
 * Executes a deterministic physical/biological/economic simulation run.
 */
export function runInquiryTrial(
  lab: InquiryLab,
  trialIndex: number,
  variableSettings: Record<string, number>,
  previousSettings?: Record<string, number>,
): InquiryTrialResult {
  const observedOutputs: Record<string, number> = {}

  if (lab.id === 'lab-pendulum-period') {
    const L = variableSettings.length ?? 1.0
    const g = variableSettings.gravity ?? 9.81
    const thetaDeg = variableSettings.angle ?? 15
    const thetaRad = (thetaDeg * Math.PI) / 180
    // Small angle approx + second order correction
    const baseT = 2 * Math.PI * Math.sqrt(L / g)
    const T = baseT * (1 + (1 / 16) * thetaRad * thetaRad)
    observedOutputs.period = Math.round(T * 1000) / 1000
    observedOutputs.frequency = Math.round((1 / T) * 1000) / 1000
  } else if (lab.id === 'lab-enzyme-kinetics') {
    const S = variableSettings.substrate ?? 10
    const T = variableSettings.temperature ?? 37
    const ph = variableSettings.ph ?? 7.4
    const I = variableSettings.inhibitor ?? 0

    // Thermal denaturation fraction
    let integrity = 1.0
    if (T > 42) {
      integrity = Math.max(0, 1.0 - Math.pow((T - 42) / 25, 2))
    }
    // pH bell curve centered at 7.4
    const phFactor = Math.exp(-Math.pow(ph - 7.4, 2) / 3.0)
    // Arrhenius kinetic multiplier up to denaturation
    const kineticFactor = Math.pow(1.8, (T - 20) / 10)
    const effectiveVmax = 100 * kineticFactor * phFactor * integrity
    const Km = 5 * (1 + I / 2.0)
    const V = (effectiveVmax * S) / (Km + S)

    observedOutputs.velocity = Math.round(V * 10) / 10
    observedOutputs.fractionActive = Math.round(integrity * 100)
  } else if (lab.id === 'lab-photosynthesis-limits') {
    const light = variableSettings.light ?? 300
    const co2 = variableSettings.co2 ?? 400
    const T = variableSettings.temperature ?? 25

    // Michaelis-style curves for individual factors
    const lightLimit = 25 * (light / (200 + light))
    const co2Limit = 30 * (co2 / (150 + co2))
    const tempFactor = Math.max(0, 1.0 - Math.pow((T - 25) / 20, 2))

    // Blackman minimum principle
    const P = Math.min(lightLimit, co2Limit) * tempFactor
    observedOutputs.photosyntheticRate = Math.round(P * 10) / 10
  } else if (lab.id === 'lab-electromagnetic-induction') {
    const v = variableSettings.velocity ?? 1.0
    const N = variableSettings.turns ?? 200
    const B = variableSettings.fieldStrength ?? 0.5
    const mu_r = variableSettings.coreRelativePermeability ?? 1

    // Area A = 0.005 m^2, coil length dx = 0.05 m
    // dPhi/dt = B * A * mu_r * (v / dx)
    const fluxRate = B * 0.005 * (1 + Math.log10(mu_r)) * (v / 0.05)
    const Emf = N * fluxRate

    observedOutputs.peakEmf = Math.round(Emf * 100) / 100
    observedOutputs.fluxRate = Math.round(fluxRate * 1000) / 1000
  } else if (lab.id === 'lab-monetary-qe-trap') {
    const M = variableSettings.moneySupply ?? 5
    let V = variableSettings.velocity ?? 1.8
    const Y = variableSettings.realOutput ?? 10
    const r = variableSettings.policyRate ?? 2.0

    // Liquidity trap: if r near 0, velocity drops inversely with excessive M
    if (r <= 0.5 && M > 6) {
      V = V * (6 / M)
    }
    const nominalGdp = M * V
    const P = nominalGdp / Y

    observedOutputs.priceIndex = Math.round(P * 100) / 100
    observedOutputs.nominalGdp = Math.round(nominalGdp * 100) / 100
  } else {
    // Generic fallback
    observedOutputs.primary = 42
  }

  // VOTAT analysis against previous settings
  let votatCompliantWithPrevious = true
  const variedVariableIds: string[] = []
  const confoundingVariableIds: string[] = []

  if (previousSettings) {
    for (const v of lab.independentVariables) {
      const prevVal = previousSettings[v.id]
      const currVal = variableSettings[v.id]
      if (prevVal !== undefined && currVal !== undefined && prevVal !== currVal) {
        variedVariableIds.push(v.id)
      }
    }
    if (variedVariableIds.length !== 1) {
      votatCompliantWithPrevious = false
      if (variedVariableIds.length > 1) {
        confoundingVariableIds.push(...variedVariableIds)
      }
    }
  }

  return {
    trialIndex,
    variableSettings,
    observedOutputs,
    votatCompliantWithPrevious,
    variedVariableIds,
    confoundingVariableIds,
  }
}

/* ==========================================================================
 * QUANTITATIVE METRICS ENGINE (SDDS, VOTAT, CHINN & BREWER)
 * ========================================================================== */

export interface CalculateInquiryMetricsParams {
  lab: InquiryLab
  trials: InquiryTrialResult[]
  anomalousSubmissions?: AnomalousDataSubmission[]
  falsificationTrialCount?: number
  finalHypothesisCapturesInvariant?: boolean
}

/**
 * Calculates quantitative scientific discovery metrics.
 */
export function calculateInquiryMetrics(params: CalculateInquiryMetricsParams): InquiryMetrics {
  const {
    trials,
    anomalousSubmissions = [],
    falsificationTrialCount = 0,
    finalHypothesisCapturesInvariant = true,
  } = params

  // 1. VOTAT Rigor Index (VRI)
  let votatCompliantPairs = 0
  const totalPairs = Math.max(0, trials.length - 1)

  for (let i = 1; i < trials.length; i++) {
    if (trials[i]!.votatCompliantWithPrevious) {
      votatCompliantPairs++
    }
  }

  const votatRigorIndex =
    totalPairs > 0
      ? Math.round((votatCompliantPairs / totalPairs) * 100) / 100
      : trials.length === 1
        ? 1.0
        : 0.0

  // 2. Confirmation Bias Index (CBI)
  // CBI = positive_tests / max(1, total_tests)
  const totalTrials = Math.max(1, trials.length)
  const falsifications = Math.min(falsificationTrialCount, totalTrials)
  const confirmatoryTrials = totalTrials - falsifications
  const confirmationBiasIndex = Math.round((confirmatoryTrials / totalTrials) * 100) / 100

  // 3. Anomalous Data Resolution Index (ADRI)
  // Chinn & Brewer (1993) weights
  const reactionWeights: Record<AnomalousDataReaction, number> = {
    ignore: 0,
    reject: 10,
    exclude: 25,
    hold_in_abeyance: 40,
    reinterpretation: 55,
    peripheral_change: 75,
    theory_revision: 100,
  }

  let adriScore = 70 // default benchmark
  if (anomalousSubmissions.length > 0) {
    const sum = anomalousSubmissions.reduce(
      (acc, s) => acc + (reactionWeights[s.reaction] ?? 50),
      0,
    )
    adriScore = Math.round(sum / anomalousSubmissions.length)
  }

  // 4. Hypothesis-Evidence Alignment Score (HEAS)
  let heasScore = finalHypothesisCapturesInvariant ? 90 : 40
  // Adjust based on VOTAT validity
  if (votatRigorIndex < 0.5) {
    heasScore = Math.max(20, heasScore - 20)
  }

  // 5. Composite Scientific Discovery Index (SDI)
  // SDI = 0.35 * (VRI*100) + 0.30 * HEAS + 0.20 * ADRI + 0.15 * ((1 - CBI)*100)
  const sdi = Math.round(
    0.35 * (votatRigorIndex * 100) +
      0.3 * heasScore +
      0.2 * adriScore +
      0.15 * ((1 - confirmationBiasIndex) * 100),
  )

  // 6. SDDS Search Efficiency Ratio
  // Efficiency of navigating hypothesis space and experiment space without redundant trials
  const sddsSearchEfficiencyRatio = Math.min(
    1.0,
    Math.round((votatRigorIndex * 0.6 + (adriScore / 100) * 0.4) * 100) / 100,
  )

  // 7. Inquiry Mastery Band
  let inquiryMasteryBand: InquiryMasteryBand
  if (sdi >= 85) {
    inquiryMasteryBand = 'Master Empirical Scientist'
  } else if (sdi >= 70) {
    inquiryMasteryBand = 'Methodical Investigator'
  } else if (sdi >= 50) {
    inquiryMasteryBand = 'Emerging Experimenter'
  } else {
    inquiryMasteryBand = 'Unsystematic Explorer'
  }

  // 8. Qualitative Diagnostic and Pedagogical Advice
  let qualitativeDiagnostic = ''
  let pedagogicalAdvice = ''

  if (sdi >= 85) {
    qualitativeDiagnostic =
      'Exemplary scientific discovery demonstrated. The learner strictly isolated variables via VOTAT (Chen & Klahr 1999), actively sought Popperian falsification conditions, and accommodated anomalous evidence without ad-hoc rationalization.'
    pedagogicalAdvice =
      'Advance to complex multi-variable stochastic dynamical models and nonlinear coupled systems.'
  } else if (sdi >= 70) {
    qualitativeDiagnostic =
      'Strong methodological control. Variable manipulation was largely systematic, though some positive-test confirmation tendencies were observed before addressing boundary conditions.'
    pedagogicalAdvice =
      'Explicitly design experimental trials aimed at breaking current hypotheses before consolidating the causal invariant.'
  } else if (sdi >= 50) {
    qualitativeDiagnostic =
      'Moderate experimental control. Multiple variables were occasionally varied simultaneously, introducing confounding factors that weakened causal inference.'
    pedagogicalAdvice =
      'Ensure exactly ONE independent parameter is altered between consecutive trials (VOTAT rule) to eliminate confounders.'
  } else {
    qualitativeDiagnostic =
      'Unsystematic exploration. High multi-variable confounding and strong confirmation bias hindered identification of true physical invariants.'
    pedagogicalAdvice =
      'Slow down and formulate an explicit hypothesis before each trial. Hold all other baseline parameters constant.'
  }

  return {
    votatRigorIndex,
    confirmationBiasIndex,
    anomalousDataResolutionIndex: adriScore,
    hypothesisEvidenceAlignmentScore: heasScore,
    scientificDiscoveryIndex: sdi,
    inquiryMasteryBand,
    sddsSearchEfficiencyRatio,
    qualitativeDiagnostic,
    pedagogicalAdvice,
  }
}

/* ==========================================================================
 * CALIBRATED FSRS-6 FLASHCARD GENERATOR
 * ========================================================================== */

export interface CalibratedInquiryCard {
  front: string
  back: string
  targetFactor: string
  cardDepth: 'variable_control' | 'anomalous_data' | 'causal_invariant'
  initialStabilityDays: number
  initialDifficulty: number
}

/**
 * Calibrates initial stability and difficulty based on empirical discovery performance.
 */
export function generateInquiryFSRSCards(
  lab: InquiryLab,
  metrics: InquiryMetrics,
): CalibratedInquiryCard[] {
  // Base stability scaled by Scientific Discovery Index (SDI)
  // Higher SDI -> deeper schema integration -> longer initial stability (4 to 12 days)
  const baseStability = Math.round((4.0 + (metrics.scientificDiscoveryIndex / 100) * 8.0) * 10) / 10

  // Difficulty scaled inversely by VOTAT Rigor and Anomalous Data Resolution
  // High VRI & ADRI -> lower initial difficulty (3.0 to 7.0)
  const baseDifficulty =
    Math.round(
      Math.max(2.5, Math.min(8.5, 8.0 - (metrics.scientificDiscoveryIndex / 100) * 5.0)) * 10,
    ) / 10

  return lab.seedCards.map((card) => {
    let cardStability = baseStability
    let cardDifficulty = baseDifficulty

    if (card.cardDepth === 'variable_control') {
      // Scale by VOTAT Rigor
      cardStability = Math.round(baseStability * (0.8 + metrics.votatRigorIndex * 0.4) * 10) / 10
      cardDifficulty =
        Math.round(Math.max(2.0, baseDifficulty - metrics.votatRigorIndex * 1.5) * 10) / 10
    } else if (card.cardDepth === 'anomalous_data') {
      // Scale by Anomalous Data Resolution Index
      const adriNorm = metrics.anomalousDataResolutionIndex / 100
      cardStability = Math.round(baseStability * (0.7 + adriNorm * 0.5) * 10) / 10
      cardDifficulty = Math.round(Math.max(2.5, baseDifficulty - adriNorm * 2.0) * 10) / 10
    }

    return {
      front: card.front,
      back: card.back,
      targetFactor: card.targetFactor,
      cardDepth: card.cardDepth,
      initialStabilityDays: cardStability,
      initialDifficulty: cardDifficulty,
    }
  })
}

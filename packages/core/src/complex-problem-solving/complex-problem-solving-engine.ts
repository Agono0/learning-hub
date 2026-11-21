/**
 * Complex Problem Solving (CPS) & Micro-World Simulation Engine
 *
 * Grounded in:
 * - Dietrich Dörner (1996). The Logic of Failure: Why Things Go Wrong and What We Can Do
 *   to Make Them Right. Metropolitan Books / Henry Holt.
 * - Peter A. Frensch & Joachim Funke (1995). Complex Problem Solving: The European Perspective.
 * - Berndt Brehmer (1992). Dynamic Decision Making: Human Control of Complex Systems.
 * - Jens Rasmussen (1983). Skills, Rules, Knowledge (SRK) Framework in Complex Domains.
 *
 * Key Theoretical Constructs:
 * 1. Micro-World System Dynamics: Polytely (multiple competing goals), Complexity (interconnected
 *    feedback networks), Intransparency (opaque internal states), and Delays (temporal phase lags).
 * 2. Dörner's Failure Pathologies:
 *    - Repair Service Mentality (Reparaturdienst-Verhalten): Surface-level firefighting of symptoms.
 *    - Ballistic Action: Firing policies without monitoring feedback or adapting to drift.
 *    - Thematic Vagabonding: Erratic flitting between unrelated sub-problems under stress.
 *    - Encapsulation: Retreating into trivial sub-tasks while ignoring catastrophic macro-collapse.
 *    - Linear Extrapolation: Neglecting exponential growth curves and delayed cascade tipping points.
 * 3. Quantitative CPS Telemetry:
 *    - Dynamic Control Efficiency (DCE in [0, 100]): Stability within safe operating bounds.
 *    - Side-Effect Anticipation Index (SEAI in [0, 100]): Foresight into 2nd/3rd order consequences.
 *    - Thematic Focus Score (TFS in [0, 100]): Resistance to vagabonding and encapsulation.
 *    - Feedback Monitoring Ratio (FMR in [0, 100]): Depth and regularity of inspection.
 *    - Composite Complex Problem Solving Index (CPSI in [0, 100]).
 *    - 4 Cognitive Control Tiers (ballistic_reactive -> systems_governor).
 * 4. Calibrated FSRS-6 Review Deck Generation.
 */

import { z } from 'zod'

// TD-05: scenario corpora (content, not logic) live in './content'.
import { CANONICAL_CPS_SCENARIOS } from './content'

// ============================================================================
// 1. Zod Schemas & Types
// ============================================================================

export const MicroWorldDomainSchema = z.enum([
  'ecological_management',
  'infrastructure_engineering',
  'public_health',
  'systems_engineering',
  'disaster_response',
])
export type MicroWorldDomain = z.infer<typeof MicroWorldDomainSchema>

export const CognitiveControlTierSchema = z.enum([
  'ballistic_reactive',
  'symptom_firefighter',
  'strategic_coordinator',
  'systems_governor',
])
export type CognitiveControlTier = z.infer<typeof CognitiveControlTierSchema>

export const DornerPathologySchema = z.enum([
  'repair_service_behavior',
  'ballistic_action',
  'thematic_vagabonding',
  'encapsulation',
  'linear_extrapolation',
])
export type DornerPathology = z.infer<typeof DornerPathologySchema>

export const MicroWorldVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  initialValue: z.number(),
  minSafe: z.number(),
  maxSafe: z.number(),
  isObservable: z.boolean(),
  isCritical: z.boolean(),
  description: z.string(),
})
export type MicroWorldVariable = z.infer<typeof MicroWorldVariableSchema>

export const DelayedSideEffectSchema = z.object({
  targetVariableId: z.string(),
  delayPeriods: z.number().int().min(1),
  multiplier: z.number(),
  description: z.string(),
})
export type DelayedSideEffect = z.infer<typeof DelayedSideEffectSchema>

export const PolicyInterventionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  primaryTargetId: z.string(),
  directDelta: z.number(),
  costResource: number(),
  delayedSideEffects: z.array(DelayedSideEffectSchema),
  rationalJustification: z.string(),
  hiddenRisk: z.string(),
  isSustainable: z.boolean().optional(),
})
export type PolicyIntervention = z.infer<typeof PolicyInterventionSchema>

function number() {
  return z.number()
}

export const CPSFSRSCardTemplateSchema = z.object({
  question: z.string(),
  answer: z.string(),
  rationale: z.string(),
  difficulty: z.number().min(1).max(10),
})
export type CPSFSRSCardTemplate = z.infer<typeof CPSFSRSCardTemplateSchema>

export const MicroWorldScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: MicroWorldDomainSchema,
  historicalContext: z.string(),
  coreDilemma: z.string(),
  polytelicGoals: z.array(z.string()),
  variables: z.array(MicroWorldVariableSchema),
  availablePolicies: z.array(PolicyInterventionSchema),
  canonicalFailureMode: z.object({
    pathology: DornerPathologySchema,
    trapDescription: z.string(),
    consequence: z.string(),
    remedyPrinciple: z.string(),
  }),
  fsrsItems: z.array(CPSFSRSCardTemplateSchema),
})
export type MicroWorldScenario = z.infer<typeof MicroWorldScenarioSchema>

export const MicroWorldStateSchema = z.object({
  currentCycle: z.number().int().min(1),
  variableValues: z.record(z.string(), z.number()),
  activeDelays: z.array(
    z.object({
      targetVariableId: z.string(),
      cyclesRemaining: z.number().int(),
      delta: z.number(),
      description: z.string(),
    }),
  ),
  inspectedVariables: z.array(z.string()),
  executedPolicyIds: z.array(z.string()),
  systemCollapsed: z.boolean(),
  collapseReason: z.string().optional(),
})
export type MicroWorldState = z.infer<typeof MicroWorldStateSchema>

export const DecisionCycleInputSchema = z.object({
  scenarioId: z.string(),
  cycleNumber: z.number().int().min(1),
  inspectedVariableIds: z.array(z.string()).default([]),
  selectedPolicyIds: z.array(z.string()).default([]),
  strategicRationale: z.string().optional(),
})
export type DecisionCycleInput = z.infer<typeof DecisionCycleInputSchema>

export const CPSSessionEvaluationSchema = z.object({
  scenarioId: z.string(),
  cyclesCompleted: z.number().int(),
  controlEfficiency: z.number().min(0).max(100),
  sideEffectAnticipation: z.number().min(0).max(100),
  thematicFocus: z.number().min(0).max(100),
  feedbackMonitoring: z.number().min(0).max(100),
  compositeCPSIndex: z.number().min(0).max(100),
  tier: CognitiveControlTierSchema,
  tierDescription: z.string(),
  detectedPathologies: z.array(
    z.object({
      pathology: DornerPathologySchema,
      title: string(),
      evidence: string(),
      mitigation: string(),
    }),
  ),
  fsrsCardCount: z.number().nonnegative(),
})
export type CPSSessionEvaluation = z.infer<typeof CPSSessionEvaluationSchema>

function string() {
  return z.string()
}

export const GeneratedCPSFSRSCardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  tags: z.array(z.string()),
  initialStability: z.number(),
  initialDifficulty: z.number(),
})
export type GeneratedCPSFSRSCard = z.infer<typeof GeneratedCPSFSRSCardSchema>

// ============================================================================
// 2. Canonical Micro-World Scenarios (5 Multidisciplinary Paradigms)
// ============================================================================

// TD-05: the canonical scenario corpora live in './content' (content, not logic).
export { CANONICAL_CPS_SCENARIOS } from './content'

// ============================================================================
// 3. Quantitative Telemetry & Scoring Algorithms
// ============================================================================

/**
 * Dynamic Control Efficiency (DCE in [0, 100])
 * Evaluates how successfully variables remained within safe operating envelopes.
 */
export function calculateDynamicControlEfficiency(
  scenario: MicroWorldScenario,
  finalState: MicroWorldState,
): number {
  if (finalState.systemCollapsed) return 0

  let safeCount = 0
  let totalCount = 0

  for (const v of scenario.variables) {
    const val = finalState.variableValues[v.id] ?? v.initialValue
    totalCount += v.isCritical ? 2 : 1
    if (val >= v.minSafe && val <= v.maxSafe) {
      safeCount += v.isCritical ? 2 : 1
    }
  }

  const ratio = totalCount > 0 ? safeCount / totalCount : 1
  return Math.round(ratio * 100)
}

/**
 * Side-Effect Anticipation Index (SEAI in [0, 100])
 * Evaluates whether policies chosen anticipated second-order consequences.
 */
export function calculateSideEffectAnticipationIndex(
  scenario: MicroWorldScenario,
  executedPolicyIds: string[],
): number {
  if (executedPolicyIds.length === 0) return 50

  let score = 50
  for (const pid of executedPolicyIds) {
    const policy = scenario.availablePolicies.find((p) => p.id === pid)
    if (policy) {
      if (policy.isSustainable) {
        score += 15
      } else if (policy.delayedSideEffects.length > 0) {
        score -= 5
      }
    }
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Thematic Focus Score (TFS in [0, 100])
 * Evaluates consistency of intervention domain, penalizing thematic vagabonding and encapsulation.
 */
export function calculateThematicFocusScore(
  scenario: MicroWorldScenario,
  executedPolicyIds: string[],
): number {
  if (executedPolicyIds.length < 2) return 70

  // Count distinct categories
  const categories = new Set<string>()
  for (const pid of executedPolicyIds) {
    const policy = scenario.availablePolicies.find((p) => p.id === pid)
    if (policy) categories.add(policy.category)
  }

  // If player touched too many disparate categories in few turns -> thematic vagabonding
  if (categories.size > 3 && executedPolicyIds.length <= 4) {
    return 45 // vagabonding penalty
  }

  // If player touched only 1 category while other critical variables were failing -> encapsulation
  if (categories.size === 1 && executedPolicyIds.length >= 3) {
    return 55 // encapsulation penalty
  }

  return 85
}

/**
 * Feedback Monitoring Ratio (FMR in [0, 100])
 * Evaluates how thoroughly observable and non-observable variables were monitored.
 */
export function calculateFeedbackMonitoringRatio(
  scenario: MicroWorldScenario,
  inspectedVariableIds: string[],
): number {
  const observableVars = scenario.variables.filter((v) => v.isObservable)
  if (observableVars.length === 0) return 100
  if (inspectedVariableIds.length === 0) return 20 // ballistic penalty

  const uniqueInspected = new Set(inspectedVariableIds)
  const ratio = uniqueInspected.size / observableVars.length
  return Math.round(Math.min(100, Math.max(20, ratio * 100)))
}

/**
 * Composite Complex Problem Solving Index (CPSI in [0, 100])
 */
export function calculateCompositeCPSIndex(
  dce: number,
  seai: number,
  tfs: number,
  fmr: number,
): number {
  // Weights: 35% DCE, 25% SEAI, 20% TFS, 20% FMR
  const composite = dce * 0.35 + seai * 0.25 + tfs * 0.2 + fmr * 0.2
  return Math.round(Math.max(0, Math.min(100, composite)))
}

/**
 * Determine Cognitive Control Tier based on CPSI
 */
export function determineCognitiveControlTier(cpsi: number): {
  tier: CognitiveControlTier
  description: string
} {
  if (cpsi >= 85) {
    return {
      tier: 'systems_governor',
      description:
        'Mastery of complex problem solving (Dörner 1996): coordinates polytelic trade-offs, anticipates delayed second-order cascades, and maintains steady strategic focus without reactive firefighting.',
    }
  }
  if (cpsi >= 65) {
    return {
      tier: 'strategic_coordinator',
      description:
        'Proficient dynamic control: maintains safe operational limits across most variables and inspects feedback regularly, with occasional vulnerability to delayed non-linear surges.',
    }
  }
  if (cpsi >= 40) {
    return {
      tier: 'symptom_firefighter',
      description:
        'Reactive repair-service mentality: addresses surface emergencies sequentially as isolated crises, vulnerable to thematic vagabonding and leaving delayed side-effects unchecked.',
    }
  }
  return {
    tier: 'ballistic_reactive',
    description:
      'Ballistic action and encapsulation: executes policies without feedback monitoring or retreats into comfortable trivial parameters while critical macro-variables collapse.',
  }
}

// ============================================================================
// 4. Primary Public API Functions
// ============================================================================

/**
 * List all available canonical Micro-World scenarios
 */
export function listMicroWorldScenarios(): MicroWorldScenario[] {
  return CANONICAL_CPS_SCENARIOS
}

/**
 * Get a specific scenario by unique ID
 */
export function getMicroWorldScenario(id: string): MicroWorldScenario | undefined {
  return CANONICAL_CPS_SCENARIOS.find((s) => s.id === id)
}

/**
 * Simulate one decision cycle in the Micro-World
 */
export function simulateMicroWorldStep(
  scenarioId: string,
  currentState: MicroWorldState,
  selectedPolicyIds: string[],
  inspectedVariableIds: string[] = [],
): {
  nextState: MicroWorldState
  stepFeedback: string[]
  collapseWarning?: string
} {
  const scenario = getMicroWorldScenario(scenarioId) || CANONICAL_CPS_SCENARIOS[0]!
  const newValues = { ...currentState.variableValues }
  const stepFeedback: string[] = []
  let collapsed = false
  let collapseReason: string | undefined

  // 1. Resolve pending active delayed effects from earlier cycles
  const remainingDelays: MicroWorldState['activeDelays'] = []
  for (const delay of currentState.activeDelays) {
    if (delay.cyclesRemaining <= 1) {
      const current = newValues[delay.targetVariableId] ?? 0
      newValues[delay.targetVariableId] = Math.round((current + delay.delta) * 10) / 10
      stepFeedback.push(`Delayed cascade matured: ${delay.description}`)
    } else {
      remainingDelays.push({
        ...delay,
        cyclesRemaining: delay.cyclesRemaining - 1,
      })
    }
  }

  // 2. Execute new selected policies
  for (const pid of selectedPolicyIds) {
    const policy = scenario.availablePolicies.find((p) => p.id === pid)
    if (policy) {
      const current = newValues[policy.primaryTargetId] ?? 0
      newValues[policy.primaryTargetId] = Math.round((current + policy.directDelta) * 10) / 10
      stepFeedback.push(
        `Executed ${policy.name}: delta ${policy.directDelta > 0 ? '+' : ''}${policy.directDelta}`,
      )

      // Queue delayed side effects
      for (const se of policy.delayedSideEffects) {
        remainingDelays.push({
          targetVariableId: se.targetVariableId,
          cyclesRemaining: se.delayPeriods,
          delta: Math.round(policy.directDelta * se.multiplier * 10) / 10,
          description: se.description,
        })
      }
    }
  }

  // 3. Autonomous systemic drift & limit checks
  for (const v of scenario.variables) {
    const val = newValues[v.id] ?? v.initialValue
    if (v.isCritical) {
      if (val < v.minSafe || val > v.maxSafe) {
        collapsed = true
        collapseReason = `Critical variable '${v.name}' (${v.id}) breached safe operating envelope (${val} ${v.unit}, safe: ${v.minSafe}-${v.maxSafe}).`
        stepFeedback.push(`CRITICAL COLLAPSE: ${collapseReason}`)
        break
      }
    }
  }

  const nextState: MicroWorldState = {
    currentCycle: currentState.currentCycle + 1,
    variableValues: newValues,
    activeDelays: remainingDelays,
    inspectedVariables: Array.from(
      new Set([...currentState.inspectedVariables, ...inspectedVariableIds]),
    ),
    executedPolicyIds: [...currentState.executedPolicyIds, ...selectedPolicyIds],
    systemCollapsed: collapsed,
    collapseReason,
  }

  return {
    nextState,
    stepFeedback,
    collapseWarning: collapseReason,
  }
}

/**
 * Evaluate a complete multi-cycle Complex Problem Solving session
 */
export function evaluateCPSSession(
  scenarioId: string,
  finalState: MicroWorldState,
): CPSSessionEvaluation {
  const scenario = getMicroWorldScenario(scenarioId) || CANONICAL_CPS_SCENARIOS[0]!

  const dce = calculateDynamicControlEfficiency(scenario, finalState)
  const seai = calculateSideEffectAnticipationIndex(scenario, finalState.executedPolicyIds)
  const tfs = calculateThematicFocusScore(scenario, finalState.executedPolicyIds)
  const fmr = calculateFeedbackMonitoringRatio(scenario, finalState.inspectedVariables)
  const cpsi = calculateCompositeCPSIndex(dce, seai, tfs, fmr)
  const { tier, description } = determineCognitiveControlTier(cpsi)

  // Detect Dörner failure pathologies
  const detectedPathologies: CPSSessionEvaluation['detectedPathologies'] = []

  if (fmr < 50) {
    detectedPathologies.push({
      pathology: 'ballistic_action',
      title: 'Ballistic Action (Fire-and-Forget)',
      evidence: 'Fewer than 50% of observable variables were inspected across decision cycles.',
      mitigation:
        'Regularly monitor system feedback before committing irreversible policy resources.',
    })
  }

  if (tfs < 60 && finalState.executedPolicyIds.length >= 3) {
    detectedPathologies.push({
      pathology: 'thematic_vagabonding',
      title: 'Thematic Vagabonding',
      evidence: 'Scattered interventions across disparate domains without following through.',
      mitigation:
        'Define clear polytelic priorities and maintain strategic focus until stabilizing interventions mature.',
    })
  }

  if (seai < 50) {
    detectedPathologies.push({
      pathology: 'repair_service_behavior',
      title: 'Repair Service Mentality',
      evidence:
        'Repeatedly intervened to fix immediate surface symptoms while ignoring 2nd-order cascades.',
      mitigation: 'Map out delayed feedback loops and address root causal engines.',
    })
  }

  return {
    scenarioId: scenario.id,
    cyclesCompleted: finalState.currentCycle - 1,
    controlEfficiency: dce,
    sideEffectAnticipation: seai,
    thematicFocus: tfs,
    feedbackMonitoring: fmr,
    compositeCPSIndex: cpsi,
    tier,
    tierDescription: description,
    detectedPathologies,
    fsrsCardCount: scenario.fsrsItems.length,
  }
}

/**
 * Generate calibrated FSRS-6 spaced repetition cards
 */
export function generateCPSFSRSDeck(
  scenarioId: string,
  evaluation?: CPSSessionEvaluation,
): GeneratedCPSFSRSCard[] {
  const scenario = getMicroWorldScenario(scenarioId) || CANONICAL_CPS_SCENARIOS[0]!
  const cards: GeneratedCPSFSRSCard[] = []

  // Scenario curriculum cards
  scenario.fsrsItems.forEach((item, idx) => {
    cards.push({
      id: `fsrs_cps_${scenario.id}_${idx + 1}`,
      front: `[Micro-World CPS: ${scenario.title}]\n\n${item.question}`,
      back: `${item.answer}\n\n*Rationale & Invariant:* ${item.rationale}`,
      tags: ['cps', scenario.domain, 'dorner-failure-logic', 'micro-world'],
      initialStability: 2.5,
      initialDifficulty: item.difficulty,
    })
  })

  // Dynamic card for detected pathology
  if (evaluation && evaluation.detectedPathologies.length > 0) {
    const p = evaluation.detectedPathologies[0]!
    cards.push({
      id: `fsrs_cps_${scenario.id}_pathology_review`,
      front: `[Dörner Error Pathology Review: ${p.title}]\n\nWhat is this cognitive trap in complex problem solving and how is it mitigated?`,
      back: `**Trap:** ${p.evidence}\n\n**Mitigation Strategy:** ${p.mitigation}\n\n*Canonical Principle:* ${scenario.canonicalFailureMode.remedyPrinciple}`,
      tags: ['cps', scenario.domain, 'pathology-remediation', 'fsrs-6'],
      initialStability: 2.0,
      initialDifficulty: 6,
    })
  }

  return cards
}

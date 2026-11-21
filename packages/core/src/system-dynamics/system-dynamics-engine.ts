/**
 * System Dynamics & Feedback Loop Modeling Engine
 *
 * Grounded in:
 * - Jay Forrester (1968, 1971). Principles of Systems. MIT Press.
 * - John D. Sterman (2000). Business Dynamics: Systems Thinking and Modeling for a Complex World. McGraw-Hill.
 * - Donella H. Meadows (2008). Thinking in Systems: A Primer. Chelsea Green Publishing.
 * - Linda Booth Sweeney & John Sterman (2000). Bathtub Dynamics: Initial results of a systems thinking inventory.
 * - Peter Senge (1990). The Fifth Discipline: The Art & Practice of The Learning Organization.
 *
 * Features:
 * 1. Stock & Flow Structure Definition:
 *    - Stocks: Accumulations/integrations characterized by memory and inertia.
 *    - Flows: Rates of change that alter stocks over differential time (dStock/dt = Inflows - Outflows).
 *    - Auxiliaries/Parameters: Algebraic combinations, constants, and delay buffers.
 * 2. Causal Loop Diagramming (CLD) & Polarity Analytics:
 *    - Reinforcing Loops (R): Self-reinforcing positive feedback (exponential growth/runaway decay).
 *    - Balancing Loops (B): Goal-seeking negative feedback (stabilization, equilibrium, homeostatic buffering).
 *    - Material and Information Delays: Explicit phase lags that generate overshoot and oscillation.
 * 3. Classic System Archetypes:
 *    - Limits to Growth (R loop encounters B capacity loop)
 *    - Shifting the Burden (Symptomatic quick-fix diverts attention from fundamental solution)
 *    - Tragedy of the Commons (Individual R loops deplete shared finite stock)
 *    - Fixes that Fail (Immediate symptomatic improvement followed by delayed vicious side-effect)
 *    - Eroding Goals (Permitting standards to degrade rather than addressing root cause)
 *    - Escalation (Two parties engage in reciprocal competitive retaliation)
 * 4. Deterministic Euler Numerical Simulation Engine:
 *    - Discrete numerical integration: Stock(t + dt) = Stock(t) + dt * (Inflow - Outflow)
 *    - Trajectory analytics: Peak overshoot, settling time, oscillatory cycles, and asymptotic stability.
 * 5. Quantitative Systems Thinking Telemetry:
 *    - Stock-Flow Discrimination Ratio (SFDR in [0, 100])
 *    - Feedback Loop Identification Accuracy (FLIA in [0, 100])
 *    - Delay Awareness Metric (DAM in [0, 100])
 *    - Archetype Recognition Score (ARS in [0, 100])
 *    - Composite System Dynamics Index (SDI in [0, 100])
 *    - 4 Systems Thinking Maturity Tiers (linear_reductionist -> leverage_strategist)
 * 6. Calibrated FSRS-6 Review Deck Generation:
 *    - Spaced repetition cards anchored to identified leverage points, stock-flow distinctions, and loop polarities.
 */

import { z } from 'zod'

// ============================================================================
// 1. Zod Schemas & Types
// ============================================================================

export const VariableNatureSchema = z.enum(['stock', 'flow', 'auxiliary', 'parameter'])
export type VariableNature = z.infer<typeof VariableNatureSchema>

export const LoopPolaritySchema = z.enum(['reinforcing', 'balancing'])
export type LoopPolarity = z.infer<typeof LoopPolaritySchema>

export const SystemsArchetypeSchema = z.enum([
  'limits_to_growth',
  'shifting_the_burden',
  'tragedy_of_the_commons',
  'fixes_that_fail',
  'eroding_goals',
  'escalation',
])
export type SystemsArchetype = z.infer<typeof SystemsArchetypeSchema>

export const SystemsMaturityTierSchema = z.enum([
  'linear_reductionist',
  'feedback_aware',
  'dynamic_simulator',
  'leverage_strategist',
])
export type SystemsMaturityTier = z.infer<typeof SystemsMaturityTierSchema>

export const SystemStockSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  initialValue: z.number(),
  minCapacity: z.number().optional(),
  maxCapacity: z.number().optional(),
  description: z.string(),
})
export type SystemStock = z.infer<typeof SystemStockSchema>

export const SystemFlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  sourceStockId: z.string().optional(),
  targetStockId: z.string().optional(),
  defaultRate: z.number(),
  formulaDescription: z.string(),
})
export type SystemFlow = z.infer<typeof SystemFlowSchema>

export const SystemLoopSchema = z.object({
  id: z.string(),
  name: z.string(),
  polarity: LoopPolaritySchema,
  elementIds: z.array(z.string()),
  delayDescription: z.string().optional(),
  delaySteps: z.number().optional(),
  explanation: z.string(),
})
export type SystemLoop = z.infer<typeof SystemLoopSchema>

export const SimulationStepSchema = z.object({
  step: z.number(),
  time: z.number(),
  stocks: z.record(z.string(), z.number()),
  flows: z.record(z.string(), z.number()),
  dominantLoopId: z.string().optional(),
})
export type SimulationStep = z.infer<typeof SimulationStepSchema>

export const SimulationRunSchema = z.object({
  scenarioId: z.string(),
  durationSteps: z.number(),
  dt: z.number(),
  steps: z.array(SimulationStepSchema),
  hasOscillation: z.boolean(),
  hasOvershoot: z.boolean(),
  finalEquilibrium: z.boolean(),
  summary: z.string(),
})
export type SimulationRun = z.infer<typeof SimulationRunSchema>

export const LeveragePointSchema = z.object({
  rank: z.number(), // Donella Meadows 12 leverage points (1 = highest, 12 = lowest)
  level: z.string(),
  description: z.string(),
})
export type LeveragePoint = z.infer<typeof LeveragePointSchema>

export const SystemDynamicsScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: z.string(),
  contextDescription: z.string(),
  difficulty: z.enum(['intermediate', 'advanced', 'expert']),
  stocks: z.array(SystemStockSchema),
  flows: z.array(SystemFlowSchema),
  canonicalLoops: z.array(SystemLoopSchema),
  canonicalArchetype: SystemsArchetypeSchema,
  leveragePoints: z.array(LeveragePointSchema),
  defaultDuration: z.number(),
  defaultDt: z.number(),
})
export type SystemDynamicsScenario = z.infer<typeof SystemDynamicsScenarioSchema>

export const LearnerModelHypothesisSchema = z.object({
  scenarioId: z.string(),
  classifiedVariables: z.array(
    z.object({
      id: z.string(),
      nature: VariableNatureSchema,
    }),
  ),
  identifiedLoops: z.array(
    z.object({
      id: z.string(),
      polarity: LoopPolaritySchema,
      elementIds: z.array(z.string()),
      delayIdentified: z.boolean(),
    }),
  ),
  identifiedArchetype: SystemsArchetypeSchema,
  proposedHighLeverageIntervention: z.string(),
  predictedBehavior: z.enum([
    'exponential_growth',
    's_shaped_growth',
    'overshoot_and_collapse',
    'damped_oscillation',
    'asymptotic_stability',
  ]),
})
export type LearnerModelHypothesis = z.infer<typeof LearnerModelHypothesisSchema>

/** POST /cognitive/system-dynamics/simulate body — shared across server, MCP and CLI. */
export const systemDynamicsSimulateInputSchema = z.object({
  scenarioId: z.string(),
  stepsCount: z.number().int().min(5).max(300).default(120),
  dt: z.number().min(0.01).max(10).default(1),
  policyMultipliers: z.record(z.string(), z.number()).optional(),
})
export type SystemDynamicsSimulateInput = z.infer<typeof systemDynamicsSimulateInputSchema>

/** POST /cognitive/system-dynamics/evaluate body — scenarioId + full learner model. */
export const systemDynamicsEvaluateInputSchema = z.object({
  scenarioId: z.string(),
  classifiedVariables: LearnerModelHypothesisSchema.shape.classifiedVariables,
  identifiedLoops: LearnerModelHypothesisSchema.shape.identifiedLoops,
  identifiedArchetype: LearnerModelHypothesisSchema.shape.identifiedArchetype,
  proposedHighLeverageIntervention:
    LearnerModelHypothesisSchema.shape.proposedHighLeverageIntervention,
  predictedBehavior: LearnerModelHypothesisSchema.shape.predictedBehavior,
})
export type SystemDynamicsEvaluateInput = z.infer<typeof systemDynamicsEvaluateInputSchema>

/** POST /cognitive/system-dynamics/deck body. */
export const systemDynamicsDeckInputSchema = z.object({
  scenarioId: z.string(),
  sdiBaseline: z.number().min(0).max(100).optional(),
})
export type SystemDynamicsDeckInput = z.infer<typeof systemDynamicsDeckInputSchema>

export const SystemsDynamicsEvaluationSchema = z.object({
  sfdr: z.number().min(0).max(100), // Stock-Flow Discrimination Ratio
  flia: z.number().min(0).max(100), // Feedback Loop Identification Accuracy
  dam: z.number().min(0).max(100), // Delay Awareness Metric
  ars: z.number().min(0).max(100), // Archetype Recognition Score
  sdi: z.number().min(0).max(100), // Composite System Dynamics Index
  maturityTier: SystemsMaturityTierSchema,
  strengths: z.array(z.string()),
  systemicFeedback: z.array(z.string()),
  archetypeDiscrepancies: z.array(z.string()),
  leveragePointAnalysis: z.string(),
})
export type SystemsDynamicsEvaluation = z.infer<typeof SystemsDynamicsEvaluationSchema>

export const SystemDynamicsFlashcardSchema = z.object({
  id: z.string(),
  cardType: z.enum([
    'stock_flow_discrimination',
    'loop_polarity_inversion',
    'delay_oscillation_vulnerability',
    'leverage_point_intervention',
  ]),
  front: z.string(),
  back: z.string(),
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
})
export type SystemDynamicsFlashcard = z.infer<typeof SystemDynamicsFlashcardSchema>

export const SystemDynamicsDeckSchema = z.object({
  scenarioId: z.string(),
  scenarioTitle: z.string(),
  sdi: z.number(),
  cards: z.array(SystemDynamicsFlashcardSchema),
  generatedAt: z.string(),
})
export type SystemDynamicsDeck = z.infer<typeof SystemDynamicsDeckSchema>

// ============================================================================
// 2. Canonical Multidisciplinary Scenarios
// ============================================================================

// TD-05: the canonical scenario corpora live in './content' (content, not logic).
export { CANONICAL_SYSTEM_DYNAMICS_SCENARIOS } from './content'

// ============================================================================
// 3. Deterministic Euler Numerical Simulation Engine
// ============================================================================

export function runEulerSimulation(
  scenario: SystemDynamicsScenario,
  stepsCount: number = scenario.defaultDuration,
  dt: number = scenario.defaultDt,
  customPolicy?: {
    flowRateMultipliers?: Record<string, number>
    delayModifierSteps?: number
    circuitBreakerActive?: boolean
  },
): SimulationRun {
  const steps: SimulationStep[] = []

  // Initialize stocks
  const currentStocks: Record<string, number> = {}
  for (const s of scenario.stocks) {
    currentStocks[s.id] = s.initialValue
  }

  // Ring buffer for tracking delay effects
  const delayBuffer: number[] = new Array(30).fill(0)

  let previousStockVariance = 0
  let oscillationCount = 0
  let maxOvershootObserved = false
  // Signed per-step change of the primary stock, used to detect direction
  // reversals (true oscillation) rather than magnitude growth (which fires
  // on any monotonic exponential run-away).
  let previousDelta = 0

  for (let s = 0; s < stepsCount; s++) {
    const currentTime = s * dt
    const currentFlows: Record<string, number> = {}

    // 1. Calculate flows based on current stock states
    for (const flow of scenario.flows) {
      let baseRate = flow.defaultRate

      if (customPolicy?.flowRateMultipliers?.[flow.id] !== undefined) {
        baseRate *= customPolicy.flowRateMultipliers[flow.id]
      }

      // Domain-specific non-linear feedback injection
      if (scenario.id === 'climate-permafrost-methane') {
        const temp = currentStocks['global_temperature_anomaly'] ?? 1.2
        if (flow.id === 'permafrost_thaw_release') {
          // Non-linear threshold activation above 1.5°C
          if (temp > 1.5) {
            baseRate += Math.pow(temp - 1.5, 2) * 1.8
          }
        } else if (flow.id === 'ocean_sink_absorption') {
          // Saturation damping
          const oceanStock = currentStocks['ocean_carbon_sink'] ?? 1000
          const capacityFraction = oceanStock / 1600
          baseRate *= Math.max(0.2, 1.0 - capacityFraction * 0.7)
        } else if (flow.id === 'radiative_heat_accumulation') {
          const carbon = currentStocks['atmospheric_carbon'] ?? 880
          baseRate = Math.log(carbon / 580) * 0.05
        }
      } else if (scenario.id === 'diabetes-beta-cell-homeostasis') {
        const glucose = currentStocks['plasma_glucose'] ?? 95
        const betaMass = currentStocks['functional_beta_cell_mass'] ?? 100
        const resistance = currentStocks['insulin_resistance_index'] ?? 1.0

        if (flow.id === 'insulin_secretion_rate') {
          baseRate = Math.max(2, (glucose - 80) * 0.25 * (betaMass / 100))
        } else if (flow.id === 'insulin_mediated_clearance') {
          const insulin = currentStocks['plasma_insulin'] ?? 10
          baseRate = Math.max(5, (insulin * 3.2) / resistance)
        } else if (flow.id === 'beta_cell_apoptotic_loss') {
          if (glucose > 140) {
            baseRate += Math.pow((glucose - 140) / 30, 1.5) * 0.5
          }
        }
      } else if (scenario.id === 'banking-liquidity-run') {
        const solvency = currentStocks['market_perceived_solvency'] ?? 14.5
        if (flow.id === 'deposit_withdrawal_flow') {
          if (solvency < 10) {
            baseRate += Math.pow(10 - solvency, 2) * 120
          }
        } else if (flow.id === 'asset_liquidation_flow') {
          const reserves = currentStocks['liquid_cash_reserves'] ?? 3500
          if (reserves < 1500) {
            baseRate += (1500 - reserves) * 0.4
          }
        }
      } else if (scenario.id === 'epidemic-icu-saturation') {
        const infectious = currentStocks['infectious_population'] ?? 10000
        const susceptible = currentStocks['susceptible_population'] ?? 980000
        const totalPop = 1000000
        const icuPatients = currentStocks['icu_patients'] ?? 200
        const icuCapacity = currentStocks['icu_capacity_stock'] ?? 500

        if (flow.id === 'new_infections_flow') {
          const beta = 0.28
          baseRate = (beta * infectious * susceptible) / totalPop
        } else if (flow.id === 'icu_admission_flow') {
          // Delayed flow from delay buffer
          baseRate = delayBuffer[0] * 0.04
        } else if (flow.id === 'mortality_flow') {
          if (icuPatients > icuCapacity) {
            baseRate = icuCapacity * 0.15 + (icuPatients - icuCapacity) * 0.65
          } else {
            baseRate = icuPatients * 0.15
          }
        }
      } else if (scenario.id === 'distributed-microservice-cascade') {
        const queue = currentStocks['upstream_ingress_queue'] ?? 50
        const activeThreads = currentStocks['active_worker_threads'] ?? 40

        if (flow.id === 'retry_amplification_flow') {
          if (queue > 250) {
            baseRate += Math.pow((queue - 250) / 50, 1.6) * 40
          }
        } else if (flow.id === 'circuit_breaker_shed_flow') {
          if (customPolicy?.circuitBreakerActive || queue > 600) {
            baseRate = queue * 0.8 // Fast-fail shed
          }
        } else if (flow.id === 'thread_dispatch_flow') {
          if (activeThreads >= 120) {
            baseRate = 0 // Thread starved
          }
        }
      }

      currentFlows[flow.id] = Math.max(0, baseRate)
    }

    // 2. Euler integration: update stocks
    const nextStocks: Record<string, number> = { ...currentStocks }

    for (const flow of scenario.flows) {
      const rate = currentFlows[flow.id] ?? 0
      const delta = rate * dt

      if (flow.sourceStockId && nextStocks[flow.sourceStockId] !== undefined) {
        nextStocks[flow.sourceStockId] -= delta
        const minCap = scenario.stocks.find((s) => s.id === flow.sourceStockId)?.minCapacity
        if (minCap !== undefined && nextStocks[flow.sourceStockId] < minCap) {
          nextStocks[flow.sourceStockId] = minCap
        }
      }

      if (flow.targetStockId && nextStocks[flow.targetStockId] !== undefined) {
        nextStocks[flow.targetStockId] += delta
        const maxCap = scenario.stocks.find((s) => s.id === flow.targetStockId)?.maxCapacity
        if (maxCap !== undefined && nextStocks[flow.targetStockId] > maxCap) {
          nextStocks[flow.targetStockId] = maxCap
        }
      }
    }

    // Advance delay buffer
    delayBuffer.shift()
    delayBuffer.push(currentFlows['new_infections_flow'] ?? 0)

    // Check overshoot and oscillation metrics
    const primaryStockKey = scenario.stocks[0]?.id
    if (primaryStockKey && nextStocks[primaryStockKey] !== undefined) {
      const currentVal = nextStocks[primaryStockKey]
      const initialVal = scenario.stocks[0]?.initialValue ?? 0
      if (currentVal > initialVal * 1.5) {
        maxOvershootObserved = true
      }
      const deltaVariance = Math.abs(currentVal - (currentStocks[primaryStockKey] ?? 0))
      const signedDelta = currentVal - (currentStocks[primaryStockKey] ?? 0)
      // True oscillation = the step DIRECTION reverses (with enough magnitude
      // to be signal, not float noise). Counting magnitude growth instead
      // would flag plain monotonic growth (the per-step |Δ| of an expanding
      // system grows every step) as "oscillation".
      if (s > 5 && deltaVariance > 1e-9) {
        if (previousDelta !== 0 && Math.sign(signedDelta) !== Math.sign(previousDelta)) {
          oscillationCount++
        }
        previousDelta = signedDelta
      }
      previousStockVariance = deltaVariance
    }

    // Update current stocks for next step
    for (const key of Object.keys(nextStocks)) {
      currentStocks[key] = nextStocks[key]
    }

    steps.push({
      step: s,
      time: Math.round(currentTime * 100) / 100,
      stocks: { ...currentStocks },
      flows: { ...currentFlows },
      dominantLoopId:
        s < stepsCount / 3
          ? scenario.canonicalLoops[0]?.id
          : (scenario.canonicalLoops[1]?.id ?? scenario.canonicalLoops[0]?.id),
    })
  }

  const hasOscillation = oscillationCount >= 6
  const finalEquilibrium = steps.length > 10 && previousStockVariance < 0.05

  return {
    scenarioId: scenario.id,
    durationSteps: stepsCount,
    dt,
    steps,
    hasOscillation,
    hasOvershoot: maxOvershootObserved,
    finalEquilibrium,
    summary: `Simulated ${stepsCount} steps (dt=${dt}). Overshoot=${maxOvershootObserved}, Oscillation=${hasOscillation}, Equilibrium=${finalEquilibrium}.`,
  }
}

// ============================================================================
// 4. Quantitative Systems Thinking Evaluator
// ============================================================================

export function evaluateLearnerModel(
  scenario: SystemDynamicsScenario,
  hypothesis: LearnerModelHypothesis,
): SystemsDynamicsEvaluation {
  const strengths: string[] = []
  const feedback: string[] = []
  const discrepancies: string[] = []

  // 1. Stock-Flow Discrimination Ratio (SFDR)
  let correctClassifications = 0
  const allScenarioVars = new Map<string, VariableNature>()
  for (const s of scenario.stocks) allScenarioVars.set(s.id, 'stock')
  for (const f of scenario.flows) allScenarioVars.set(f.id, 'flow')

  for (const classified of hypothesis.classifiedVariables) {
    const canonical = allScenarioVars.get(classified.id)
    if (canonical && canonical === classified.nature) {
      correctClassifications++
    } else if (canonical) {
      discrepancies.push(
        `Variable "${classified.id}" was classified as ${classified.nature}, but is canonically a ${canonical} (Booth Sweeney & Sterman 2000 bathtub principle).`,
      )
    }
  }

  const totalVars = allScenarioVars.size
  const sfdr = totalVars > 0 ? Math.round((correctClassifications / totalVars) * 100) : 0

  if (sfdr >= 85) {
    strengths.push(
      'Exceptional stock-flow discrimination: accurately distinguished accumulations from differential rates.',
    )
  } else {
    feedback.push(
      'Review the Bathtub Dynamics principle: Stocks accumulate over time and possess inertia; Flows are instantaneous rates of change.',
    )
  }

  // 2. Feedback Loop Identification Accuracy (FLIA)
  let loopMatches = 0
  let delaysDetected = 0

  for (const identified of hypothesis.identifiedLoops) {
    const canonical = scenario.canonicalLoops.find((cl) => cl.id === identified.id)
    if (canonical) {
      if (canonical.polarity === identified.polarity) {
        loopMatches++
      } else {
        discrepancies.push(
          `Loop "${identified.id}" polarity misidentified as ${identified.polarity}; canonically it functions as a ${canonical.polarity} feedback cycle.`,
        )
      }
      if (identified.delayIdentified && (canonical.delaySteps ?? 0) > 0) {
        delaysDetected++
      }
    }
  }

  const totalCanonicalLoops = scenario.canonicalLoops.length
  const flia = totalCanonicalLoops > 0 ? Math.round((loopMatches / totalCanonicalLoops) * 100) : 0

  if (flia >= 80) {
    strengths.push(
      'Robust causal feedback loop diagramming: correctly determined loop polarities (Reinforcing vs Balancing).',
    )
  } else {
    feedback.push(
      'Count the number of negative/opposing causal links in the loop: an even number yields Reinforcing (R), an odd number yields Balancing (B).',
    )
  }

  // 3. Delay Awareness Metric (DAM)
  const canonicalDelays = scenario.canonicalLoops.filter((cl) => (cl.delaySteps ?? 0) > 0).length
  const dam =
    canonicalDelays > 0 ? Math.min(100, Math.round((delaysDetected / canonicalDelays) * 100)) : 100

  if (dam >= 75) {
    strengths.push(
      'Keen awareness of material and information delays that generate systemic oscillation and overshoot.',
    )
  } else {
    feedback.push(
      'Account for physical and informational latency: unacknowledged delays destabilize balancing loops into oscillatory cycles.',
    )
  }

  // 4. Archetype Recognition Score (ARS)
  const archetypeCorrect = hypothesis.identifiedArchetype === scenario.canonicalArchetype
  let ars = archetypeCorrect ? 90 : 35

  // Check behavior prediction consistency
  if (
    scenario.canonicalArchetype === 'limits_to_growth' &&
    ['s_shaped_growth', 'overshoot_and_collapse'].includes(hypothesis.predictedBehavior)
  ) {
    ars = Math.min(100, ars + 10)
  } else if (
    scenario.canonicalArchetype === 'fixes_that_fail' &&
    ['damped_oscillation', 'overshoot_and_collapse'].includes(hypothesis.predictedBehavior)
  ) {
    ars = Math.min(100, ars + 10)
  } else if (!archetypeCorrect) {
    discrepancies.push(
      `Identified archetype "${hypothesis.identifiedArchetype}" does not align with canonical archetype "${scenario.canonicalArchetype}" (Senge 1990).`,
    )
  }

  if (archetypeCorrect) {
    strengths.push(
      `Accurately diagnosed the classic system archetype: "${scenario.canonicalArchetype.replace(/_/g, ' ')}".`,
    )
  }

  // 5. Composite System Dynamics Index (SDI)
  const sdi = Math.round(sfdr * 0.3 + flia * 0.3 + dam * 0.2 + ars * 0.2)

  // 6. Maturity Tier Assignment
  let maturityTier: SystemsMaturityTier = 'linear_reductionist'
  if (sdi >= 85) {
    maturityTier = 'leverage_strategist'
  } else if (sdi >= 70) {
    maturityTier = 'dynamic_simulator'
  } else if (sdi >= 50) {
    maturityTier = 'feedback_aware'
  }

  // 7. Leverage Point Analysis
  const topLeverage = scenario.leveragePoints[0]
  const leveragePointAnalysis = `Top systemic leverage point (Meadows Rank ${topLeverage?.rank ?? 4} - ${topLeverage?.level ?? 'System Rules'}): ${topLeverage?.description ?? 'Alter information feedback structures'}. Your proposed intervention: "${hypothesis.proposedHighLeverageIntervention}".`

  return {
    sfdr,
    flia,
    dam,
    ars,
    sdi,
    maturityTier,
    strengths,
    systemicFeedback: feedback,
    archetypeDiscrepancies: discrepancies,
    leveragePointAnalysis,
  }
}

// ============================================================================
// 5. Calibrated FSRS-6 Review Deck Generator
// ============================================================================

export function generateSystemDynamicsFSRSDeck(
  scenario: SystemDynamicsScenario,
  evaluation: SystemsDynamicsEvaluation,
): SystemDynamicsDeck {
  const cards: SystemDynamicsFlashcard[] = []

  // Scale stability and difficulty based on SDI
  const baseStability = Math.max(1.0, Math.round((evaluation.sdi / 20) * 10) / 10)
  const baseDifficulty = Math.max(2.0, Math.round((10 - evaluation.sdi / 15) * 10) / 10)

  // Card 1: Stock vs Flow discrimination
  const sampleStock = scenario.stocks[0]
  const sampleFlow = scenario.flows[0]
  if (sampleStock && sampleFlow) {
    cards.push({
      id: `sd-${scenario.id}-sf-distinction`,
      cardType: 'stock_flow_discrimination',
      front: `[${scenario.title}]\nExplain the fundamental difference in mathematical behavior and units between "${sampleStock.name}" and "${sampleFlow.name}".`,
      back: `• "${sampleStock.name}" is a STOCK: represents an accumulation measured at a single point in time (${sampleStock.unit}). It has memory and changes only via flows.\n• "${sampleFlow.name}" is a FLOW: represents a rate of change measured per unit time (${sampleFlow.unit}). Cutting the inflow does NOT immediately reduce the stock!`,
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    })
  }

  // Card 2: Feedback Loop Polarity Inversion
  const sampleLoop = scenario.canonicalLoops[0]
  if (sampleLoop) {
    cards.push({
      id: `sd-${scenario.id}-loop-polarity`,
      cardType: 'loop_polarity_inversion',
      front: `[${scenario.title}]\nAnalyze loop "${sampleLoop.name}". What is its polarity, and what would happen if a balancing intervention inverted its net sign?`,
      back: `• Canonical Polarity: ${sampleLoop.polarity.toUpperCase()}.\n• Mechanism: ${sampleLoop.explanation}.\n• Sign Inversion: Turning this into a negative feedback loop arrests exponential runaway/collapse and stabilizes the system around an equilibrium setpoint.`,
      fsrsParameters: {
        stability: baseStability * 1.1,
        difficulty: baseDifficulty,
      },
    })
  }

  // Card 3: Delay & Oscillation Vulnerability
  const delayLoop = scenario.canonicalLoops.find((cl) => (cl.delaySteps ?? 0) > 0)
  if (delayLoop) {
    cards.push({
      id: `sd-${scenario.id}-delay-oscillation`,
      cardType: 'delay_oscillation_vulnerability',
      front: `[${scenario.title}]\nWhy does the lag in "${delayLoop.name}" (${delayLoop.delayDescription}) risk producing systemic overshoot and catastrophic oscillation?`,
      back: `• Latency Mechanism: Corrective balancing feedback is delayed by ${delayLoop.delaySteps ?? 0} time steps.\n• Systemic Consequence: Decision-makers continue corrective intervention after the target is met because the feedback signal has not arrived, resulting in aggressive overshooting and destructive boom-bust cycles.`,
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty + 0.5,
      },
    })
  }

  // Card 4: Donella Meadows High-Leverage Intervention
  const topLeverage = scenario.leveragePoints[0]
  if (topLeverage) {
    cards.push({
      id: `sd-${scenario.id}-leverage-point`,
      cardType: 'leverage_point_intervention',
      front: `[${scenario.title}]\nAccording to Donella Meadows' 12 Leverage Points hierarchy, what is the highest-leverage systemic intervention for this scenario?`,
      back: `• Meadow's Rank ${topLeverage.rank} (${topLeverage.level}):\n${topLeverage.description}\n• Why High Leverage: Interventions altering system rules, information flows, and structural goals fundamentally rewire loop dominance without requiring massive brute-force energy inputs.`,
      fsrsParameters: {
        stability: baseStability * 1.2,
        difficulty: Math.max(1.5, baseDifficulty - 0.5),
      },
    })
  }

  return {
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    sdi: evaluation.sdi,
    cards,
    generatedAt: new Date().toISOString(),
  }
}

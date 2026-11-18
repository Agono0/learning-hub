import { describe, expect, it } from 'vitest'
import {
  CANONICAL_SYSTEM_DYNAMICS_SCENARIOS,
  evaluateLearnerModel,
  generateSystemDynamicsFSRSDeck,
  runEulerSimulation,
  SystemDynamicsScenarioSchema,
  type LearnerModelHypothesis,
} from '../src/system-dynamics'

describe('System Dynamics & Feedback Loop Modeling Engine', () => {
  it('loads all 5 canonical multidisciplinary scenarios with valid schema structures', () => {
    expect(CANONICAL_SYSTEM_DYNAMICS_SCENARIOS).toHaveLength(5)

    for (const scenario of CANONICAL_SYSTEM_DYNAMICS_SCENARIOS) {
      const parsed = SystemDynamicsScenarioSchema.safeParse(scenario)
      expect(parsed.success).toBe(true)
      expect(scenario.stocks.length).toBeGreaterThanOrEqual(3)
      expect(scenario.flows.length).toBeGreaterThanOrEqual(3)
      expect(scenario.canonicalLoops.length).toBeGreaterThanOrEqual(2)
      expect(scenario.leveragePoints.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('runs deterministic Euler numerical simulation tracking stocks, flows, and tipping behaviors', () => {
    const climate = CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find(
      (s) => s.id === 'climate-permafrost-methane',
    )!
    expect(climate).toBeDefined()

    const sim = runEulerSimulation(climate, 50, 1.0)
    expect(sim.steps).toHaveLength(50)

    // Check first step vs last step: carbon accumulates in atmosphere and temperature rises
    const firstStep = sim.steps[0]!
    const lastStep = sim.steps[49]!

    expect(lastStep.stocks['atmospheric_carbon']).toBeGreaterThan(
      firstStep.stocks['atmospheric_carbon']!,
    )
    expect(lastStep.stocks['global_temperature_anomaly']).toBeGreaterThan(
      firstStep.stocks['global_temperature_anomaly']!,
    )
    expect(sim.hasOvershoot).toBeDefined()
  })

  it('evaluates a high-competence learner model as leverage_strategist with high SDI', () => {
    const diabetes = CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find(
      (s) => s.id === 'diabetes-beta-cell-homeostasis',
    )!
    expect(diabetes).toBeDefined()

    const hypothesis: LearnerModelHypothesis = {
      scenarioId: diabetes.id,
      classifiedVariables: [
        { id: 'plasma_glucose', nature: 'stock' },
        { id: 'plasma_insulin', nature: 'stock' },
        { id: 'functional_beta_cell_mass', nature: 'stock' },
        { id: 'insulin_resistance_index', nature: 'stock' },
        { id: 'dietary_glucose_inflow', nature: 'flow' },
        { id: 'insulin_mediated_clearance', nature: 'flow' },
        { id: 'insulin_secretion_rate', nature: 'flow' },
        { id: 'beta_cell_apoptotic_loss', nature: 'flow' },
      ],
      identifiedLoops: [
        {
          id: 'B1_insulin_homeostasis',
          polarity: 'balancing',
          elementIds: [
            'plasma_glucose',
            'insulin_secretion_rate',
            'plasma_insulin',
            'insulin_mediated_clearance',
          ],
          delayIdentified: true,
        },
        {
          id: 'R1_glucotoxicity_exhaustion',
          polarity: 'reinforcing',
          elementIds: [
            'plasma_glucose',
            'beta_cell_apoptotic_loss',
            'functional_beta_cell_mass',
            'insulin_secretion_rate',
            'plasma_insulin',
            'insulin_mediated_clearance',
          ],
          delayIdentified: true,
        },
        {
          id: 'R2_hyperinsulinemic_downregulation',
          polarity: 'reinforcing',
          elementIds: [
            'plasma_insulin',
            'insulin_resistance_index',
            'insulin_mediated_clearance',
            'plasma_glucose',
            'insulin_secretion_rate',
          ],
          delayIdentified: true,
        },
      ],
      identifiedArchetype: 'fixes_that_fail',
      proposedHighLeverageIntervention:
        'Time-restricted feeding to resensitize insulin receptor substrates before ER stress triggers apoptotic threshold',
      predictedBehavior: 'damped_oscillation',
    }

    const evaluation = evaluateLearnerModel(diabetes, hypothesis)

    expect(evaluation.sfdr).toBe(100)
    expect(evaluation.flia).toBe(100)
    expect(evaluation.dam).toBe(100)
    expect(evaluation.ars).toBeGreaterThanOrEqual(90)
    expect(evaluation.sdi).toBeGreaterThanOrEqual(85)
    expect(evaluation.maturityTier).toBe('leverage_strategist')
    expect(evaluation.strengths.length).toBeGreaterThanOrEqual(3)
    expect(evaluation.archetypeDiscrepancies).toHaveLength(0)
  })

  it('detects stock-flow confusion and polarity errors in linear reductionist models', () => {
    const banking = CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find(
      (s) => s.id === 'banking-liquidity-run',
    )!
    expect(banking).toBeDefined()

    const reductionistHypothesis: LearnerModelHypothesis = {
      scenarioId: banking.id,
      // Misclassify flows as stocks and stocks as flows
      classifiedVariables: [
        { id: 'liquid_cash_reserves', nature: 'flow' },
        { id: 'deposit_withdrawal_flow', nature: 'stock' },
      ],
      identifiedLoops: [
        {
          id: 'R1_fire_sale_death_spiral',
          polarity: 'balancing', // inverted polarity
          elementIds: ['uninsured_deposits'],
          delayIdentified: false,
        },
      ],
      identifiedArchetype: 'tragedy_of_the_commons', // incorrect archetype
      proposedHighLeverageIntervention: 'Borrow money faster',
      predictedBehavior: 'asymptotic_stability',
    }

    const evaluation = evaluateLearnerModel(banking, reductionistHypothesis)

    expect(evaluation.sfdr).toBeLessThan(50)
    expect(evaluation.flia).toBe(0)
    expect(evaluation.dam).toBe(0)
    expect(evaluation.sdi).toBeLessThan(50)
    expect(evaluation.maturityTier).toBe('linear_reductionist')
    expect(evaluation.archetypeDiscrepancies.length).toBeGreaterThan(0)
  })

  it('generates calibrated FSRS-6 spaced repetition deck reflecting systems thinking concepts', () => {
    const microservices = CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find(
      (s) => s.id === 'distributed-microservice-cascade',
    )!
    expect(microservices).toBeDefined()

    const mockEvaluation = {
      sfdr: 90,
      flia: 85,
      dam: 80,
      ars: 90,
      sdi: 87,
      maturityTier: 'leverage_strategist' as const,
      strengths: ['Great work'],
      systemicFeedback: [],
      archetypeDiscrepancies: [],
      leveragePointAnalysis: 'Circuit breaker load shedding is high leverage.',
    }

    const deck = generateSystemDynamicsFSRSDeck(microservices, mockEvaluation)

    expect(deck.scenarioId).toBe(microservices.id)
    expect(deck.cards.length).toBe(4)

    const cardTypes = deck.cards.map((c) => c.cardType)
    expect(cardTypes).toContain('stock_flow_discrimination')
    expect(cardTypes).toContain('loop_polarity_inversion')
    expect(cardTypes).toContain('delay_oscillation_vulnerability')
    expect(cardTypes).toContain('leverage_point_intervention')

    for (const card of deck.cards) {
      expect(card.front.length).toBeGreaterThan(20)
      expect(card.back.length).toBeGreaterThan(20)
      expect(card.fsrsParameters.stability).toBeGreaterThan(1.0)
      expect(card.fsrsParameters.difficulty).toBeGreaterThan(1.0)
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  MicroWorldScenarioSchema,
  listMicroWorldScenarios,
  getMicroWorldScenario,
  simulateMicroWorldStep,
  evaluateCPSSession,
  generateCPSFSRSDeck,
  calculateDynamicControlEfficiency,
  calculateSideEffectAnticipationIndex,
  calculateThematicFocusScore,
  calculateFeedbackMonitoringRatio,
  calculateCompositeCPSIndex,
  determineCognitiveControlTier,
  type MicroWorldState,
} from '../src/complex-problem-solving'

describe('Complex Problem Solving (CPS) & Micro-World Engine (Dörner 1996)', () => {
  it('loads and validates all 5 canonical micro-worlds against Zod schema', () => {
    const scenarios = listMicroWorldScenarios()
    expect(scenarios).toHaveLength(5)

    for (const scenario of scenarios) {
      const parsed = MicroWorldScenarioSchema.safeParse(scenario)
      expect(parsed.success).toBe(true)
      expect(scenario.variables.length).toBeGreaterThanOrEqual(3)
      expect(scenario.availablePolicies.length).toBeGreaterThanOrEqual(2)
      expect(scenario.polytelicGoals.length).toBeGreaterThanOrEqual(2)
      expect(scenario.fsrsItems.length).toBeGreaterThanOrEqual(1)
      expect(scenario.canonicalFailureMode.remedyPrinciple.length).toBeGreaterThan(10)
    }

    expect(getMicroWorldScenario('tanaland_desert_ecosystem')).toBeDefined()
    expect(getMicroWorldScenario('smart_grid_energy_transition')).toBeDefined()
    expect(getMicroWorldScenario('pandemic_hospital_surge')).toBeDefined()
    expect(getMicroWorldScenario('autonomous_datacenter_thermal')).toBeDefined()
    expect(getMicroWorldScenario('wildfire_evacuation_corridor')).toBeDefined()
  })

  it('simulates discrete decision cycles resolving direct policy effects and delayed side-effect cascades', () => {
    const initialState: MicroWorldState = {
      currentCycle: 1,
      variableValues: {
        cattle_population: 100,
        groundwater_table: 50,
        pasture_vegetation_biomass: 120,
        tsetse_fly_density: 45,
        soil_erosion_rate: 15,
      },
      activeDelays: [],
      inspectedVariables: ['cattle_population', 'groundwater_table'],
      executedPolicyIds: [],
      systemCollapsed: false,
    }

    // Cycle 1: Execute deep borehole drilling
    const step1 = simulateMicroWorldStep(
      'tanaland_desert_ecosystem',
      initialState,
      ['drill_deep_boreholes'],
      ['cattle_population', 'groundwater_table'],
    )

    expect(step1.nextState.currentCycle).toBe(2)
    // Groundwater drew down by direct delta (-10)
    expect(step1.nextState.variableValues['groundwater_table']).toBe(40)
    // Delayed effects queued
    expect(step1.nextState.activeDelays.length).toBe(2)
    expect(step1.nextState.systemCollapsed).toBe(false)

    // Cycle 2: Execute rotational grazing and tick one cycle forward
    const step2 = simulateMicroWorldStep(
      'tanaland_desert_ecosystem',
      step1.nextState,
      ['rotational_grazing_enclosures'],
      ['pasture_vegetation_biomass'],
    )

    expect(step2.nextState.currentCycle).toBe(3)
    // The delay with delayPeriods=2 from cycle 1 now matures in cycle 3
    const step3 = simulateMicroWorldStep('tanaland_desert_ecosystem', step2.nextState, [], [])
    expect(step3.stepFeedback.some((f) => f.includes('Delayed cascade matured'))).toBe(true)
  })

  it('triggers catastrophic systemic collapse when critical variable breaches safety bounds', () => {
    const dangerState: MicroWorldState = {
      currentCycle: 3,
      variableValues: {
        grid_frequency: 49.7, // Below minSafe: 49.8
        battery_storage_soc: 10,
        natural_gas_peaker_reserve: 300,
        transmission_line_thermal_stress: 70,
      },
      activeDelays: [],
      inspectedVariables: ['grid_frequency'],
      executedPolicyIds: [],
      systemCollapsed: false,
    }

    const step = simulateMicroWorldStep('smart_grid_energy_transition', dangerState, [])
    expect(step.nextState.systemCollapsed).toBe(true)
    expect(step.collapseWarning).toContain('grid_frequency')
  })

  it('computes quantitative CPS telemetry and assigns cognitive control tiers', () => {
    const tanaland = getMicroWorldScenario('tanaland_desert_ecosystem')!

    const healthyState: MicroWorldState = {
      currentCycle: 5,
      variableValues: {
        cattle_population: 110,
        groundwater_table: 45,
        pasture_vegetation_biomass: 115,
        tsetse_fly_density: 40,
        soil_erosion_rate: 18,
      },
      activeDelays: [],
      inspectedVariables: ['cattle_population', 'groundwater_table', 'pasture_vegetation_biomass'],
      executedPolicyIds: ['rotational_grazing_enclosures', 'rotational_grazing_enclosures'],
      systemCollapsed: false,
    }

    const dce = calculateDynamicControlEfficiency(tanaland, healthyState)
    expect(dce).toBe(100)

    const seai = calculateSideEffectAnticipationIndex(tanaland, healthyState.executedPolicyIds)
    expect(seai).toBeGreaterThanOrEqual(60)

    const tfs = calculateThematicFocusScore(tanaland, healthyState.executedPolicyIds)
    expect(tfs).toBeGreaterThanOrEqual(70)

    const fmr = calculateFeedbackMonitoringRatio(tanaland, healthyState.inspectedVariables)
    expect(fmr).toBe(100)

    const cpsi = calculateCompositeCPSIndex(dce, seai, tfs, fmr)
    expect(cpsi).toBeGreaterThanOrEqual(80)

    const tier = determineCognitiveControlTier(cpsi)
    expect(['strategic_coordinator', 'systems_governor']).toContain(tier.tier)
  })

  it('diagnoses Dörner failure pathologies (ballistic action, thematic vagabonding, repair service)', () => {
    const badState: MicroWorldState = {
      currentCycle: 4,
      variableValues: {
        cattle_population: 160,
        groundwater_table: 20,
        pasture_vegetation_biomass: 40,
        tsetse_fly_density: 10,
        soil_erosion_rate: 38,
      },
      activeDelays: [],
      inspectedVariables: [], // zero inspections -> ballistic action
      executedPolicyIds: [
        'drill_deep_boreholes',
        'veterinary_vaccination_drive',
        'drill_deep_boreholes',
      ],
      systemCollapsed: true,
      collapseReason:
        'Critical variable Topsoil Erosion Velocity breached safe operating envelope.',
    }

    const evaluation = evaluateCPSSession('tanaland_desert_ecosystem', badState)
    expect(evaluation.feedbackMonitoring).toBeLessThan(50)
    expect(evaluation.detectedPathologies.some((p) => p.pathology === 'ballistic_action')).toBe(
      true,
    )
    expect(evaluation.tier).toBe('ballistic_reactive')
  })

  it('generates calibrated FSRS-6 spaced repetition cards including pathology reviews', () => {
    const cards = generateCPSFSRSDeck('pandemic_hospital_surge')
    expect(cards.length).toBeGreaterThanOrEqual(2)

    for (const card of cards) {
      expect(card.id).toContain('fsrs_cps_pandemic_hospital_surge')
      expect(card.front).toContain('Micro-World CPS')
      expect(card.tags).toContain('cps')
    }

    // Evaluation with detected pathology generates remediation card
    const badState: MicroWorldState = {
      currentCycle: 3,
      variableValues: { icu_occupancy_rate: 98 },
      activeDelays: [],
      inspectedVariables: [],
      executedPolicyIds: ['cancel_all_elective_surgeries', 'mandate_nurse_double_shifts'],
      systemCollapsed: true,
      collapseReason:
        'Critical variable Topsoil Erosion Velocity breached safe operating envelope.',
    }
    const evalResult = evaluateCPSSession('pandemic_hospital_surge', badState)
    const cardsWithReview = generateCPSFSRSDeck('pandemic_hospital_surge', evalResult)
    expect(cardsWithReview.some((c) => c.id.includes('pathology_review'))).toBe(true)
  })
})

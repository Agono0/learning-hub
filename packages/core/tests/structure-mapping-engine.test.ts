/**
 * @file structure-mapping-engine.test.ts
 * @description Unit tests for Gick & Holyoak (1980, 1983), Gentner (1983) and Novick (1988) Analogical Transfer & Structure Mapping Engine.
 */

import { describe, expect, it } from 'vitest'
import {
  AnalogicalTransferSession,
  CALIBRATED_ANALOGICAL_SUITES,
  evaluateStructureMappingAttempt,
  exportAnalogicalToFSRSCards,
} from '../src/analogy/structure-mapping-engine'

describe('Gentner (1983) Structure-Mapping & Systematicity Principle', () => {
  it('evaluates perfect relational mapping between military fortress and radiation oncology', () => {
    const suite = CALIBRATED_ANALOGICAL_SUITES.convergence_radiation_oncology!
    const base = suite.baseAnalogs[0]! // General and Fortress

    const attempt = {
      suiteId: suite.suiteId,
      selectedBaseAnalogId: base.id,
      entityMappings: [
        { baseEntityId: 'ent_fortress', targetEntityId: 'ent_tumor' },
        { baseEntityId: 'ent_mined_roads', targetEntityId: 'ent_healthy_tissue' },
        { baseEntityId: 'ent_army_force', targetEntityId: 'ent_radiation_ray' },
      ],
      predicateMappings: [
        { basePredicateId: 'pred_army_1', targetPredicateId: 'pred_rad_1' },
        { basePredicateId: 'pred_army_2', targetPredicateId: 'pred_rad_2' },
      ],
      articulatedConvergenceSchema:
        'Subdivide the total force into multiple low-intensity fractions to prevent damage to fragile intervening medium, and synchronize them to converge simultaneously on the central target.',
      confidenceScore: 5,
      timeSpentMs: 15000,
    }

    const telemetry = evaluateStructureMappingAttempt(suite, attempt)
    expect(telemetry.entityAlignmentAccuracy).toBe(1.0)
    expect(telemetry.predicatePreservationAccuracy).toBe(1.0)
    expect(telemetry.systematicityScore).toBe(100)
    expect(telemetry.schemaInductionMaturity).toBeGreaterThanOrEqual(70)
    expect(telemetry.spontaneousTransferProbability).toBeGreaterThanOrEqual(0.8)
    expect(telemetry.fsrsStabilityBonus).toBeGreaterThanOrEqual(2.0)
    expect(telemetry.feedbackMessage).toContain('Exceptional Structure Mapping')
    expect(telemetry.misalignedEntities.length).toBe(0)
  })

  it('detects misaligned entities and missing higher-order causal relations', () => {
    const suite = CALIBRATED_ANALOGICAL_SUITES.convergence_radiation_oncology!
    const base = suite.baseAnalogs[0]!

    // Novice mistakenly aligns fortress to healthy tissue based on surface "barrier" similarity
    const faultyAttempt = {
      suiteId: suite.suiteId,
      selectedBaseAnalogId: base.id,
      entityMappings: [
        { baseEntityId: 'ent_fortress', targetEntityId: 'ent_healthy_tissue' },
        { baseEntityId: 'ent_army_force', targetEntityId: 'ent_tumor' },
      ],
      predicateMappings: [],
      articulatedConvergenceSchema: 'Attack the tissue with soldiers.',
      confidenceScore: 3,
      timeSpentMs: 9000,
    }

    const telemetry = evaluateStructureMappingAttempt(suite, attemptWithFallback(faultyAttempt))
    expect(telemetry.entityAlignmentAccuracy).toBeLessThan(0.5)
    expect(telemetry.predicatePreservationAccuracy).toBe(0)
    expect(telemetry.systematicityScore).toBeLessThan(40)
    expect(telemetry.misalignedEntities).toContain('ent_fortress')
    expect(telemetry.missingPredicates.length).toBeGreaterThan(0)
  })

  it('validates hydraulic water loop mapping to electrical DC circuit (Ohm & Kirchhoff)', () => {
    const suite = CALIBRATED_ANALOGICAL_SUITES.hydraulic_electrical_conduction!
    const waterBase = suite.baseAnalogs[0]! // Pressurized Water Piping

    const attempt = {
      suiteId: suite.suiteId,
      selectedBaseAnalogId: waterBase.id,
      entityMappings: [
        { baseEntityId: 'ent_water_pump', targetEntityId: 'ent_battery' },
        { baseEntityId: 'ent_water_flow', targetEntityId: 'ent_electron_flow' },
        { baseEntityId: 'ent_pipe_constriction', targetEntityId: 'ent_resistor' },
      ],
      predicateMappings: [
        { basePredicateId: 'pred_water_1', targetPredicateId: 'pred_elec_1' },
        { basePredicateId: 'pred_water_2', targetPredicateId: 'pred_elec_2' },
      ],
      articulatedConvergenceSchema:
        'Continuous conserved flow is driven by driving potential gradient and impeded by constriction resistance according to proportional flux equilibrium.',
      confidenceScore: 5,
      timeSpentMs: 12000,
    }

    const telemetry = evaluateStructureMappingAttempt(suite, attempt)
    expect(telemetry.entityAlignmentAccuracy).toBe(1.0)
    expect(telemetry.systematicityScore).toBe(100)
    expect(telemetry.fsrsStabilityBonus).toBeGreaterThanOrEqual(2.0)
  })
})

describe('AnalogicalTransferSession State Machine & FSRS Flashcard Generation', () => {
  it('manages interactive session state and advances through multi-domain suites', () => {
    const session = new AnalogicalTransferSession()
    const suite1 = session.getCurrentSuite()!
    expect(suite1.suiteId).toBe('convergence_radiation_oncology')

    // Perform mapping
    session.setEntityMapping('ent_fortress', 'ent_tumor')
    session.setEntityMapping('ent_mined_roads', 'ent_healthy_tissue')
    session.setEntityMapping('ent_army_force', 'ent_radiation_ray')
    session.setPredicateMapping('pred_army_1', 'pred_rad_1')
    session.setPredicateMapping('pred_army_2', 'pred_rad_2')
    session.setSchemaText('Subdivide and converge sub-threshold forces from all directions.')

    const telemetry = session.evaluateCurrentMapping()
    expect(telemetry).not.toBeNull()
    expect(telemetry?.systematicityScore).toBe(100)
    expect(session.getState().completedSuiteIds).toContain('convergence_radiation_oncology')

    // Switch to another suite
    session.selectSuite('hydraulic_electrical_conduction')
    expect(session.getCurrentSuite()?.suiteId).toBe('hydraulic_electrical_conduction')
    expect(session.getSelectedBaseAnalog()?.id).toBe('base_water_pipes')
  })

  it('exports evaluated analogical transfer mappings into dual-domain FSRS review cards', () => {
    const session = new AnalogicalTransferSession()
    session.setEntityMapping('ent_fortress', 'ent_tumor')
    session.setEntityMapping('ent_mined_roads', 'ent_healthy_tissue')
    session.setEntityMapping('ent_army_force', 'ent_radiation_ray')
    session.setPredicateMapping('pred_army_1', 'pred_rad_1')
    session.setPredicateMapping('pred_army_2', 'pred_rad_2')
    session.setSchemaText('Subdivide and converge sub-threshold forces simultaneously.')
    session.evaluateCurrentMapping()

    const cards = exportAnalogicalToFSRSCards(session)
    expect(cards.length).toBe(1)

    const card = cards[0]!
    expect(card.front).toContain('Cross-Domain Analogical Transfer')
    expect(card.back).toContain('Convergence Schema')
    expect(card.back).toContain('Gentner Systematicity Score')
    expect(card.suggestedStabilityDays).toBeGreaterThan(6.0)
    expect(card.tags).toContain('analogical-transfer')
  })
})

function attemptWithFallback(partial: {
  suiteId: string
  selectedBaseAnalogId: string
  entityMappings: { baseEntityId: string; targetEntityId: string }[]
  predicateMappings: { basePredicateId: string; targetPredicateId: string }[]
  articulatedConvergenceSchema: string
  confidenceScore: number
  timeSpentMs: number
}) {
  return partial
}

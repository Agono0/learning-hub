/**
 * Tests for Conceptual Change & Ontological Category Shift Engine
 *
 * Verifies Chi ontological attribute classification, Posner accommodation scoring,
 * Vosniadou synthetic model risk detection, diSessa p-prim mappings, and FSRS card generation.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_MISCONCEPTION_SCENARIOS,
  CANONICAL_ATTRIBUTE_CATALOG,
  CANONICAL_PPRIM_CATALOG,
  type ProcessAttribute,
  calculateConceptualChangeReadiness,
  calculateOntologicalDiscrepancyGap,
  detectSyntheticCompromiseRisk,
  evaluateOntologicalMaturityTier,
  evaluatePosnerAccommodationIndex,
  generateFSRSConceptualShiftCards,
} from '../src/conceptual-change'

describe('Conceptual Change & Ontological Category Shift Engine', () => {
  it('calculates ontological discrepancy gap accurately', () => {
    const scenario = CALIBRATED_MISCONCEPTION_SCENARIOS[0] // Natural selection

    // Learner selects purely direct process attributes (100% naive gap)
    const naiveSelected: ProcessAttribute[] = [
      'distinct_agent',
      'intentional_purpose',
      'centralized_control',
    ]
    const gapHigh = calculateOntologicalDiscrepancyGap({
      selectedAttributes: naiveSelected,
      scenario,
    })
    expect(gapHigh).toBe(1.0)

    // Learner selects purely emergent attributes (0% gap, aligned with target)
    const emergentSelected: ProcessAttribute[] = [
      'disjoint_components',
      'random_interactions',
      'decentralized_control',
    ]
    const gapLow = calculateOntologicalDiscrepancyGap({
      selectedAttributes: emergentSelected,
      scenario,
    })
    expect(gapLow).toBe(0.0)

    // Mixed selection (2 direct, 2 emergent -> 0.5 gap)
    const mixedSelected: ProcessAttribute[] = [
      'distinct_agent',
      'intentional_purpose',
      'decentralized_control',
      'simultaneous_execution',
    ]
    const gapMixed = calculateOntologicalDiscrepancyGap({
      selectedAttributes: mixedSelected,
      scenario,
    })
    expect(gapMixed).toBe(0.5)
  })

  it('evaluates Posner Accommodation Index across conditions', () => {
    // Low conditions: satisfied with naive intuition
    const lowPosner = evaluatePosnerAccommodationIndex({
      dissatisfaction: 0.1,
      intelligibility: 0.2,
      plausibility: 0.2,
      fruitfulness: 0.1,
    })
    expect(lowPosner).toBeLessThan(0.2)

    // High conditions: fully primed for conceptual change
    const highPosner = evaluatePosnerAccommodationIndex({
      dissatisfaction: 0.9,
      intelligibility: 0.85,
      plausibility: 0.8,
      fruitfulness: 0.95,
    })
    expect(highPosner).toBeGreaterThanOrEqual(0.85)
  })

  it('detects Vosniadou synthetic model compromise risk', () => {
    // High risk: high intelligibility of scientific terms but zero dissatisfaction with naive belief
    const highRisk = detectSyntheticCompromiseRisk({
      discrepancyGap: 0.8,
      posnerConditions: {
        dissatisfaction: 0.05,
        intelligibility: 0.9,
        plausibility: 0.4,
        fruitfulness: 0.3,
      },
    })
    expect(highRisk).toBeGreaterThan(0.7)

    // Low risk: high dissatisfaction and low discrepancy gap
    const lowRisk = detectSyntheticCompromiseRisk({
      discrepancyGap: 0.1,
      posnerConditions: {
        dissatisfaction: 0.95,
        intelligibility: 0.9,
        plausibility: 0.85,
        fruitfulness: 0.9,
      },
    })
    expect(lowRisk).toBeLessThan(0.15)
  })

  it('calculates conceptual change readiness and tier progression', () => {
    // Naive direct realist
    const naiveReadiness = calculateConceptualChangeReadiness({
      posnerIndex: 0.15,
      discrepancyGap: 0.9,
      syntheticRisk: 0.8,
    })
    expect(naiveReadiness).toBeLessThan(0.4)
    expect(evaluateOntologicalMaturityTier(naiveReadiness)).toBe('naive_direct_realist')

    // Synthetic hybridizer
    const hybridReadiness = calculateConceptualChangeReadiness({
      posnerIndex: 0.5,
      discrepancyGap: 0.5,
      syntheticRisk: 0.6,
    })
    expect(hybridReadiness).toBeGreaterThanOrEqual(0.4)
    expect(hybridReadiness).toBeLessThan(0.6)
    expect(evaluateOntologicalMaturityTier(hybridReadiness)).toBe('synthetic_hybridizer')

    // Emergent ontologist
    const emergentReadiness = calculateConceptualChangeReadiness({
      posnerIndex: 0.9,
      discrepancyGap: 0.05,
      syntheticRisk: 0.1,
    })
    expect(emergentReadiness).toBeGreaterThanOrEqual(0.8)
    expect(evaluateOntologicalMaturityTier(emergentReadiness)).toBe('emergent_ontologist')
  })

  it('validates all 5 calibrated multidisciplinary misconception scenarios', () => {
    const domains = [
      'evolutionary_bio',
      'thermodynamics',
      'electromagnetism',
      'cellular_biophysics',
      'microeconomics',
    ]

    expect(CALIBRATED_MISCONCEPTION_SCENARIOS.length).toBe(5)

    for (const d of domains) {
      const sc = CALIBRATED_MISCONCEPTION_SCENARIOS.find((s) => s.domain === d)
      expect(sc).toBeDefined()
      expect(sc?.attributeContrasts.length).toBe(6) // 6 Chi attribute dimensions
      expect(sc?.refutationalAnomalies.length).toBeGreaterThanOrEqual(3)
      expect(sc?.naiveBeliefStatement.length).toBeGreaterThan(20)
      expect(sc?.scientificEmergentExplanation.length).toBeGreaterThan(50)
      expect(sc?.targetOntologicalBranch).toBe('emergent_process')
    }
  })

  it('verifies completeness of CANONICAL_ATTRIBUTE_CATALOG', () => {
    const attributes = Object.keys(CANONICAL_ATTRIBUTE_CATALOG) as ProcessAttribute[]
    expect(attributes.length).toBe(12)

    for (const attr of attributes) {
      const entry = CANONICAL_ATTRIBUTE_CATALOG[attr]
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.definition.length).toBeGreaterThan(0)
      expect(entry.cognitiveIndicator.length).toBeGreaterThan(0)
      expect([
        'agency',
        'intentionality',
        'control',
        'temporality',
        'hierarchy',
        'causation',
      ]).toContain(entry.category)
    }
  })

  it('verifies completeness of CANONICAL_PPRIM_CATALOG', () => {
    const pprims = Object.keys(CANONICAL_PPRIM_CATALOG)
    expect(pprims.length).toBe(6)

    for (const p of pprims) {
      const entry = CANONICAL_PPRIM_CATALOG[p as keyof typeof CANONICAL_PPRIM_CATALOG]
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.heuristicRule.length).toBeGreaterThan(0)
      expect(entry.naiveApplication.length).toBeGreaterThan(0)
      expect(entry.scientificRecontextualization.length).toBeGreaterThan(0)
    }
  })

  it('generates high-yield FSRS conceptual shift flashcards', () => {
    const scenario = CALIBRATED_MISCONCEPTION_SCENARIOS[1] // Thermodynamics
    const diagnosis = {
      scenarioId: scenario.id,
      learnerBranch: 'matter_entity' as const,
      targetBranch: 'emergent_process' as const,
      isOntologicalMismatch: true,
      discrepancyGap: 0.833,
      detectedPPrim: scenario.dominantPPrim,
      mentalModelStage: 'synthetic_compromise_model' as const,
      posnerAccommodationIndex: 0.65,
      syntheticCompromiseRisk: 0.45,
      conceptualShiftReadiness: 0.58,
    }

    const cards = generateFSRSConceptualShiftCards(scenario, diagnosis)

    expect(cards.length).toBe(6)
    expect(cards[0].scenarioDomain).toBe('thermodynamics')
    expect(cards[0].prompt).toContain('In terms of')
    expect(cards[0].naiveTrap).toContain('Naive Intuition')
    expect(cards[0].answer).toContain('Ontological Category Shift')
    expect(cards[0].ontologicalShiftRule).toContain('Chi Ontological Contrast')
  })
})

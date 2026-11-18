/**
 * Tests for Dual-Process Diagnostic & Cognitive Forcing Engine
 *
 * Verifies Stanovich reflective mind indices, Kahneman System 1/2 decoupling,
 * Croskerry cognitive forcing function compliance, and FSRS debiasing cards.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_DIAGNOSTIC_SCENARIOS,
  CANONICAL_COGNITIVE_BIAS_CATALOG,
  type CognitiveBiasType,
  calculateBiasVulnerabilityScore,
  calculateCognitiveDecouplingScore,
  calculateReflectiveMindIndex,
  evaluateReflectiveMindTier,
  generateFSRSDebiasingDeck,
} from '../src/dualprocess'

describe('Dual-Process Diagnostic & Cognitive Forcing Engine', () => {
  it('calculates Stanovich cognitive decoupling score across hypotheses, anomalies, and forcing steps', () => {
    // Zero decoupling case
    const zeroScore = calculateCognitiveDecouplingScore({
      hypothesesConsideredCount: 0,
      anomaliesDiscoveredCount: 0,
      forcingStepsCompletedCount: 0,
      totalForcingStepsCount: 4,
    })
    expect(zeroScore).toBe(0)

    // Partial decoupling case
    const partialScore = calculateCognitiveDecouplingScore({
      hypothesesConsideredCount: 2,
      anomaliesDiscoveredCount: 1,
      forcingStepsCompletedCount: 2,
      totalForcingStepsCount: 4,
    })
    // 0.35 * (2/3) + 0.35 * (1/3) + 0.30 * (2/4) = 0.35 * 1.0 + 0.15 = 0.50
    expect(partialScore).toBeCloseTo(0.5, 2)

    // Complete decoupling saturation
    const fullScore = calculateCognitiveDecouplingScore({
      hypothesesConsideredCount: 4,
      anomaliesDiscoveredCount: 5,
      forcingStepsCompletedCount: 4,
      totalForcingStepsCount: 4,
    })
    expect(fullScore).toBe(1.0)
  })

  it('calculates Croskerry bias vulnerability score with snap-judgement latency penalty', () => {
    // Snap judgement under 3000ms with 0 forcing completed
    const snapVulnerability = calculateBiasVulnerabilityScore({
      initialDecisionLatencyMs: 1400,
      forcingStepsCompletedCount: 0,
      totalForcingStepsCount: 4,
      anomaliesDiscoveredCount: 0,
      totalAnomaliesCount: 4,
    })
    // 1.0 + 0.35 - 0 = 1.35 clamped to 1.0
    expect(snapVulnerability).toBe(1.0)

    // Thorough deliberate evaluation with all forcing steps and anomalies discovered
    const mitigatedVulnerability = calculateBiasVulnerabilityScore({
      initialDecisionLatencyMs: 8500,
      forcingStepsCompletedCount: 4,
      totalForcingStepsCount: 4,
      anomaliesDiscoveredCount: 4,
      totalAnomaliesCount: 4,
    })
    // 1.0 + 0.05 - (0.55 * 1.0 + 0.40 * 1.0) = 1.05 - 0.95 = 0.10
    expect(mitigatedVulnerability).toBeCloseTo(0.1, 2)
  })

  it('evaluates Stanovich reflective mind index and tier transitions', () => {
    // Low performance: heuristic impulsive tier
    const lowIndex = calculateReflectiveMindIndex({
      cognitiveDecouplingScore: 0.2,
      biasVulnerabilityScore: 0.9,
      reflectiveOverrideOccurred: false,
      diagnosticAccuracyAchieved: false,
    })
    expect(lowIndex).toBeLessThan(0.4)
    expect(evaluateReflectiveMindTier(lowIndex)).toBe('heuristic_impulsive')

    // High performance: master diagnostician tier
    const masterIndex = calculateReflectiveMindIndex({
      cognitiveDecouplingScore: 0.95,
      biasVulnerabilityScore: 0.1,
      reflectiveOverrideOccurred: true,
      diagnosticAccuracyAchieved: true,
    })
    expect(masterIndex).toBeGreaterThanOrEqual(0.85)
    expect(evaluateReflectiveMindTier(masterIndex)).toBe('master_diagnostician')
  })

  it('validates emergency medicine chest pain scenario and cognitive forcing steps', () => {
    const medScenario = CALIBRATED_DIAGNOSTIC_SCENARIOS.find(
      (s) => s.id === 'emergency_medicine_chest_pain',
    )
    expect(medScenario).toBeDefined()
    expect(medScenario?.domain).toBe('emergency_medicine')
    expect(medScenario?.defaultSystem1DiagnosisId).toBe('stemi_acs')

    // Must possess an optimal target hypothesis that resolves the subtle anomalies
    const targetHypothesis = medScenario?.hypotheses.find((h) => h.isTargetOptimalSolution)
    expect(targetHypothesis?.id).toBe('type_a_aortic_dissection')
    expect(targetHypothesis?.lethalityOrRiskTier).toBe('catastrophic')

    // Must have at least 4 cognitive forcing steps
    expect(medScenario?.cognitiveForcingSteps.length).toBeGreaterThanOrEqual(4)
    expect(medScenario?.subtleAnomalies.length).toBeGreaterThanOrEqual(3)
  })

  it('validates distributed systems asymmetric network partition scenario', () => {
    const distScenario = CALIBRATED_DIAGNOSTIC_SCENARIOS.find(
      (s) => s.id === 'distributed_systems_consensus_partition',
    )
    expect(distScenario).toBeDefined()
    expect(distScenario?.domain).toBe('distributed_systems')
    expect(distScenario?.defaultSystem1DiagnosisId).toBe('redis_cache_exhaustion')

    const target = distScenario?.hypotheses.find((h) => h.isTargetOptimalSolution)
    expect(target?.id).toBe('asymmetric_raft_partition')
  })

  it('verifies bias catalog completeness and Croskerry antidotes', () => {
    const biases: CognitiveBiasType[] = [
      'premature_closure',
      'anchoring_adjustment',
      'search_satisficing',
      'confirmation_bias',
      'availability_heuristic',
      'base_rate_neglect',
      'framing_effect',
    ]

    for (const b of biases) {
      const entry = CANONICAL_COGNITIVE_BIAS_CATALOG[b]
      expect(entry).toBeDefined()
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.croskerryAntidote.length).toBeGreaterThan(10)
      expect(entry.primaryCFF).toBeDefined()
    }
  })

  it('generates high-yield FSRS debiasing flashcard decks', () => {
    const gpuScenario = CALIBRATED_DIAGNOSTIC_SCENARIOS.find(
      (s) => s.id === 'gpu_kernel_synchronization_stall',
    )!
    const deck = generateFSRSDebiasingDeck(gpuScenario)

    expect(deck.length).toBe(
      gpuScenario.cognitiveForcingSteps.length + gpuScenario.subtleAnomalies.length,
    )
    expect(deck[0].scenarioDomain).toBe('gpu_architecture')
    expect(deck[0].cognitiveMechanism).toContain('Stanovich Reflective Override')
    expect(deck[0].croskerryRule.length).toBeGreaterThan(10)
  })
})

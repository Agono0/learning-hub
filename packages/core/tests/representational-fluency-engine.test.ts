/**
 * Tests for Multi-Representational Fluency & Representational Competence Engine
 *
 * Verifies Ainsworth DeFT functions, Lesh translation model dimensions,
 * coordination gap calculations, and FSRS translation cards.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_REPRESENTATIONAL_PROBLEMS,
  CANONICAL_MODALITY_CATALOG,
  type RepresentationModality,
  calculateCrossModalCoherenceScore,
  calculateRepresentationalCoordinationGap,
  calculateRepresentationalFluencyIndex,
  evaluateRepresentationalFluencyTier,
  generateFSRSTranslationDeck,
} from '../src/representation'

describe('Multi-Representational Fluency & Representational Competence Engine', () => {
  it('calculates Ainsworth representational coordination gap', () => {
    // Zero challenges completed, 1 modality explored
    const highGap = calculateRepresentationalCoordinationGap({
      totalChallenges: 3,
      correctChallenges: 0,
      exploredModalitiesCount: 1,
    })
    // accuracy = 0; exploration = 0.2; gap = 1 - (0 + 0.08) = 0.92
    expect(highGap).toBeCloseTo(0.92, 2)

    // Complete accuracy and all 5 modalities explored
    const zeroGap = calculateRepresentationalCoordinationGap({
      totalChallenges: 3,
      correctChallenges: 3,
      exploredModalitiesCount: 5,
    })
    expect(zeroGap).toBe(0)
  })

  it('calculates cross-modal coherence score with latency penalty', () => {
    // High accuracy with swift translation latency (< 3s)
    const fastCoherence = calculateCrossModalCoherenceScore({
      totalChallenges: 3,
      correctChallenges: 3,
      averageTranslationLatencyMs: 2500,
    })
    expect(fastCoherence).toBe(1.0)

    // High accuracy but sluggish latency (> 18s)
    const slowCoherence = calculateCrossModalCoherenceScore({
      totalChallenges: 3,
      correctChallenges: 3,
      averageTranslationLatencyMs: 19000,
    })
    // 0.70 * 1.0 + 0.30 * 0.0 = 0.70
    expect(slowCoherence).toBe(0.7)
  })

  it('evaluates representational fluency index and tier thresholds', () => {
    // Unimodal novice tier (< 0.45)
    const noviceIndex = calculateRepresentationalFluencyIndex({
      totalChallenges: 3,
      correctChallenges: 1,
      exploredModalitiesCount: 1,
      crossModalCoherenceScore: 0.3,
      representationalCoordinationGap: 0.8,
    })
    expect(noviceIndex).toBeLessThan(0.45)
    expect(evaluateRepresentationalFluencyTier(noviceIndex)).toBe('unimodal_novice')

    // Polymath fluent tier (>= 0.85)
    const polymathIndex = calculateRepresentationalFluencyIndex({
      totalChallenges: 3,
      correctChallenges: 3,
      exploredModalitiesCount: 5,
      crossModalCoherenceScore: 0.95,
      representationalCoordinationGap: 0.05,
    })
    expect(polymathIndex).toBeGreaterThanOrEqual(0.85)
    expect(evaluateRepresentationalFluencyTier(polymathIndex)).toBe('polymath_fluent')
  })

  it('validates Shannon information entropy problem across all 5 modalities', () => {
    const entropyProblem = CALIBRATED_REPRESENTATIONAL_PROBLEMS.find(
      (p) => p.id === 'shannon_information_entropy',
    )
    expect(entropyProblem).toBeDefined()
    expect(entropyProblem?.domain).toBe('information_theory')

    const modalities: RepresentationModality[] = [
      'symbolic_formal',
      'computational_code',
      'visual_geometric',
      'concrete_physical',
      'verbal_narrative',
    ]

    for (const mod of modalities) {
      const artifact = entropyProblem?.artifacts[mod]
      expect(artifact).toBeDefined()
      expect(artifact?.content.length).toBeGreaterThan(20)
      expect(artifact?.keyElements.length).toBeGreaterThanOrEqual(3)
      expect(artifact?.cognitiveAffordance.length).toBeGreaterThan(10)
    }

    expect(entropyProblem?.translationChallenges.length).toBeGreaterThanOrEqual(3)
  })

  it('validates Kalman filter problem and Ainsworth DeFT functions', () => {
    const kalmanProblem = CALIBRATED_REPRESENTATIONAL_PROBLEMS.find(
      (p) => p.id === 'kalman_filter_state_estimation',
    )
    expect(kalmanProblem).toBeDefined()

    const deftFunctions = kalmanProblem?.translationChallenges.map((c) => c.deftFunction)
    expect(deftFunctions).toContain('constraining')
    expect(deftFunctions).toContain('complementary')
    expect(deftFunctions).toContain('constructing')
  })

  it('verifies canonical modality catalog completeness for all 5 Lesh modes', () => {
    const modalities: RepresentationModality[] = [
      'symbolic_formal',
      'computational_code',
      'visual_geometric',
      'concrete_physical',
      'verbal_narrative',
    ]

    for (const mod of modalities) {
      const entry = CANONICAL_MODALITY_CATALOG[mod]
      expect(entry).toBeDefined()
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.leshEquivalent.length).toBeGreaterThan(0)
      expect(entry.primaryStrength.length).toBeGreaterThan(10)
    }
  })

  it('generates high-yield FSRS cross-modal translation flashcards', () => {
    const backpropProblem = CALIBRATED_REPRESENTATIONAL_PROBLEMS.find(
      (p) => p.id === 'backpropagation_autodiff',
    )!
    const deck = generateFSRSTranslationDeck(backpropProblem)

    expect(deck.length).toBe(backpropProblem.translationChallenges.length)
    expect(deck[0].problemTitle).toContain('Backpropagation')
    expect(deck[0].isomorphismRule).toContain('Ainsworth DeFT')
    expect(deck[0].answer).toContain('Correct Mapping:')
  })
})

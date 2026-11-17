/**
 * @file packages/core/tests/cognitive-flexibility-engine.test.ts
 * @description Comprehensive unit tests for Cognitive Flexibility & Multi-Perspective Shifting.
 */

import { describe, expect, it } from 'vitest'
import {
  calculateCrissCrossDensity,
  calculatePerspectiveDispersionIndex,
  CALIBRATED_FLEXIBILITY_SUITES,
  CognitiveFlexibilitySession,
  evaluateCognitiveFlexibility,
} from '../src/flexibility/cognitive-flexibility-engine'

describe('Cognitive Flexibility & Perspective Shifting Engine', () => {
  it('calculates Shannon entropy Perspective Dispersion Index (PDI) accurately', () => {
    // 1. Single hat fixation (zero entropy)
    const fixatedHats = {
      white_hat: 10,
      red_hat: 0,
      black_hat: 0,
      yellow_hat: 0,
      green_hat: 0,
      blue_hat: 0,
    }
    expect(calculatePerspectiveDispersionIndex(fixatedHats)).toBe(0.0)

    // 2. Uniform distribution across all 6 hats (maximum entropy 1.0)
    const balancedHats = {
      white_hat: 2,
      red_hat: 2,
      black_hat: 2,
      yellow_hat: 2,
      green_hat: 2,
      blue_hat: 2,
    }
    expect(calculatePerspectiveDispersionIndex(balancedHats)).toBe(1.0)

    // 3. Partial dispersion
    const partialHats = {
      white_hat: 4,
      red_hat: 2,
      black_hat: 2,
      yellow_hat: 0,
      green_hat: 0,
      blue_hat: 0,
    }
    const partialPdi = calculatePerspectiveDispersionIndex(partialHats)
    expect(partialPdi).toBeGreaterThan(0.5)
    expect(partialPdi).toBeLessThan(0.7)
  })

  it('calculates landscape criss-cross density across thematic nodes', () => {
    const nodes = CALIBRATED_FLEXIBILITY_SUITES.distributed_chaos_cascade.primaryCase.thematicNodes
    expect(calculateCrissCrossDensity([], nodes)).toBe(0.0)
    expect(calculateCrissCrossDensity(['node_amplification'], nodes)).toBe(0.25)
    expect(
      calculateCrissCrossDensity(
        ['node_amplification', 'node_liveness_inversion', 'node_graceful_degradation'],
        nodes,
      ),
    ).toBe(0.75)
  })

  it('detects cognitive rigidity when learner remains trapped in a single thinking modality', () => {
    const suite = CALIBRATED_FLEXIBILITY_SUITES.distributed_chaos_cascade
    const rigidAttempts = [
      {
        caseId: suite.primaryCase.id,
        selectedHat: 'white_hat' as const,
        activeLens: 'mechanistic_technical' as const,
        studentObservations: 'Observing database lock metrics.',
        identifiedThematicNodeIds: ['node_amplification'],
        diagnosedReductiveTrapIds: [],
      },
      {
        caseId: suite.primaryCase.id,
        selectedHat: 'white_hat' as const,
        activeLens: 'mechanistic_technical' as const,
        studentObservations: 'Noticing p99 latency spike.',
        identifiedThematicNodeIds: ['node_amplification'],
        diagnosedReductiveTrapIds: [],
      },
    ]

    const evalResult = evaluateCognitiveFlexibility(suite, rigidAttempts)
    expect(evalResult.cognitiveRigidityWarning).toBe(true)
    expect(evalResult.perspectiveDispersionIndex).toBe(0.0)
    expect(evalResult.hatCoverageCount).toBe(1)
    expect(evalResult.feedbackSummary).toContain('Cognitive Rigidity Detected')
  })

  it('rewards multi-perspective landscape traversal and reductive trap diagnosis', () => {
    const suite = CALIBRATED_FLEXIBILITY_SUITES.distributed_chaos_cascade
    const flexibleAttempts = [
      {
        caseId: suite.primaryCase.id,
        selectedHat: 'white_hat' as const,
        activeLens: 'mechanistic_technical' as const,
        studentObservations: 'Database queue locks at 100%.',
        identifiedThematicNodeIds: ['node_amplification'],
        diagnosedReductiveTrapIds: ['trap_additivity_autoscaling'],
      },
      {
        caseId: suite.primaryCase.id,
        selectedHat: 'black_hat' as const,
        activeLens: 'ecological_systemic' as const,
        studentObservations: 'Liveness probes restart healthy pods, compounding stampede.',
        identifiedThematicNodeIds: ['node_liveness_inversion'],
        diagnosedReductiveTrapIds: ['trap_discrete_probe_health'],
      },
      {
        caseId: suite.primaryCase.id,
        selectedHat: 'yellow_hat' as const,
        activeLens: 'socio_economic' as const,
        studentObservations: 'Idempotent cache serves 92% of volume.',
        identifiedThematicNodeIds: ['node_graceful_degradation'],
        diagnosedReductiveTrapIds: ['trap_static_retry_timeout'],
      },
      {
        caseId: suite.primaryCase.id,
        selectedHat: 'green_hat' as const,
        activeLens: 'teleological_ethical' as const,
        studentObservations: 'Invert circuit breakers and introduce decorrelated jitter.',
        identifiedThematicNodeIds: ['node_backpressure_homeostasis'],
        diagnosedReductiveTrapIds: [],
      },
    ]

    const evalResult = evaluateCognitiveFlexibility(suite, flexibleAttempts)
    expect(evalResult.cognitiveRigidityWarning).toBe(false)
    expect(evalResult.hatCoverageCount).toBe(4)
    expect(evalResult.lensCoverageCount).toBe(4)
    expect(evalResult.crissCrossDensity).toBe(1.0)
    expect(evalResult.reductiveBiasMastery).toBe(100)
    expect(evalResult.cognitiveFlexibilityScore).toBeGreaterThanOrEqual(85)
    expect(evalResult.feedbackSummary).toContain('Exceptional Cognitive Flexibility')
  })

  it('manages full interactive state in CognitiveFlexibilitySession and exports FSRS cards', () => {
    const session = new CognitiveFlexibilitySession('distributed_chaos_cascade')
    expect(session.getSuite().id).toBe('distributed_chaos_cascade')

    session.setActiveHat('black_hat')
    expect(session.getActiveHat()).toBe('black_hat')

    session.setActiveLens('ecological_systemic')
    expect(session.getActiveLens()).toBe('ecological_systemic')

    session.recordStepAttempt({
      selectedHat: 'black_hat',
      activeLens: 'ecological_systemic',
      studentObservations: 'Analyzing cascade breakdown.',
      identifiedThematicNodeIds: ['node_amplification'],
      diagnosedReductiveTrapIds: ['trap_additivity_autoscaling'],
    })

    expect(session.getStepAttempts().length).toBe(1)
    const cards = session.exportFSRSCards()
    expect(cards.length).toBe(4)
    expect(cards[0].fsrsStabilityMultiplier).toBeGreaterThanOrEqual(1.0)
    expect(cards[0].promptFront).toContain('Perspective Shifting Challenge')
  })
})

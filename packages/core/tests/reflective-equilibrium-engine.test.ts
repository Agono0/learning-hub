/**
 * @file packages/core/tests/reflective-equilibrium-engine.test.ts
 * @description Unit tests for Reflective Equilibrium & Epistemic Calibration Engine.
 */

import { describe, expect, it } from 'vitest'
import {
  calculateBrierCalibration,
  calculateEpistemicGraphConnectivity,
  CALIBRATED_EQUILIBRIUM_SUITES,
  evaluateReflectiveEquilibrium,
  ReflectiveEquilibriumSession,
} from '../src/equilibrium/reflective-equilibrium-engine'

describe('Reflective Equilibrium & Epistemic Calibration Engine', () => {
  it('calculates Brier Score decomposition and overconfidence gap accurately', () => {
    // 1. Well-calibrated prediction set
    const predictions = [
      {
        propositionId: 'p1',
        propositionText: 'Raft consensus quorum prevents split brain',
        subjectiveConfidence: 0.8,
        actualOutcome: true,
        domainContext: 'Raft',
      },
      {
        propositionId: 'p2',
        propositionText: '2PC is non-blocking during coordinator failure',
        subjectiveConfidence: 0.8,
        actualOutcome: false,
        domainContext: '2PC',
      },
      {
        propositionId: 'p3',
        propositionText: 'Multi-Paxos has 1-RTT commits',
        subjectiveConfidence: 0.9,
        actualOutcome: true,
        domainContext: 'Paxos',
      },
    ]

    const metrics = calculateBrierCalibration(predictions)
    expect(metrics.brierScore).toBeGreaterThan(0.1)
    expect(metrics.brierCalibrationIndex).toBeLessThan(1.0)
    expect(metrics.empiricalAccuracyRate).toBe(0.67)
    expect(metrics.calibrationBuckets.length).toBe(5)
  })

  it('detects severe overconfidence bias when confidence vastly exceeds accuracy', () => {
    const overconfidentPredictions = [
      {
        propositionId: 'p1',
        propositionText: 'Overconfident guess 1',
        subjectiveConfidence: 0.95,
        actualOutcome: false,
        domainContext: 'Speculation',
      },
      {
        propositionId: 'p2',
        propositionText: 'Overconfident guess 2',
        subjectiveConfidence: 0.95,
        actualOutcome: false,
        domainContext: 'Speculation',
      },
      {
        propositionId: 'p3',
        propositionText: 'Overconfident guess 3',
        subjectiveConfidence: 0.9,
        actualOutcome: true,
        domainContext: 'Speculation',
      },
    ]

    const metrics = calculateBrierCalibration(overconfidentPredictions)
    expect(metrics.overconfidenceGap).toBeGreaterThan(0.25)
    expect(metrics.calibrationGrade).toBe('Severe Dunning-Kruger')
  })

  it('evaluates Wide Reflective Equilibrium coherence gain across dissonant triads', () => {
    const suite = CALIBRATED_EQUILIBRIUM_SUITES.distributed_consensus_wre

    // Unresolved initial state
    const initialState = {
      suiteId: suite.id,
      activeAdjustments: {},
      resolvedTriadStrategies: {},
      recordedPredictions: suite.predictionBank,
    }
    const evalInitial = evaluateReflectiveEquilibrium(suite, initialState)
    expect(evalInitial.isEquilibriumAchieved).toBe(false)
    expect(evalInitial.unresolvedContradictionCount).toBe(1)
    expect(evalInitial.feedbackSummary).toContain('Dissonant Triads Remaining')

    // Resolved state
    const resolvedState = {
      suiteId: suite.id,
      activeAdjustments: {},
      resolvedTriadStrategies: {
        triad_cap_serializability_dilemma: 'reformulate_theory' as const,
      },
      recordedPredictions: suite.predictionBank,
    }
    const evalResolved = evaluateReflectiveEquilibrium(suite, resolvedState)
    expect(evalResolved.isEquilibriumAchieved).toBe(true)
    expect(evalResolved.unresolvedContradictionCount).toBe(0)
    expect(evalResolved.coherenceIndex).toBeGreaterThanOrEqual(80)
    expect(evalResolved.feedbackSummary).toContain('Wide Reflective Equilibrium Achieved')
  })

  it('manages interactive session state and exports calibrated FSRS cards', () => {
    const session = new ReflectiveEquilibriumSession('distributed_consensus_wre')
    expect(session.getSuite().id).toBe('distributed_consensus_wre')

    session.resolveTriad('triad_cap_serializability_dilemma', 'revise_principle')
    session.adjustNodeConfidence('node_principle_serializability', 0.8)

    const evaluation = session.evaluateProgress()
    expect(evaluation.isEquilibriumAchieved).toBe(true)

    const cards = session.exportFSRSCards()
    expect(cards.length).toBe(1)
    expect(cards[0].fsrsStabilityMultiplier).toBeGreaterThanOrEqual(1.0)
    expect(cards[0].conflictPrompt).toContain('Conflicting Principle (P)')
    expect(cards[0].equilibriumResolution).toContain('Equilibrium Synthesis')
  })

  it('calculates epistemic network graph topological connectivity', () => {
    const suite = CALIBRATED_EQUILIBRIUM_SUITES.distributed_consensus_wre
    const connectivity = calculateEpistemicGraphConnectivity(suite)

    expect(connectivity.totalNodes).toBe(5)
    expect(connectivity.totalEdges).toBe(5)
    expect(connectivity.isFullyConnected).toBe(true)
    expect(connectivity.isolatedNodeCount).toBe(0)
    expect(connectivity.graphDensity).toBeGreaterThan(0.4)
  })

  it('evaluates biomedical triage crisis equilibrium suite (Emanuel 2020 NEJM)', () => {
    const suite = CALIBRATED_EQUILIBRIUM_SUITES.medical_triage_ethics_wre
    expect(suite.dissonantTriads.length).toBe(1)

    const session = new ReflectiveEquilibriumSession('medical_triage_ethics_wre')
    session.resolveTriad('triad_ventilator_allocation_dilemma', 'reformulate_theory')

    const evaluation = session.evaluateProgress()
    expect(evaluation.isEquilibriumAchieved).toBe(true)
    expect(evaluation.coherenceIndex).toBeGreaterThanOrEqual(80)

    const cards = session.exportFSRSCards()
    expect(cards.length).toBe(1)
    expect(cards[0].domain).toContain('Biomedical Ethics')
  })
})

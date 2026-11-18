/**
 * Unit Tests for Cognitive Apprenticeship & Expert Modeling Engine
 *
 * Grounded in:
 * - Allan Collins, John Seely Brown & Susan E. Newman (1989) Cognitive Apprenticeship
 * - Jean Lave & Etienne Wenger (1991) Legitimate Peripheral Participation (LPP)
 */

import { describe, expect, it } from 'vitest'
import {
  calculateFadingIndex,
  calculateTacitExtractionRate,
  CognitiveApprenticeshipSession,
  determineParticipationLevel,
} from '../src/apprenticeship/cognitive-apprenticeship-engine'

describe('Cognitive Apprenticeship & Expert Modeling Engine', () => {
  it('calculates tacit knowledge extraction rate based on unlocked principles and articulation scores', () => {
    // 0 principles unlocked
    const zero = calculateTacitExtractionRate(0, 4, [0.5, 0.5])
    expect(zero).toBe(0.2) // 0 * 0.6 + 0.5 * 0.4 = 0.2

    // 2 of 4 principles unlocked, 100% articulation
    const half = calculateTacitExtractionRate(2, 4, [1.0, 1.0])
    expect(half).toBe(0.7) // 0.5 * 0.6 + 1.0 * 0.4 = 0.7

    // 4 of 4 principles unlocked, 100% articulation
    const full = calculateTacitExtractionRate(4, 4, [1.0, 1.0])
    expect(full).toBe(1.0)
  })

  it('calculates pedagogical fading index across Collins Brown stages', () => {
    // Modeling stage: stage weight 0.1, 0 articulations
    const modeling = calculateFadingIndex('modeling', 0, 4)
    expect(modeling).toBe(0.06) // 0.1 * 0.6 = 0.06

    // Scaffolding stage with 2 of 4 completed
    const scaffolding = calculateFadingIndex('scaffolding', 2, 4)
    expect(scaffolding).toBe(0.47) // 0.45 * 0.6 + 0.5 * 0.4 = 0.27 + 0.2 = 0.47

    // Exploration stage: stage weight 1.0, all completed
    const exploration = calculateFadingIndex('exploration', 4, 4)
    expect(exploration).toBe(1.0)
  })

  it('determines legitimate peripheral participation (LPP) levels (Lave & Wenger 1991)', () => {
    expect(determineParticipationLevel(0.1, 0.2)).toBe('peripheral_observer')
    expect(determineParticipationLevel(0.4, 0.5)).toBe('guided_contributor')
    expect(determineParticipationLevel(0.7, 0.75)).toBe('autonomous_practitioner')
    expect(determineParticipationLevel(0.9, 0.95)).toBe('master_modeler')
  })

  it('coordinates full Raft consensus cognitive apprenticeship session', () => {
    const session = new CognitiveApprenticeshipSession('distributed_consensus_raft')
    const suite = session.getSuite()

    expect(session.getCurrentStage()).toBe('modeling')
    expect(suite.traces.length).toBe(3)
    expect(suite.principles.length).toBe(4)

    // Observe step 1 trace
    const observed = session.observeTrace('trace_raft_step1_election')
    expect(observed).toBe(true)

    // Submit accurate articulation for prompt 1
    const res = session.submitArticulation('prompt_raft_election_timeout', 'opt_raft_p1_shatter')
    expect(res.isAccurate).toBe(true)
    expect(res.score).toBe(1.0)
    expect(res.newlyUnlockedPrinciple?.id).toBe('principle_randomized_symmetry_breaking')

    // Submit inaccurate articulation for prompt 2
    const resErr = session.submitArticulation('prompt_raft_figure8_commit', 'opt_raft_p3_storage')
    expect(resErr.isAccurate).toBe(false)
    expect(resErr.score).toBe(0.1)

    // Complete reflection contrast
    const refDone = session.completeReflection('contrast_raft_split_brain')
    expect(refDone).toBe(true)

    // Check session metrics
    const metrics = session.getMetrics()
    expect(metrics.totalTracesObserved).toBe(1)
    expect(metrics.totalArticulationsAttempted).toBe(2)
    expect(metrics.extractedPrincipleCount).toBe(1)
    expect(metrics.completedReflectionsCount).toBe(1)

    // Export FSRS cards
    const cards = session.exportFSRSCards()
    expect(cards.length).toBe(4)
    const extractedCard = cards.find(
      (c) => c.principleId === 'principle_randomized_symmetry_breaking',
    )
    expect(extractedCard?.recommendedStabilityMultiplier).toBe(1.4)
  })

  it('verifies Zero-Knowledge SNARKs and QAP apprenticeship suite', () => {
    const session = new CognitiveApprenticeshipSession('zero_knowledge_snarks')
    const suite = session.getSuite()

    expect(suite.traces.length).toBe(2)
    expect(suite.principles.length).toBe(3)

    // Test R1CS addition articulation
    const res = session.submitArticulation('prompt_snark_r1cs_addition', 'opt_snark_p1_free_add')
    expect(res.isAccurate).toBe(true)
    expect(res.newlyUnlockedPrinciple?.id).toBe('principle_algebraic_encoding')
  })

  it('verifies Aerospace GNC Kalman Filter fusion suite', () => {
    const session = new CognitiveApprenticeshipSession('aerospace_fault_tolerant_gnc')
    const suite = session.getSuite()

    expect(suite.traces.length).toBe(1)
    expect(suite.principles.length).toBe(2)

    // Test Joseph form articulation
    const res = session.submitArticulation('prompt_gnc_joseph_form', 'opt_gnc_p1_joseph')
    expect(res.isAccurate).toBe(true)
    expect(res.feedback).toContain('Joseph form guarantees valid variances')
    expect(res.newlyUnlockedPrinciple?.id).toBe('principle_joseph_covariance_stabilization')
  })
})

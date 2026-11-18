/**
 * Unit Tests for Self-Regulated Learning (SRL) & Metacognitive Matrix Engine
 *
 * Grounded in:
 * - Barry J. Zimmerman (2000, 2002) Tripartite Cyclical Model (Forethought, Performance, Self-Reflection)
 * - Paul R. Pintrich (2004) Self-Regulated Learning Phases & Domains
 * - Philip H. Winne & Peter A. Hadwin (1998) COPES Model
 * - Bernard Weiner (1985, 1986) Causal Attribution Dimensions
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_SRL_CHALLENGES,
  calculateGoalAttainmentScale,
  calculateSRLMaturityIndex,
  CANONICAL_CAUSAL_ATTRIBUTIONS,
  evaluateSRLMaturityTier,
  SelfRegulatedLearningSession,
} from '../src/srl/self-regulated-learning-engine'

describe('Self-Regulated Learning & Metacognitive Matrix Engine', () => {
  it('calculates Zimmerman cyclical SRL maturity index across phases', () => {
    // Naive regulator with minimal forethought, low volitional control, poor attribution
    const naive = calculateSRLMaturityIndex(0.2, 0.1, 0.2)
    expect(naive).toBeLessThan(0.4)
    expect(evaluateSRLMaturityTier(naive)).toBe('naive_regulator')

    // Emerging regulator
    const emerging = calculateSRLMaturityIndex(0.6, 0.5, 0.5)
    expect(emerging).toBeGreaterThanOrEqual(0.45)
    expect(emerging).toBeLessThan(0.65)
    expect(evaluateSRLMaturityTier(emerging)).toBe('emerging_regulator')

    // Autonomous master with optimal forethought, full volitional control, internal-controllable attribution
    const master = calculateSRLMaturityIndex(1.0, 1.0, 1.0)
    expect(master).toBe(1.0)
    expect(evaluateSRLMaturityTier(master)).toBe('autonomous_master')
  })

  it('calculates Goal Attainment Scaling (GAS) based on execution and attribution adaptiveness', () => {
    // Inaccurate external attribution with poor performance -> -2
    expect(calculateGoalAttainmentScale(0.2, false, 0.3)).toBe(-2)

    // Moderate struggle -> -1
    expect(calculateGoalAttainmentScale(0.35, true, 0.4)).toBe(-1)

    // Expected outcome achieved -> 0
    expect(calculateGoalAttainmentScale(0.6, true, 0.6)).toBe(0)

    // More than expected -> +1
    expect(calculateGoalAttainmentScale(0.8, true, 0.8)).toBe(1)

    // Much more than expected -> +2
    expect(calculateGoalAttainmentScale(0.95, true, 0.95)).toBe(2)
  })

  it('coordinates full Zimmerman cyclical SRL session on Distributed Systems consensus challenge', () => {
    const session = new SelfRegulatedLearningSession('distributed_systems_consensus')
    const challenge = session.getChallenge()

    expect(challenge.title).toContain('Formal Verification of Raft')
    expect(challenge.volitionalCheckpoints.length).toBe(3)

    // Phase 1: Forethought
    expect(session.getActivePhase()).toBe('forethought')
    session.setGoalOrientation('mastery_approach')
    session.setGoalStatement(
      'Exhaustively model partition quorums and verify ElectionSafety inductive invariant.',
    )
    session.updateCopes({
      conditions: '3-node asynchronous network with uncoordinated partitions',
    })

    const m1 = session.getMetrics()
    expect(m1.isForethoughtComplete).toBe(true)
    expect(m1.forethoughtPlanningQuality).toBe(1.0)

    // Phase 2: Performance & Volitional Control
    session.setActivePhase('performance_control')
    expect(session.getActivePhase()).toBe('performance_control')

    const toggled1 = session.toggleVolitionalCheckpoint('vol_state_space_explosion')
    expect(toggled1).toBe(true)
    const toggled2 = session.toggleVolitionalCheckpoint('vol_tla_syntax_friction')
    expect(toggled2).toBe(true)

    const m2 = session.getMetrics()
    expect(m2.isPerformanceComplete).toBe(true)
    expect(m2.volitionalControlEfficiency).toBeGreaterThan(0.6)

    // Phase 3: Self-Reflection & Attribution
    session.setActivePhase('self_reflection')
    const chosen = session.selectCausalAttribution('strategic_effort')
    expect(chosen.locus).toBe('internal')
    expect(chosen.controllability).toBe('controllable')
    expect(chosen.adaptiveScore).toBe(1.0)

    session.setSelfEvaluation(
      0.9,
      'Next cycle: introduce packet duplication and term leap-frogging scenarios.',
    )

    const m3 = session.getMetrics()
    expect(m3.isReflectionComplete).toBe(true)
    expect(m3.completedPhasesCount).toBe(3)
    expect(m3.cyclicalMaturityIndex).toBeGreaterThan(0.8)
    expect(m3.currentMaturityTier).toBe('autonomous_master')
    expect(m3.goalAttainmentScale).toBeGreaterThanOrEqual(1)

    // Export FSRS flashcards
    const cards = session.exportFSRSCards()
    expect(cards.length).toBe(2)
    expect(cards[0].zimmermanCyclePhase).toBe('forethought')
    expect(cards[1].zimmermanCyclePhase).toBe('self_reflection')
    expect(cards[0].recommendedStabilityMultiplier).toBeGreaterThan(1.4)
  })

  it('validates FlashAttention-2 Triton GPU computing challenge scenario', () => {
    const session = new SelfRegulatedLearningSession('deep_learning_transformer_attention')
    const challenge = session.getChallenge()

    expect(challenge.complexityLevel).toBe('mastery')
    expect(challenge.defaultCopes.operations).toContain('Tile sequence lengths')

    session.toggleVolitionalCheckpoint('vol_numerical_instability_nan')
    session.toggleVolitionalCheckpoint('vol_shared_memory_spill')
    session.toggleVolitionalCheckpoint('vol_boundary_masking_overhead')

    const metrics = session.getMetrics()
    expect(metrics.volitionalControlEfficiency).toBe(1.0)
  })

  it('verifies Weiner attribution taxonomy completeness and adaptiveness ratings', () => {
    expect(CANONICAL_CAUSAL_ATTRIBUTIONS.strategic_effort.adaptiveScore).toBe(1.0)
    expect(CANONICAL_CAUSAL_ATTRIBUTIONS.inherent_genius.adaptiveScore).toBeLessThan(0.3)
    expect(CANONICAL_CAUSAL_ATTRIBUTIONS.arbitrary_luck.adaptiveScore).toBe(0.1)

    for (const challenge of Object.values(CALIBRATED_SRL_CHALLENGES)) {
      expect(challenge.volitionalCheckpoints.length).toBeGreaterThanOrEqual(2)
      expect(challenge.attributionOptions.length).toBeGreaterThanOrEqual(3)
      expect(challenge.expertForethoughtHeuristic).toBeTruthy()
      expect(challenge.expertSelfReflectionPrompt).toBeTruthy()
    }
  })
})

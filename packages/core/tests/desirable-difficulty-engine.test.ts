/**
 * @file desirable-difficulty-engine.test.ts
 * @description Unit and mathematical property tests for Bjork & Bjork (2011) and Slamecka & Graf (1978)
 * Desirable Difficulties & Multi-Ladder Retrieval Generation Engine.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_GENERATION_CHALLENGES,
  calculateCognitiveEffortIndex,
  calculateRetrievalStrengthDecay,
  calculateStorageHalfLifeHours,
  calculateStorageStrengthDelta,
  classifyBjorkQuadrant,
  DesirableDifficultySession,
  exportGenerativeChallengesToFSRSCards,
} from '../src/generation/desirable-difficulty-engine'

describe('Bjork Storage Strength vs Retrieval Strength Dynamics', () => {
  it('correctly categorizes memory into Bjork 4 quadrants', () => {
    expect(classifyBjorkQuadrant(80, 0.9)).toBe('high_ss_high_rs')
    expect(classifyBjorkQuadrant(70, 0.3)).toBe('high_ss_low_rs')
    expect(classifyBjorkQuadrant(20, 0.2)).toBe('low_ss_low_rs')
    expect(classifyBjorkQuadrant(25, 0.85)).toBe('low_ss_high_rs')
  })

  it('calculates monotonic super-linear storage half-life', () => {
    const h1 = calculateStorageHalfLifeHours(10)
    const h50 = calculateStorageHalfLifeHours(50)
    const h90 = calculateStorageHalfLifeHours(90)

    expect(h1).toBeGreaterThan(24)
    expect(h50).toBeGreaterThan(h1)
    expect(h90).toBeGreaterThan(h50)
  })

  it('accurately decays retrieval strength over elapsed time based on half-life', () => {
    const initialRS = 0.8
    const storageStrength = 50
    const halfLife = calculateStorageHalfLifeHours(storageStrength)

    const rs0 = calculateRetrievalStrengthDecay(initialRS, storageStrength, 0)
    expect(rs0).toBe(initialRS)

    const rsHalfLife = calculateRetrievalStrengthDecay(initialRS, storageStrength, halfLife)
    expect(rsHalfLife).toBeCloseTo(0.4, 2)

    const rsDoubleHalfLife = calculateRetrievalStrengthDecay(
      initialRS,
      storageStrength,
      halfLife * 2,
    )
    expect(rsDoubleHalfLife).toBeCloseTo(0.2, 2)
  })

  it('satisfies Bjork inverse accessibility rule: lower RS yields higher storage delta', () => {
    // When SS = 50, compare successful retrieval when RS = 0.1 vs RS = 0.9
    const deltaLowRS = calculateStorageStrengthDelta({
      storageStrength: 50,
      retrievalStrength: 0.1,
      tier: 'stem_completion',
      isCorrect: true,
    })

    const deltaHighRS = calculateStorageStrengthDelta({
      storageStrength: 50,
      retrievalStrength: 0.9,
      tier: 'stem_completion',
      isCorrect: true,
    })

    expect(deltaLowRS).toBeGreaterThan(deltaHighRS)
  })

  it('scales storage strength delta with higher generation tiers', () => {
    const deltaStem = calculateStorageStrengthDelta({
      storageStrength: 40,
      retrievalStrength: 0.4,
      tier: 'stem_completion',
      isCorrect: true,
    })

    const deltaAnagram = calculateStorageStrengthDelta({
      storageStrength: 40,
      retrievalStrength: 0.4,
      tier: 'semantic_anagram',
      isCorrect: true,
    })

    const deltaReverse = calculateStorageStrengthDelta({
      storageStrength: 40,
      retrievalStrength: 0.4,
      tier: 'reverse_query',
      isCorrect: true,
    })

    const deltaAnalogy = calculateStorageStrengthDelta({
      storageStrength: 40,
      retrievalStrength: 0.4,
      tier: 'analogy_synthesis',
      isCorrect: true,
    })

    expect(deltaAnagram).toBeGreaterThan(deltaStem)
    expect(deltaReverse).toBeGreaterThan(deltaAnagram)
    expect(deltaAnalogy).toBeGreaterThan(deltaReverse)
  })

  it('calculates Cognitive Effort Index (CEI) across tiers and latencies', () => {
    const effortTier1Fast = calculateCognitiveEffortIndex({
      tier: 'stem_completion',
      latencyMs: 1000,
      similarityScore: 0.9,
    })

    const effortTier4Deep = calculateCognitiveEffortIndex({
      tier: 'analogy_synthesis',
      latencyMs: 6000,
      similarityScore: 0.85,
    })

    expect(effortTier1Fast).toBeGreaterThanOrEqual(25)
    expect(effortTier4Deep).toBeGreaterThan(effortTier1Fast)
    expect(effortTier4Deep).toBeLessThanOrEqual(100)
  })
})

describe('DesirableDifficultySession State Machine & Calibrated Bank', () => {
  it('initializes session with calibrated challenges and correct initial memory states', () => {
    const session = new DesirableDifficultySession()
    const state = session.getState()

    expect(state.challengeIds.length).toBeGreaterThanOrEqual(3)
    expect(state.currentTier).toBe('stem_completion')
    expect(state.isEvaluated).toBe(false)
    expect(state.memoryStates['raft_consensus_invariants']?.quadrant).toBe('high_ss_low_rs')
    expect(state.memoryStates['brian_koriat_fluency']?.quadrant).toBe('low_ss_high_rs')
  })

  it('processes accurate generation attempt, updates RS/SS, and registers desirable difficulty', () => {
    const session = new DesirableDifficultySession()
    session.selectChallenge('raft_consensus_invariants')

    const challenge = CALIBRATED_GENERATION_CHALLENGES['raft_consensus_invariants']!
    const expected = challenge.rungs.stem_completion.targetExpected

    session.setUserAttempt(expected)
    const telemetry = session.evaluateAttempt(4000)

    expect(telemetry.isCorrect).toBe(true)
    expect(telemetry.similarityScore).toBe(1.0)
    expect(telemetry.isDesirablyDifficult).toBe(true) // Initial RS was 0.35 (< 0.6)
    expect(telemetry.retentionMultiplier).toBeGreaterThan(1.2)
    expect(telemetry.storageStrengthAfter).toBeGreaterThan(telemetry.storageStrengthBefore)
    expect(telemetry.retrievalStrengthAfter).toBeGreaterThan(telemetry.retrievalStrengthBefore)

    const updatedState = session.getState()
    expect(updatedState.isEvaluated).toBe(true)
    expect(updatedState.history.length).toBe(1)
  })

  it('exports evaluated history into FSRS flashcards with scaled initial stability', () => {
    const session = new DesirableDifficultySession()
    session.selectChallenge('transformer_self_attention')
    session.setTier('reverse_query')

    const challenge = CALIBRATED_GENERATION_CHALLENGES['transformer_self_attention']!
    session.setUserAttempt(challenge.rungs.reverse_query.targetExpected)
    session.evaluateAttempt(5000)

    const cards = exportGenerativeChallengesToFSRSCards(session)
    expect(cards.length).toBe(1)
    const card = cards[0]!

    expect(card.front).toContain('Tier 3: REVERSE QUERY')
    expect(card.front).toContain('Scaled Dot-Product Matrix Formulation')
    expect(card.back).toContain('Attention(Q, K, V)')
    expect(card.suggestedInitialStability).toBeGreaterThan(3.0)
    expect(card.tags).toContain('generation-effect')
    expect(card.tags).toContain('desirable-difficulty')
  })
})

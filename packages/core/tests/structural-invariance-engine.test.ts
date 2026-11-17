/**
 * @file structural-invariance-engine.test.ts
 * @description Unit tests for Rohrer & Taylor (2007) and Kornell & Bjork (2008) Interleaved Problem Solving & Structural Invariance Engine.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_INTERLEAVED_PROBLEMS,
  computeDeepStructuralDistance,
  computeSurfaceFeatureDistance,
  evaluateDiscriminationAttempt,
  exportInterleavedToFSRSCards,
  InterleavedDiscriminationSession,
} from '../src/interleaving/structural-invariance-engine'

describe('Rohrer & Taylor (2007) Interleaving & Cognitive Distance Metrics', () => {
  it('computes surface distance and deep structural distance correctly', () => {
    const p1 = CALIBRATED_INTERLEAVED_PROBLEMS.knapsack_01_dp!
    const p2 = CALIBRATED_INTERLEAVED_PROBLEMS.knapsack_fractional_greedy!

    // Both problems discuss capacities, items, and maximizing value (low surface distance)
    const surfaceDist = computeSurfaceFeatureDistance(p1, p2)
    expect(surfaceDist).toBeLessThan(0.9)

    // But they have opposing algorithmic schemas: DP vs Greedy (high deep structural distance)
    const deepDist = computeDeepStructuralDistance(p1, p2)
    expect(deepDist).toBeGreaterThanOrEqual(0.85)

    // Problem against itself has zero distance
    expect(computeSurfaceFeatureDistance(p1, p1)).toBe(0)
    expect(computeDeepStructuralDistance(p1, p1)).toBe(0)
  })

  it('rewards deep invariant identification and penalizes surface decoy traps', () => {
    const prob = CALIBRATED_INTERLEAVED_PROBLEMS.knapsack_01_dp!

    // 1. Learner identifies DP and articulates non-divisible state overlap invariant
    const correctAttempt = {
      problemId: prob.id,
      selectedCategory: 'dynamic_programming' as const,
      selectedStrategyName: prob.canonicalStrategyName,
      learnerJustification:
        'Because instruments are indivisible discrete items, greedy density sorting leaves stranded capacity gaps. Optimal substructure with non-divisible state overlap requires Bellman dynamic programming.',
      confidenceRating: 5,
      timeSpentMs: 14200,
    }

    const correctTelemetry = evaluateDiscriminationAttempt(prob, correctAttempt)
    expect(correctTelemetry.isCategoryCorrect).toBe(true)
    expect(correctTelemetry.isDecoyTrapped).toBe(false)
    expect(correctTelemetry.structuralDiscriminationScore).toBeGreaterThanOrEqual(70)
    expect(correctTelemetry.fsrsStabilityBonus).toBeGreaterThanOrEqual(1.8)
    expect(correctTelemetry.feedbackMessage).toContain('Mastery achieved')

    // 2. Learner falls for the surface decoy (greedy ratio sort)
    const decoyAttempt = {
      problemId: prob.id,
      selectedCategory: prob.decoyTrap.decoyCategory,
      selectedStrategyName: prob.decoyTrap.decoyStrategyName,
      learnerJustification:
        'Sort descending by telemetry value to mass ratio and greedily pack until full.',
      confidenceRating: 4,
      timeSpentMs: 8500,
    }

    const decoyTelemetry = evaluateDiscriminationAttempt(prob, decoyAttempt)
    expect(decoyTelemetry.isCategoryCorrect).toBe(false)
    expect(decoyTelemetry.isDecoyTrapped).toBe(true)
    expect(decoyTelemetry.surfaceBiasPenalty).toBeGreaterThanOrEqual(0.5)
    expect(decoyTelemetry.structuralDiscriminationScore).toBeLessThan(30)
    expect(decoyTelemetry.feedbackMessage).toContain('Surface Decoy Trap')
    expect(decoyTelemetry.deepRemediationAdvice).toContain('items cannot be split')
  })

  it('discriminates between Dijkstra and Bellman-Ford on negative edge weight tolerance', () => {
    const dijkstraProb = CALIBRATED_INTERLEAVED_PROBLEMS.shortest_path_dijkstra!
    const bellmanProb = CALIBRATED_INTERLEAVED_PROBLEMS.shortest_path_bellman_ford!
    expect(dijkstraProb.correctCategory).toBe('shortest_path_dijkstra')

    // Correct Bellman-Ford attempt on negative arbitrage graph
    const bellmanAttempt = {
      problemId: bellmanProb.id,
      selectedCategory: 'shortest_path_bellman_ford' as const,
      selectedStrategyName: bellmanProb.canonicalStrategyName,
      learnerJustification:
        'Negative logarithms produce negative edge weights. Dijkstra greedy vertex settlement assumption fails, requiring Bellman-Ford dynamic edge relaxation passes.',
      confidenceRating: 5,
      timeSpentMs: 12000,
    }

    const telemetry = evaluateDiscriminationAttempt(bellmanProb, bellmanAttempt)
    expect(telemetry.isCategoryCorrect).toBe(true)
    expect(telemetry.structuralDiscriminationScore).toBeGreaterThanOrEqual(70)
  })
})

describe('InterleavedDiscriminationSession State Machine & Sequence Generation', () => {
  it('generates adaptive contrast sequences pairing opposing problems back-to-back', () => {
    const session = new InterleavedDiscriminationSession(
      CALIBRATED_INTERLEAVED_PROBLEMS,
      'adaptive_contrast',
    )
    const state = session.getState()

    expect(state.problemIds.length).toBe(Object.keys(CALIBRATED_INTERLEAVED_PROBLEMS).length)
    expect(session.getCurrentProblem()).not.toBeNull()

    // In adaptive contrast, 0/1 knapsack is juxtaposed with fractional knapsack or similar contrast
    const firstProb = session.getCurrentProblem()!
    const advanced = session.advance()
    expect(advanced).toBe(true)

    const secondProb = session.getCurrentProblem()!
    expect(secondProb.correctCategory).not.toBe(firstProb.correctCategory)
  })

  it('updates confusion matrix and Rohrer Discrimination Index across multi-problem session', () => {
    const session = new InterleavedDiscriminationSession(CALIBRATED_INTERLEAVED_PROBLEMS, 'blocked')
    const prob1 = session.getCurrentProblem()!

    session.recordAttempt({
      problemId: prob1.id,
      selectedCategory: prob1.correctCategory,
      selectedStrategyName: prob1.canonicalStrategyName,
      learnerJustification:
        'Optimal substructure and non-divisible state overlap governing principle.',
      confidenceRating: 5,
      timeSpentMs: 15000,
    })

    const state = session.getState()
    expect(state.overallMetrics.totalAttempts).toBe(1)
    expect(state.overallMetrics.correctCategories).toBe(1)
    expect(state.overallMetrics.rohrerDiscriminationIndex).toBeGreaterThan(60)
    expect(state.confusionMatrix[prob1.correctCategory]?.[prob1.correctCategory]).toBe(1)
  })

  it('exports evaluated discrimination pairs into high-yield FSRS contrast review cards', () => {
    const session = new InterleavedDiscriminationSession()
    const prob = session.getCurrentProblem()!

    session.recordAttempt({
      problemId: prob.id,
      selectedCategory: prob.correctCategory,
      selectedStrategyName: prob.canonicalStrategyName,
      learnerJustification: 'Correct governing principle and non-divisible discrete invariant.',
      confidenceRating: 5,
      timeSpentMs: 11000,
    })

    const cards = exportInterleavedToFSRSCards(session)
    expect(cards.length).toBe(1)

    const card = cards[0]!
    expect(card.front).toContain('Interleaved Problem Discrimination')
    expect(card.back).toContain('Governing Invariant')
    expect(card.back).toContain('Why the Decoy')
    expect(card.suggestedStabilityDays).toBeGreaterThan(5.0)
    expect(card.tags).toContain('interleaved-practice')
  })
})

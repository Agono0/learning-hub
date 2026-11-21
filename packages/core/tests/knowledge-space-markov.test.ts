/**
 * @file knowledge-space-markov.test.ts
 * @description Unit tests for Stochastic & Markovian Adaptive Testing Engine
 *
 * Grounded in:
 * - Jean-Claude Falmagne & Jean-Paul Doignon (1988) "A Class of Markov Chains for Adaptive Assessment"
 * - Bayesian belief distribution updating under slip (β) and guess (η) noise
 * - Half-split bisection and Shannon information gain item selection
 */

import { describe, expect, it } from 'vitest'
import {
  initializeMarkovianSession,
  updateBeliefPosterior,
  selectOptimalNextItem,
  diagnoseLearner,
} from '../src/knowledge-space/markov-engine'
import { buildQuasiOrdinalKnowledgeSpace } from '../src/knowledge-space/surmise'
import type { KSTItem, KnowledgeStructure, SurmiseRelation } from '../src/knowledge-space/types'

describe('Markovian Adaptive Assessment Engine (Falmagne & Doignon 1988)', () => {
  const items: KSTItem[] = [
    {
      id: 'm1',
      title: 'Item 1',
      description: 'D1',
      domain: 'Math',
      difficulty: 0.2,
      estimatedTimeMinutes: 5,
      slipProbability: 0.1,
      guessProbability: 0.1,
      tags: [],
      skillsRequired: [],
      prompt: 'P1',
      solution: 'S1',
    },
    {
      id: 'm2',
      title: 'Item 2',
      description: 'D2',
      domain: 'Math',
      difficulty: 0.5,
      estimatedTimeMinutes: 5,
      slipProbability: 0.1,
      guessProbability: 0.1,
      tags: [],
      skillsRequired: ['m1'],
      prompt: 'P2',
      solution: 'S2',
    },
    {
      id: 'm3',
      title: 'Item 3',
      description: 'D3',
      domain: 'Math',
      difficulty: 0.8,
      estimatedTimeMinutes: 5,
      slipProbability: 0.1,
      guessProbability: 0.1,
      tags: [],
      skillsRequired: ['m2'],
      prompt: 'P3',
      solution: 'S3',
    },
  ]

  const relations: SurmiseRelation[] = [
    { prerequisiteId: 'm1', targetId: 'm2', confidence: 1.0, rationale: 'm1 <= m2' },
    { prerequisiteId: 'm2', targetId: 'm3', confidence: 1.0, rationale: 'm2 <= m3' },
  ]

  // Linear chain: ∅, {m1}, {m1, m2}, {m1, m2, m3} => 4 states
  const structure: KnowledgeStructure = buildQuasiOrdinalKnowledgeSpace(
    'test-linear',
    'Linear Structure',
    items,
    relations,
  )

  it('initializes a uniform prior session with maximum entropy', () => {
    const session = initializeMarkovianSession(structure, 'uniform')

    expect(session.step).toBe(0)
    expect(session.history).toHaveLength(0)
    expect(session.isTerminated).toBe(false)
    expect(session.terminationReason).toBe('in_progress')

    // 4 states with equal probability 1/4 = 0.25 => Entropy = log2(4) = 2.0 bits
    expect(session.currentEntropy).toBeCloseTo(2.0, 2)
    for (const prob of Object.values(session.stateProbabilities)) {
      expect(prob).toBeCloseTo(0.25, 4)
    }

    // Next suggested item should exist
    expect(session.nextSuggestedItemId).toBeDefined()
  })

  it('initializes a difficulty-weighted prior centered on median difficulty', () => {
    const session = initializeMarkovianSession(structure, 'difficulty_weighted')

    expect(session.step).toBe(0)
    // Probabilities must sum to 1.0
    const sum = Object.values(session.stateProbabilities).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 4)
  })

  it('updates belief posterior with Bayesian likelihood upon correct response', () => {
    let session = initializeMarkovianSession(structure, 'uniform')
    const itemToAsk = session.nextSuggestedItemId!

    // Learner answers correctly
    session = updateBeliefPosterior(session, structure, {
      itemId: itemToAsk,
      isCorrect: true,
      responseTimeMs: 3200,
    })

    expect(session.step).toBe(1)
    expect(session.history).toHaveLength(1)
    expect(session.history[0]?.itemId).toBe(itemToAsk)
    expect(session.history[0]?.isCorrect).toBe(true)

    // States that contain the answered item should have increased probability
    for (const state of structure.states) {
      const prob = session.stateProbabilities[state.stateId] || 0
      if (state.itemIds.includes(itemToAsk)) {
        // Higher likelihood (1 - beta = 0.9) than guess (eta = 0.1)
        expect(prob).toBeGreaterThan(0.25)
      } else {
        expect(prob).toBeLessThan(0.25)
      }
    }

    // Entropy should decrease
    expect(session.currentEntropy).toBeLessThan(2.0)
  })

  it('converges to the master state {m1, m2, m3} after consecutive correct responses', () => {
    let session = initializeMarkovianSession(structure, 'uniform')

    // Answer all items correctly
    for (const item of items) {
      if (session.isTerminated) break
      session = updateBeliefPosterior(session, structure, {
        itemId: item.id,
        isCorrect: true,
      })
    }

    expect(session.mostLikelyStateId).toBe('m1,m2,m3')
    expect(session.confidence).toBeGreaterThan(0.75)
  })

  it('converges to the empty state ∅ after consecutive incorrect responses', () => {
    let session = initializeMarkovianSession(structure, 'uniform')

    // Answer all items incorrectly
    for (const item of items) {
      if (session.isTerminated) break
      session = updateBeliefPosterior(session, structure, {
        itemId: item.id,
        isCorrect: false,
      })
    }

    expect(session.mostLikelyStateId).toBe('∅')
    expect(session.confidence).toBeGreaterThan(0.7)
  })

  it('selects optimal next item using half-split bisection', () => {
    const session = initializeMarkovianSession(structure, 'uniform')
    const nextItem = selectOptimalNextItem(session, structure, 'half_split')

    expect(nextItem).toBeDefined()
    // For linear chain {m1, m2, m3}:
    // P(m1 in K) = 3/4 = 0.75
    // P(m2 in K) = 2/4 = 0.50  <-- exact half-split!
    // P(m3 in K) = 1/4 = 0.25
    expect(nextItem).toBe('m2')
  })

  it('produces a comprehensive learner diagnosis', () => {
    let session = initializeMarkovianSession(structure, 'uniform')
    // Answer m1 correctly, m2 incorrectly
    session = updateBeliefPosterior(session, structure, { itemId: 'm1', isCorrect: true })
    session = updateBeliefPosterior(session, structure, { itemId: 'm2', isCorrect: false })

    const diagnosis = diagnoseLearner(session, structure)

    expect(diagnosis.diagnosedState).toBeDefined()
    expect(diagnosis.confidence).toBeGreaterThan(0)
    expect(diagnosis.innerFringe).toBeDefined()
    expect(diagnosis.outerFringe).toBeDefined()
  })
})

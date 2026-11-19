/**
 * @file knowledge-space-fsrs.test.ts
 * @description Unit tests for Calibrated FSRS-6 Flashcard Generation from Knowledge Spaces
 *
 * Grounded in:
 * - FSRS-6 Spaced Repetition Scheduling (stability S0 and difficulty D0 calibration)
 * - Doignon & Falmagne (1999) Inner/Outer Fringe frontier dynamics
 * - Retention consolidation vs Proximal acquisition card typologies
 */

import { describe, expect, it } from 'vitest'
import { generateKSTCalibratedDeck } from '../src/knowledge-space/fsrs-integration'
import { buildQuasiOrdinalKnowledgeSpace } from '../src/knowledge-space/surmise'
import {
  initializeMarkovianSession,
  updateBeliefPosterior,
} from '../src/knowledge-space/markov-engine'
import type { KSTItem, KnowledgeStructure, SurmiseRelation } from '../src/knowledge-space/types'

describe('FSRS-6 Calibrated Flashcard Generation from KST Structures', () => {
  const items: KSTItem[] = [
    {
      id: 'it1',
      title: 'Foundational Concept 1',
      description: 'D1',
      domain: 'Physics',
      difficulty: 0.2,
      estimatedTimeMinutes: 5,
      slipProbability: 0.05,
      guessProbability: 0.1,
      tags: ['physics'],
      skillsRequired: [],
      prompt: "State Newton's First Law",
      solution: 'An object remains at rest or in uniform motion unless acted upon by a net force.',
    },
    {
      id: 'it2',
      title: 'Intermediate Concept 2',
      description: 'D2',
      domain: 'Physics',
      difficulty: 0.5,
      estimatedTimeMinutes: 8,
      slipProbability: 0.15, // High slip candidate
      guessProbability: 0.1,
      tags: ['physics'],
      skillsRequired: ['it1'],
      prompt: 'Calculate force given mass and acceleration',
      solution: 'F = m * a.',
    },
    {
      id: 'it3',
      title: 'Advanced Concept 3',
      description: 'D3',
      domain: 'Physics',
      difficulty: 0.8,
      estimatedTimeMinutes: 10,
      slipProbability: 0.1,
      guessProbability: 0.1,
      tags: ['physics'],
      skillsRequired: ['it2'],
      prompt: "Derive work-energy theorem from Newton's second law",
      solution: 'W = Integral(F dx) = Integral(m v dv) = 1/2 m v_f^2 - 1/2 m v_i^2 = Delta K.',
    },
  ]

  const relations: SurmiseRelation[] = [
    { prerequisiteId: 'it1', targetId: 'it2', confidence: 1.0, rationale: 'it1 <= it2' },
    { prerequisiteId: 'it2', targetId: 'it3', confidence: 1.0, rationale: 'it2 <= it3' },
  ]

  const structure: KnowledgeStructure = buildQuasiOrdinalKnowledgeSpace(
    'test-physics',
    'Physics Kinematics & Mechanics',
    items,
    relations,
  )

  it('generates inner fringe retention cards for mastered items at the frontier', () => {
    // State {it1, it2}: inner fringe is {it2}
    const state = structure.states.find((s) => s.stateId === 'it1,it2')!
    const cards = generateKSTCalibratedDeck(structure, state, {
      includeInnerFringe: true,
      includeOuterFringe: false,
      includePrerequisiteInvariants: false,
      includeSlipDiagnostic: false,
    })

    expect(cards).toHaveLength(1)
    const card = cards[0]!
    expect(card.cardType).toBe('inner_fringe_retention')
    expect(card.targetItemId).toBe('it2')
    // S0 should be high for mastered inner fringe
    expect(card.stability).toBeGreaterThanOrEqual(3.0)
    // D0 should reflect item difficulty
    expect(card.difficulty).toBeGreaterThan(4.0)
    expect(card.fsrsParameters.stability).toBe(card.stability)
    expect(card.fsrsParameters.difficulty).toBe(card.difficulty)
  })

  it('generates outer fringe acquisition cards for immediate next learning frontier', () => {
    // State {it1}: outer fringe is {it2}
    const state = structure.states.find((s) => s.stateId === 'it1')!
    const cards = generateKSTCalibratedDeck(structure, state, {
      includeInnerFringe: false,
      includeOuterFringe: true,
      includePrerequisiteInvariants: false,
      includeSlipDiagnostic: false,
    })

    expect(cards).toHaveLength(1)
    const card = cards[0]!
    expect(card.cardType).toBe('outer_fringe_acquisition')
    expect(card.targetItemId).toBe('it2')
    // Acquisition card should have lower initial stability (S0 ~ 1.0) and higher difficulty
    expect(card.stability).toBeLessThanOrEqual(2.0)
    expect(card.difficulty).toBeGreaterThan(6.0)
  })

  it('generates surmise invariant cards verifying prerequisite implications', () => {
    // State {it1, it2}: invariant link it1 <= it2
    const state = structure.states.find((s) => s.stateId === 'it1,it2')!
    const cards = generateKSTCalibratedDeck(structure, state, {
      includeInnerFringe: false,
      includeOuterFringe: false,
      includePrerequisiteInvariants: true,
      includeSlipDiagnostic: false,
    })

    expect(cards.length).toBeGreaterThan(0)
    const invariantCard = cards.find((c) => c.cardType === 'surmise_invariant')
    expect(invariantCard).toBeDefined()
    expect(invariantCard?.front).toContain('Structural Surmise Link')
    expect(invariantCard?.targetItemId).toBe('it2')
    expect(invariantCard?.prerequisiteItemIds).toContain('it1')
  })

  it('generates slip diagnostic cards for items with high slip probability', () => {
    // it2 has slipProbability 0.15 >= 0.12
    const state = structure.states.find((s) => s.stateId === 'it1,it2')!
    const cards = generateKSTCalibratedDeck(structure, state, {
      includeInnerFringe: false,
      includeOuterFringe: false,
      includePrerequisiteInvariants: false,
      includeSlipDiagnostic: true,
    })

    expect(cards.length).toBeGreaterThan(0)
    const slipCard = cards.find((c) => c.cardType === 'slip_misconception')
    expect(slipCard).toBeDefined()
    expect(slipCard?.targetItemId).toBe('it2')
    expect(slipCard?.front).toContain('Slip & Misconception Alert')
  })

  it('generates deck directly from an active adaptive assessment session', () => {
    let session = initializeMarkovianSession(structure, 'uniform')
    session = updateBeliefPosterior(session, structure, { itemId: 'it1', isCorrect: true })

    const deck = generateKSTCalibratedDeck(structure, session, {
      maxCards: 10,
    })

    expect(deck.length).toBeGreaterThan(0)
    expect(deck.length).toBeLessThanOrEqual(10)
    for (const card of deck) {
      expect(card.id).toBeDefined()
      expect(card.stability).toBeGreaterThan(0)
      expect(card.difficulty).toBeGreaterThanOrEqual(1)
      expect(card.difficulty).toBeLessThanOrEqual(10)
    }
  })
})

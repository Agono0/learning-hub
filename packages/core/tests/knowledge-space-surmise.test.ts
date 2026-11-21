/**
 * @file knowledge-space-surmise.test.ts
 * @description Comprehensive unit tests for Surmise Relations, Quasi-Orders, and Birkhoff Down-Sets
 *
 * Grounded in:
 * - Doignon & Falmagne (1985, 1999) - Quasi-ordinal knowledge spaces
 * - Birkhoff Representation Theorem (1937) for finite distributive lattices
 * - Transitive reduction and Hasse diagram covers
 */

import { describe, expect, it } from 'vitest'
import {
  computeTransitiveClosure,
  computeTransitiveReduction,
  detectSurmiseCycles,
  generateDownSets,
  buildQuasiOrdinalKnowledgeSpace,
  validateSurmiseSystem,
  generateStatesFromSurmiseClauses,
  canonicalKey,
} from '../src/knowledge-space/surmise'
import type {
  KSTItem,
  SurmiseRelation,
  SurmiseSystem,
  SurmiseClause,
} from '../src/knowledge-space/types'

describe('Surmise Relations & Quasi-Orders (Doignon & Falmagne 1985, 1999)', () => {
  const itemIds = ['q1', 'q2', 'q3', 'q4']

  it('computes reflexive transitive closure for a linear chain (q1 <= q2 <= q3 <= q4)', () => {
    const relations = [
      { prerequisiteId: 'q1', targetId: 'q2' },
      { prerequisiteId: 'q2', targetId: 'q3' },
      { prerequisiteId: 'q3', targetId: 'q4' },
    ]

    const closure = computeTransitiveClosure(itemIds, relations)

    // Reflexivity
    for (const id of itemIds) {
      expect(closure.get(id)?.has(id)).toBe(true)
    }

    // Direct and transitive prerequisites
    expect(closure.get('q4')?.has('q1')).toBe(true)
    expect(closure.get('q4')?.has('q2')).toBe(true)
    expect(closure.get('q4')?.has('q3')).toBe(true)
    expect(closure.get('q3')?.has('q1')).toBe(true)
    expect(closure.get('q3')?.has('q2')).toBe(true)
    expect(closure.get('q2')?.has('q1')).toBe(true)
    expect(closure.get('q1')?.has('q2')).toBe(false)
  })

  it('computes transitive reduction eliminating redundant shortcuts', () => {
    // q1 -> q2 -> q3 with redundant shortcut q1 -> q3
    const relations = [
      { prerequisiteId: 'q1', targetId: 'q2' },
      { prerequisiteId: 'q2', targetId: 'q3' },
      { prerequisiteId: 'q1', targetId: 'q3' }, // redundant
    ]

    const reduction = computeTransitiveReduction(['q1', 'q2', 'q3'], relations)

    expect(reduction).toHaveLength(2)
    expect(reduction).toContainEqual({ prerequisiteId: 'q1', targetId: 'q2' })
    expect(reduction).toContainEqual({ prerequisiteId: 'q2', targetId: 'q3' })
    expect(reduction).not.toContainEqual({ prerequisiteId: 'q1', targetId: 'q3' })
  })

  it('detects cycles representing equivalent co-requisite items', () => {
    const relationsWithCycle = [
      { prerequisiteId: 'q1', targetId: 'q2' },
      { prerequisiteId: 'q2', targetId: 'q1' }, // Mutual dependency: cycle
      { prerequisiteId: 'q2', targetId: 'q3' },
    ]

    const cycles = detectSurmiseCycles(['q1', 'q2', 'q3'], relationsWithCycle)
    expect(cycles.length).toBeGreaterThanOrEqual(1)
    expect(cycles[0]).toContain('q1')
    expect(cycles[0]).toContain('q2')
  })

  it('returns empty cycles for a strictly acyclic DAG', () => {
    const relations = [
      { prerequisiteId: 'q1', targetId: 'q2' },
      { prerequisiteId: 'q1', targetId: 'q3' },
      { prerequisiteId: 'q2', targetId: 'q4' },
      { prerequisiteId: 'q3', targetId: 'q4' },
    ]

    const cycles = detectSurmiseCycles(itemIds, relations)
    expect(cycles).toHaveLength(0)
  })

  it('generates Birkhoff down-sets for a diamond poset', () => {
    // Diamond poset:
    //      q4 (top)
    //     /  \
    //   q2    q3
    //     \  /
    //      q1 (bottom)
    const relations = [
      { prerequisiteId: 'q1', targetId: 'q2' },
      { prerequisiteId: 'q1', targetId: 'q3' },
      { prerequisiteId: 'q2', targetId: 'q4' },
      { prerequisiteId: 'q3', targetId: 'q4' },
    ]

    const closure = computeTransitiveClosure(itemIds, relations)
    const downSets = generateDownSets(itemIds, closure)

    // Expected down-sets (order ideals):
    // ∅, {q1}, {q1, q2}, {q1, q3}, {q1, q2, q3}, {q1, q2, q3, q4} => exactly 6 states
    expect(downSets).toHaveLength(6)

    const keys = downSets.map((s) => canonicalKey(Array.from(s)))
    expect(keys).toContain('∅')
    expect(keys).toContain('q1')
    expect(keys).toContain('q1,q2')
    expect(keys).toContain('q1,q3')
    expect(keys).toContain('q1,q2,q3')
    expect(keys).toContain('q1,q2,q3,q4')
  })

  it('builds a complete quasi-ordinal knowledge space with items and relations', () => {
    const items: KSTItem[] = [
      {
        id: 'a',
        title: 'Concept A',
        description: 'Base concept',
        domain: 'Logic',
        difficulty: 0.2,
        estimatedTimeMinutes: 5,
        slipProbability: 0.1,
        guessProbability: 0.15,
        tags: ['logic'],
        skillsRequired: [],
        prompt: 'What is A?',
        solution: 'A is base.',
      },
      {
        id: 'b',
        title: 'Concept B',
        description: 'Derived concept',
        domain: 'Logic',
        difficulty: 0.5,
        estimatedTimeMinutes: 5,
        slipProbability: 0.1,
        guessProbability: 0.15,
        tags: ['logic'],
        skillsRequired: ['a'],
        prompt: 'What is B?',
        solution: 'B requires A.',
      },
    ]

    const relations: SurmiseRelation[] = [
      { prerequisiteId: 'a', targetId: 'b', confidence: 1.0, rationale: 'A is prerequisite of B' },
    ]

    const space = buildQuasiOrdinalKnowledgeSpace('test-space', 'Test Space', items, relations)

    expect(space.isKnowledgeSpace).toBe(true)
    expect(space.isQuasiOrdinal).toBe(true)
    expect(space.states).toHaveLength(3) // ∅, {a}, {a, b}
    expect(space.states[0]?.stateId).toBe('∅')
    expect(space.states[1]?.stateId).toBe('a')
    expect(space.states[2]?.stateId).toBe('a,b')
  })

  it('validates a surmise system and identifies missing references', () => {
    const invalidSystem: SurmiseSystem = {
      items: [
        {
          id: 'item-1',
          title: 'Item 1',
          description: 'Desc',
          domain: 'Math',
          difficulty: 0.5,
          estimatedTimeMinutes: 5,
          slipProbability: 0.1,
          guessProbability: 0.15,
          tags: [],
          skillsRequired: [],
          prompt: 'P',
          solution: 'S',
        },
      ],
      clauses: [
        {
          targetId: 'item-1',
          clauses: [['non-existent-prereq']],
        },
        {
          targetId: 'non-existent-target',
          clauses: [['item-1']],
        },
      ],
    }

    const validation = validateSurmiseSystem(invalidSystem)
    expect(validation.valid).toBe(false)
    expect(validation.errors.length).toBeGreaterThanOrEqual(2)
  })

  it('resolves AND/OR clauses in a surmise system', () => {
    // Item C can be learned via path 1: [A, B] OR path 2: [D]
    const items: KSTItem[] = ['A', 'B', 'C', 'D'].map((id) => ({
      id,
      title: `Item ${id}`,
      description: `Description ${id}`,
      domain: 'Test',
      difficulty: 0.5,
      estimatedTimeMinutes: 5,
      slipProbability: 0.1,
      guessProbability: 0.15,
      tags: [],
      skillsRequired: [],
      prompt: `Prompt ${id}`,
      solution: `Solution ${id}`,
    }))

    const clauses: SurmiseClause[] = [
      {
        targetId: 'C',
        clauses: [['A', 'B'], ['D']], // (A AND B) OR D
      },
    ]

    const states = generateStatesFromSurmiseClauses(items, clauses)
    const stateKeys = new Set(states.map((s) => s.stateId))

    // Valid states must satisfy: if C is present, then either {A, B} are present OR {D} is present
    expect(stateKeys.has('∅')).toBe(true)
    expect(stateKeys.has('A,B,C')).toBe(true)
    expect(stateKeys.has('C,D')).toBe(true)
    // C alone without (A, B) or D is INVALID
    expect(stateKeys.has('C')).toBe(false)
    // C with only A is INVALID
    expect(stateKeys.has('A,C')).toBe(false)
  })
})

/**
 * @file knowledge-space-structure.test.ts
 * @description Unit tests for Knowledge Structure Axioms, Fringes, and Closures
 *
 * Grounded in:
 * - Doignon & Falmagne (1999) - Knowledge Spaces, Chapter 1 & 2
 * - Inner fringe K⁻ & Outer fringe K⁺ (ZPD in KST)
 * - Symmetric distance metric d(K, L)
 */

import { describe, expect, it } from 'vitest'
import {
  verifyKnowledgeSpaceAxioms,
  verifyIntersectionClosure,
  computeFringes,
  computeSymmetricDistance,
  findNearestStates,
  buildStateTransitionGraph,
} from '../src/knowledge-space/structure'
import {
  computeStateClosure,
  computeStateInterior,
  isClosedKnowledgeState,
  computeKnowledgeSpaceBase,
} from '../src/knowledge-space/closure'
import { buildQuasiOrdinalKnowledgeSpace } from '../src/knowledge-space/surmise'
import type {
  KSTItem,
  KnowledgeState,
  KnowledgeStructure,
  SurmiseRelation,
} from '../src/knowledge-space/types'

describe('Knowledge Structure Axioms & Fringes (Doignon & Falmagne 1999)', () => {
  const items: KSTItem[] = [
    {
      id: 'i1',
      title: 'Item 1',
      description: 'D1',
      domain: 'Test',
      difficulty: 0.2,
      estimatedTimeMinutes: 5,
      slipProbability: 0.1,
      guessProbability: 0.15,
      tags: [],
      skillsRequired: [],
      prompt: 'P1',
      solution: 'S1',
    },
    {
      id: 'i2',
      title: 'Item 2',
      description: 'D2',
      domain: 'Test',
      difficulty: 0.4,
      estimatedTimeMinutes: 5,
      slipProbability: 0.1,
      guessProbability: 0.15,
      tags: [],
      skillsRequired: ['i1'],
      prompt: 'P2',
      solution: 'S2',
    },
    {
      id: 'i3',
      title: 'Item 3',
      description: 'D3',
      domain: 'Test',
      difficulty: 0.6,
      estimatedTimeMinutes: 5,
      slipProbability: 0.1,
      guessProbability: 0.15,
      tags: [],
      skillsRequired: ['i1'],
      prompt: 'P3',
      solution: 'S3',
    },
    {
      id: 'i4',
      title: 'Item 4',
      description: 'D4',
      domain: 'Test',
      difficulty: 0.8,
      estimatedTimeMinutes: 5,
      slipProbability: 0.1,
      guessProbability: 0.15,
      tags: [],
      skillsRequired: ['i2', 'i3'],
      prompt: 'P4',
      solution: 'S4',
    },
  ]

  const relations: SurmiseRelation[] = [
    { prerequisiteId: 'i1', targetId: 'i2', confidence: 1.0, rationale: 'i1 <= i2' },
    { prerequisiteId: 'i1', targetId: 'i3', confidence: 1.0, rationale: 'i1 <= i3' },
    { prerequisiteId: 'i2', targetId: 'i4', confidence: 1.0, rationale: 'i2 <= i4' },
    { prerequisiteId: 'i3', targetId: 'i4', confidence: 1.0, rationale: 'i3 <= i4' },
  ]

  const structure: KnowledgeStructure = buildQuasiOrdinalKnowledgeSpace(
    'test-diamond',
    'Diamond Structure',
    items,
    relations,
  )

  it('verifies that the diamond structure satisfies all Knowledge Space axioms', () => {
    const domainIds = items.map((i) => i.id)
    const verification = verifyKnowledgeSpaceAxioms(domainIds, structure.states)

    expect(verification.isValid).toBe(true)
    expect(verification.hasEmpty).toBe(true)
    expect(verification.hasFull).toBe(true)
    expect(verification.isUnionClosed).toBe(true)
    expect(verification.violations).toHaveLength(0)
  })

  it('detects violations when union closure or empty/full states are missing', () => {
    // Missing empty state and missing union
    const brokenStates: KnowledgeState[] = [
      { stateId: 'i1', itemIds: ['i1'], level: 1 },
      { stateId: 'i2', itemIds: ['i2'], level: 1 },
      // Note: union {i1, i2} is missing!
    ]

    const domainIds = ['i1', 'i2']
    const result = verifyKnowledgeSpaceAxioms(domainIds, brokenStates)

    expect(result.isValid).toBe(false)
    expect(result.hasEmpty).toBe(false)
    expect(result.hasFull).toBe(false)
    expect(result.isUnionClosed).toBe(false)
  })

  it('confirms intersection closure for quasi-ordinal structures', () => {
    const result = verifyIntersectionClosure(structure.states)
    expect(result.isIntersectionClosed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('computes correct inner fringe K⁻ and outer fringe K⁺ for state {i1}', () => {
    // For state {i1}:
    // Inner fringe: {i1} (dropping i1 gives ∅, which is in K)
    // Outer fringe: unmastered items that can be added individually.
    // {i1, i2} is in K => i2 in K⁺
    // {i1, i3} is in K => i3 in K⁺
    // {i1, i4} is NOT in K => i4 not in K⁺
    const fringes = computeFringes(['i1'], structure)

    expect(fringes.innerFringe).toEqual(['i1'])
    expect(fringes.outerFringe).toEqual(['i2', 'i3'])
  })

  it('computes fringes for the empty state ∅ and the full state Q', () => {
    const emptyFringes = computeFringes([], structure)
    expect(emptyFringes.innerFringe).toEqual([])
    expect(emptyFringes.outerFringe).toEqual(['i1']) // Only foundational item i1 can be learned first

    const fullFringes = computeFringes(['i1', 'i2', 'i3', 'i4'], structure)
    expect(fullFringes.innerFringe).toEqual(['i4']) // Only most advanced item i4 can be dropped to leave {i1, i2, i3}
    expect(fullFringes.outerFringe).toEqual([]) // No further items in domain
  })

  it('computes symmetric difference distance correctly', () => {
    expect(computeSymmetricDistance(['a', 'b'], ['b', 'c'])).toBe(2)
    expect(computeSymmetricDistance([], ['a', 'b'])).toBe(2)
    expect(computeSymmetricDistance(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0)
  })

  it('projects an arbitrary response pattern to the nearest valid knowledge states', () => {
    // Response pattern {i4} has missed prerequisites i1, i2, i3
    const nearest = findNearestStates(['i4'], structure, 2)

    expect(nearest.length).toBeGreaterThan(0)
    // Nearest valid state should be ∅ (dist 1) or {i1, i2, i3, i4} (dist 3)
    expect(nearest[0]?.state.stateId).toBe('∅')
    expect(nearest[0]?.distance).toBe(1)
  })

  it('constructs a valid state transition digraph', () => {
    const graph = buildStateTransitionGraph(structure)

    expect(graph.nodes.length).toBe(structure.states.length)
    expect(graph.edges.length).toBeGreaterThan(0)

    // From ∅, there must be an edge adding i1
    const startEdge = graph.edges.find((e) => e.source === '∅')
    expect(startEdge?.addedItemId).toBe('i1')
    expect(startEdge?.target).toBe('i1')
  })

  it('computes state closure C(S) and interior I(S)', () => {
    // For subset S = {i2}:
    // Smallest state containing i2 must also contain prerequisite i1 => {i1, i2}
    const closureState = computeStateClosure(['i2'], structure)
    expect(closureState.stateId).toBe('i1,i2')

    // For subset S = {i2}:
    // Largest valid state contained within {i2} is ∅ (because {i2} alone is not valid)
    const interiorState = computeStateInterior(['i2'], structure)
    expect(interiorState.stateId).toBe('∅')

    // If S is already closed {i1, i2}, both closure and interior return {i1, i2}
    expect(isClosedKnowledgeState(['i1', 'i2'], structure)).toBe(true)
    expect(computeStateClosure(['i1', 'i2'], structure).stateId).toBe('i1,i2')
    expect(computeStateInterior(['i1', 'i2'], structure).stateId).toBe('i1,i2')
  })

  it('computes the basis (union-irreducible atoms) of the knowledge space', () => {
    const base = computeKnowledgeSpaceBase(structure)

    // In a diamond: ∅, {i1}, {i1, i2}, {i1, i3}, {i1, i2, i3}, {i1, i2, i3, i4}
    // {i1, i2, i3} is the union of {i1, i2} and {i1, i3}, so it is reducible.
    // Irreducible atoms: {i1}, {i1, i2}, {i1, i3}, {i1, i2, i3, i4} => 4 base states
    const baseIds = base.map((s) => s.stateId)
    expect(baseIds).toContain('i1')
    expect(baseIds).toContain('i1,i2')
    expect(baseIds).toContain('i1,i3')
    expect(baseIds).toContain('i1,i2,i3,i4')
    expect(baseIds).not.toContain('i1,i2,i3')
  })
})

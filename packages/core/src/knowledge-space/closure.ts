/**
 * @file closure.ts
 * @description Knowledge State Closure, Interior Operators, and Galois Connections
 *
 * Implements:
 * - Closure operator C(S): smallest knowledge state containing item subset S
 * - Interior operator I(S): largest knowledge state contained within item subset S
 * - Prerequisite down-closure under surmise relations
 * - Base (span) of a knowledge space: minimal family of states spanning K under union
 *
 * Grounded in:
 * - Doignon & Falmagne (1999) Chapter 2: "Knowledge Spaces and Closure Spaces"
 * - Birkhoff (1940) "Lattice Theory" - Galois connections and Moore families
 *
 * @module @learning-hub/core/knowledge-space
 */

import type { KnowledgeState, KnowledgeStructure, SurmiseRelation } from './types'
import { canonicalKey, computeTransitiveClosure } from './surmise'

// ============================================================================
// 1. STATE CLOSURE & INTERIOR OPERATORS
// ============================================================================

/**
 * Computes the prerequisite closure of an arbitrary item subset S.
 * Adds all direct and indirect prerequisites required by any item in S.
 */
export function computePrerequisiteClosure(
  subset: string[],
  domainItems: string[],
  relations: SurmiseRelation[],
): string[] {
  const closure = computeTransitiveClosure(domainItems, relations)
  const result = new Set<string>()

  for (const item of subset) {
    result.add(item)
    const prereqs = closure.get(item)
    if (prereqs) {
      for (const p of prereqs) {
        result.add(p)
      }
    }
  }

  return Array.from(result).sort()
}

/**
 * Computes the Knowledge State Closure C(S) for an item subset S in structure K.
 * In any intersection-closed structure (e.g. quasi-ordinal space), C(S) is the
 * unique minimal state containing S.
 * If multiple minimal states exist (non-quasi-ordinal space), returns the smallest by cardinality.
 */
export function computeStateClosure(
  subset: string[],
  structure: KnowledgeStructure,
): KnowledgeState {
  const supersets = structure.states.filter((state) => {
    const stateItems = new Set(state.itemIds)
    return subset.every((item) => stateItems.has(item))
  })

  if (supersets.length === 0) {
    // If no state contains S, default to full domain state Q
    return structure.states[structure.states.length - 1]!
  }

  // Find intersection of all supersets (or minimal by size)
  let minimalState = supersets[0]!
  for (const s of supersets) {
    if (s.level < minimalState.level) {
      minimalState = s
    }
  }

  return minimalState
}

/**
 * Computes the Knowledge State Interior I(S) for an item subset S in structure K.
 * In a knowledge space (closed under union), I(S) = union of all K in K such that K <= S.
 * This is the unique maximal valid state contained within S.
 */
export function computeStateInterior(
  subset: string[],
  structure: KnowledgeStructure,
): KnowledgeState {
  const targetSet = new Set(subset)
  const subsets = structure.states.filter((state) => {
    return state.itemIds.every((item) => targetSet.has(item))
  })

  if (subsets.length === 0) {
    return structure.states[0]! // Empty state ∅
  }

  // Since space is closed under union, the maximal state contains the union of all subsets
  const unionItems = new Set<string>()
  for (const s of subsets) {
    for (const item of s.itemIds) {
      unionItems.add(item)
    }
  }

  const sortedUnion = Array.from(unionItems).sort()
  const key = canonicalKey(sortedUnion)

  const existingState = structure.states.find((s) => s.stateId === key)
  if (existingState) return existingState

  // Fallback to largest subset found
  return subsets.reduce((max, curr) => (curr.level > max.level ? curr : max), subsets[0]!)
}

/**
 * Checks whether an item subset S is an exact valid knowledge state in structure K.
 */
export function isClosedKnowledgeState(subset: string[], structure: KnowledgeStructure): boolean {
  const key = canonicalKey(subset)
  return structure.states.some((s) => s.stateId === key)
}

// ============================================================================
// 2. BASIS OF A KNOWLEDGE SPACE
// ============================================================================

/**
 * Finds the base (spanning atoms) of a knowledge space.
 * A state K is in the base B if it cannot be expressed as the union of other states in K.
 * (Union-irreducible states, Doignon & Falmagne 1999).
 */
export function computeKnowledgeSpaceBase(structure: KnowledgeStructure): KnowledgeState[] {
  const states = structure.states.filter((s) => s.level > 0) // Exclude empty state
  const base: KnowledgeState[] = []

  for (const candidate of states) {
    const candidateSet = new Set(candidate.itemIds)
    // Find all strictly smaller states contained in candidate
    const properSubsets = states.filter(
      (s) => s.level < candidate.level && s.itemIds.every((item) => candidateSet.has(item)),
    )

    // Union of all strictly smaller states
    const unionOfSmaller = new Set<string>()
    for (const s of properSubsets) {
      for (const item of s.itemIds) {
        unionOfSmaller.add(item)
      }
    }

    // Candidate is union-irreducible iff candidate != union(properSubsets)
    if (unionOfSmaller.size !== candidateSet.size) {
      base.push(candidate)
    }
  }

  return base
}

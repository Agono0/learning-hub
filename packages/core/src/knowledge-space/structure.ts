/**
 * @file structure.ts
 * @description Knowledge Structure Verification, Inner/Outer Fringes, and Distance Metrics
 *
 * Implements:
 * - Knowledge Space union closure verification (Doignon & Falmagne 1985, 1999)
 * - Quasi-Ordinal intersection closure verification
 * - Inner fringe K⁻ and Outer fringe K⁺ computation
 * - Symmetric difference metric d(K, L) = |(K \ L) ∪ (L \ K)|
 * - State transition digraph construction (Hasse diagram of states)
 * - Nearest knowledge state projection
 *
 * @module @learning-hub/core/knowledge-space
 */

import type { Fringes, KnowledgeState, KnowledgeStructure } from './types'
import { canonicalKey } from './surmise'

// ============================================================================
// 1. AXIOMATIC STRUCTURE VERIFICATION
// ============================================================================

/**
 * Verifies whether a family of states forms a valid Knowledge Space.
 * Axioms:
 * 1. Contains empty set ∅
 * 2. Contains full domain Q
 * 3. Closed under union: for all K1, K2 in K, K1 ∪ K2 in K
 */
export function verifyKnowledgeSpaceAxioms(
  domainItemIds: string[],
  states: KnowledgeState[],
): {
  isValid: boolean
  hasEmpty: boolean
  hasFull: boolean
  isUnionClosed: boolean
  violations: string[]
} {
  const violations: string[] = []
  const stateSet = new Set(states.map((s) => s.stateId))

  const hasEmpty = stateSet.has('∅') || states.some((s) => s.level === 0)
  if (!hasEmpty) {
    violations.push('Empty state ∅ is missing from the structure.')
  }

  const domainSorted = domainItemIds.slice().sort().join(',')
  const hasFull = states.some((s) => s.itemIds.slice().sort().join(',') === domainSorted)
  if (!hasFull) {
    violations.push('Full domain state Q is missing from the structure.')
  }

  let isUnionClosed = true
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const unionItems = Array.from(new Set([...states[i]!.itemIds, ...states[j]!.itemIds])).sort()
      const unionKey = canonicalKey(unionItems)
      if (!stateSet.has(unionKey)) {
        isUnionClosed = false
        violations.push(
          `Union closure violated: {${states[i]!.stateId}} ∪ {${states[j]!.stateId}} = {${unionKey}} not in K.`,
        )
        if (violations.length > 20) break
      }
    }
    if (violations.length > 20) break
  }

  return {
    isValid: hasEmpty && hasFull && isUnionClosed,
    hasEmpty,
    hasFull,
    isUnionClosed,
    violations,
  }
}

/**
 * Verifies whether a structure is closed under intersection (quasi-ordinal space).
 */
export function verifyIntersectionClosure(states: KnowledgeState[]): {
  isIntersectionClosed: boolean
  violations: string[]
} {
  const stateSet = new Set(states.map((s) => s.stateId))
  const violations: string[] = []

  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const setJ = new Set(states[j]!.itemIds)
      const intersection = states[i]!.itemIds.filter((item) => setJ.has(item)).sort()
      const key = canonicalKey(intersection)
      if (!stateSet.has(key)) {
        violations.push(
          `Intersection closure violated: {${states[i]!.stateId}} ∩ {${states[j]!.stateId}} = {${key}} not in K.`,
        )
        if (violations.length > 10) break
      }
    }
    if (violations.length > 10) break
  }

  return {
    isIntersectionClosed: violations.length === 0,
    violations,
  }
}

// ============================================================================
// 2. INNER & OUTER FRINGES (Doignon & Falmagne 1999)
// ============================================================================

/**
 * Computes the Inner Fringe K⁻ and Outer Fringe K⁺ for a state in structure K.
 *
 * - Inner fringe K⁻: { q ∈ K | K \ {q} ∈ K }
 *   The most advanced mastered items that can be unlearned without violating prerequisite integrity.
 *
 * - Outer fringe K⁺: { q ∈ Q \ K | K ∪ {q} ∈ K }
 *   The immediate next items ready to be learned (Zone of Proximal Development).
 */
export function computeFringes(stateItems: string[], structure: KnowledgeStructure): Fringes {
  const stateSet = new Set(stateItems)
  const allStatesMap = new Set(structure.states.map((s) => s.stateId))
  const domainItemIds = structure.domainItems.map((item) => item.id)

  const innerFringe: string[] = []
  const outerFringe: string[] = []

  // Inner fringe: test each mastered item q in K
  for (const q of stateItems) {
    const reduced = stateItems.filter((item) => item !== q).sort()
    const key = canonicalKey(reduced)
    if (allStatesMap.has(key)) {
      innerFringe.push(q)
    }
  }

  // Outer fringe: test each unmastered item q in Q \ K
  for (const q of domainItemIds) {
    if (!stateSet.has(q)) {
      const expanded = [...stateItems, q].sort()
      const key = canonicalKey(expanded)
      if (allStatesMap.has(key)) {
        outerFringe.push(q)
      }
    }
  }

  return {
    stateId: canonicalKey(stateItems),
    innerFringe: innerFringe.sort(),
    outerFringe: outerFringe.sort(),
  }
}

// ============================================================================
// 3. METRICS & STATE TRANSITION GRAPH
// ============================================================================

/**
 * Computes the symmetric difference distance d(K, L) = |(K \ L) ∪ (L \ K)|.
 */
export function computeSymmetricDistance(itemsA: string[], itemsB: string[]): number {
  const setA = new Set(itemsA)
  const setB = new Set(itemsB)
  let diff = 0

  for (const x of setA) {
    if (!setB.has(x)) diff++
  }
  for (const y of setB) {
    if (!setA.has(y)) diff++
  }

  return diff
}

/**
 * Finds the nearest valid knowledge states to an arbitrary item response set.
 */
export function findNearestStates(
  targetItems: string[],
  structure: KnowledgeStructure,
  limit: number = 3,
): Array<{ state: KnowledgeState; distance: number }> {
  const scored = structure.states.map((state) => ({
    state,
    distance: computeSymmetricDistance(targetItems, state.itemIds),
  }))

  scored.sort((a, b) => a.distance - b.distance || a.state.level - b.state.level)
  return scored.slice(0, limit)
}

/**
 * Builds the direct single-item state transition graph (Hasse diagram of knowledge states).
 * An edge K -> L exists iff L = K ∪ {q} for some item q, and both K, L ∈ K.
 */
export function buildStateTransitionGraph(structure: KnowledgeStructure): {
  nodes: Array<{ id: string; label: string; level: number; size: number }>
  edges: Array<{ source: string; target: string; addedItemId: string }>
} {
  const stateMap = new Map(structure.states.map((s) => [s.stateId, s]))
  const edges: Array<{ source: string; target: string; addedItemId: string }> = []

  for (const source of structure.states) {
    const fringes = computeFringes(source.itemIds, structure)
    for (const item of fringes.outerFringe) {
      const nextItems = [...source.itemIds, item].sort()
      const targetId = canonicalKey(nextItems)
      if (stateMap.has(targetId)) {
        edges.push({
          source: source.stateId,
          target: targetId,
          addedItemId: item,
        })
      }
    }
  }

  const nodes = structure.states.map((s) => ({
    id: s.stateId,
    label: s.stateId === '∅' ? '∅ (Empty)' : s.itemIds.join(', '),
    level: s.level,
    size: s.level,
  }))

  return { nodes, edges }
}

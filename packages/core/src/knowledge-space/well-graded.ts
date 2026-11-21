/**
 * @file well-graded.ts
 * @description Well-Graded Knowledge Structures, Learning Spaces, and Learning Path Enumeration
 *
 * Implements:
 * - Well-gradedness verification (Doignon & Falmagne 1999; Falmagne & Doignon 2011 "Learning Spaces")
 * - Geodesic metric property: shortest path in state graph equals symmetric difference d(K, L)
 * - Pedagogical learning path (gradation chain) enumeration from ∅ to Q
 * - Step-gap detection and repair mechanisms
 *
 * @module @learning-hub/core/knowledge-space
 */

import type {
  KnowledgeState,
  KnowledgeStructure,
  KSTLearningPath,
  KSTLearningPathStep,
} from './types'
import { computeFringes, computeSymmetricDistance } from './structure'
import { canonicalKey } from './surmise'

// ============================================================================
// 1. WELL-GRADEDNESS VERIFICATION
// ============================================================================

/**
 * Verifies whether a knowledge structure is well-graded (a Learning Space).
 * In a learning space, between any two states K and L with d(K, L) = m,
 * there exists a tight path K0 = K, K1, ..., Km = L with d(Ki-1, Ki) = 1.
 */
export function verifyWellGradedStructure(structure: KnowledgeStructure): {
  isWellGraded: boolean
  violations: Array<{ stateA: string; stateB: string; distance: number; reason: string }>
} {
  const violations: Array<{ stateA: string; stateB: string; distance: number; reason: string }> = []
  const stateMap = new Map(structure.states.map((s) => [s.stateId, s]))

  // Build adjacency list for distance 1
  const adj = new Map<string, Set<string>>()
  for (const s of structure.states) {
    adj.set(s.stateId, new Set())
  }

  for (const s of structure.states) {
    const fringes = computeFringes(s.itemIds, structure)
    for (const q of fringes.outerFringe) {
      const nextKey = canonicalKey([...s.itemIds, q])
      if (stateMap.has(nextKey)) {
        adj.get(s.stateId)!.add(nextKey)
        adj.get(nextKey)!.add(s.stateId)
      }
    }
  }

  // BFS shortest path to verify geodesic property
  for (let i = 0; i < structure.states.length; i++) {
    const startState = structure.states[i]!
    const distances = new Map<string, number>()
    const queue: string[] = [startState.stateId]
    distances.set(startState.stateId, 0)

    while (queue.length > 0) {
      const curr = queue.shift()!
      const currDist = distances.get(curr)!
      const neighbors = adj.get(curr) || new Set()

      for (const nxt of neighbors) {
        if (!distances.has(nxt)) {
          distances.set(nxt, currDist + 1)
          queue.push(nxt)
        }
      }
    }

    // Verify distance for each target state
    for (let j = i + 1; j < structure.states.length; j++) {
      const targetState = structure.states[j]!
      const symDiff = computeSymmetricDistance(startState.itemIds, targetState.itemIds)
      const graphDist = distances.get(targetState.stateId)

      if (graphDist === undefined || graphDist !== symDiff) {
        violations.push({
          stateA: startState.stateId,
          stateB: targetState.stateId,
          distance: symDiff,
          reason:
            graphDist === undefined
              ? 'Disconnected in transition graph'
              : `Geodesic violation: graph shortest path is ${graphDist}, but symmetric difference is ${symDiff}`,
        })
        if (violations.length > 15) break
      }
    }
    if (violations.length > 15) break
  }

  return {
    isWellGraded: violations.length === 0,
    violations,
  }
}

// ============================================================================
// 2. LEARNING PATH (GRADATION) ENUMERATION
// ============================================================================

/**
 * Enumerates all valid learning paths from ∅ to Q in a well-graded space.
 * Each learning path is a maximal sequence where each step introduces exactly one new skill item.
 *
 * @param structure The knowledge structure
 * @param maxPaths Maximum number of paths to return (avoids combinatorial explosion in large domains)
 */
export function enumerateLearningPaths(
  structure: KnowledgeStructure,
  maxPaths: number = 20,
): KSTLearningPath[] {
  const domainSize = structure.domainItems.length
  const emptyState = structure.states.find((s) => s.level === 0)
  if (!emptyState) return []

  const paths: KSTLearningPath[] = []
  let pathCounter = 1

  function dfs(currentState: KnowledgeState, currentPath: KSTLearningPathStep[]) {
    if (paths.length >= maxPaths) return

    if (currentState.level === domainSize) {
      paths.push({
        id: `learning-path-${pathCounter++}`,
        steps: [...currentPath],
      })
      return
    }

    const fringes = computeFringes(currentState.itemIds, structure)
    for (const nextItem of fringes.outerFringe) {
      const nextItems = [...currentState.itemIds, nextItem].sort()
      const nextKey = canonicalKey(nextItems)
      const nextState = structure.states.find((s) => s.stateId === nextKey)

      if (nextState) {
        currentPath.push({
          step: currentPath.length + 1,
          addedItemId: nextItem,
          stateId: nextKey,
          stateSize: nextState.level,
        })

        dfs(nextState, currentPath)
        currentPath.pop()
      }
    }
  }

  dfs(emptyState, [
    {
      step: 0,
      addedItemId: 'START',
      stateId: emptyState.stateId,
      stateSize: 0,
    },
  ])

  return paths
}

/**
 * Computes the total number of distinct learning paths through dynamic programming on the DAG.
 */
export function countTotalLearningPaths(structure: KnowledgeStructure): number {
  const sortedStates = [...structure.states].sort((a, b) => a.level - b.level)
  const pathCounts = new Map<string, number>()

  const emptyState = sortedStates.find((s) => s.level === 0)
  if (!emptyState) return 0
  pathCounts.set(emptyState.stateId, 1)

  for (const state of sortedStates) {
    const currentCount = pathCounts.get(state.stateId) || 0
    if (currentCount === 0) continue

    const fringes = computeFringes(state.itemIds, structure)
    for (const nextItem of fringes.outerFringe) {
      const nextKey = canonicalKey([...state.itemIds, nextItem])
      const existing = pathCounts.get(nextKey) || 0
      pathCounts.set(nextKey, existing + currentCount)
    }
  }

  const fullState = sortedStates.find((s) => s.level === structure.domainItems.length)
  return fullState ? pathCounts.get(fullState.stateId) || 0 : 0
}

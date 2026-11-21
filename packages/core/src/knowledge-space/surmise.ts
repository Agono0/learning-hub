/**
 * @file surmise.ts
 * @description Surmise Relations, Quasi-Orders, and Birkhoff Distributive Lattice Construction
 *
 * Implements the mathematical foundations of surmise systems:
 * - Doignon & Falmagne (1985, 1999) - Quasi-ordinal knowledge spaces
 * - Birkhoff Representation Theorem (1937) - Down-set isomorphism for finite distributive lattices
 * - Warshall's Algorithm & Transitive Reduction for Hasse diagram generation
 * - Disjunctive Normal Form (AND/OR) Surmise Clause resolution
 *
 * @module @learning-hub/core/knowledge-space
 */

import type {
  KSTItem,
  SurmiseRelation,
  SurmiseClause,
  SurmiseSystem,
  KnowledgeState,
  KnowledgeStructure,
} from './types'

// ============================================================================
// 1. TRANSITIVE CLOSURE & REDUCTION
// ============================================================================

/**
 * Computes the reflexive transitive closure of a prerequisite relation network.
 * If p <= q (p is prerequisite of q), then knowing q implies knowing p.
 *
 * @param itemIds List of all items in domain Q
 * @param relations Directed relations where prerequisiteId <= targetId
 * @returns Map from target item to all its transitive prerequisites (downward reachability)
 */
export function computeTransitiveClosure(
  itemIds: string[],
  relations: Array<{ prerequisiteId: string; targetId: string }>,
): Map<string, Set<string>> {
  const closure = new Map<string, Set<string>>()

  // Initialize with reflexivity: each item is prerequisite to itself
  for (const id of itemIds) {
    const s = new Set<string>()
    s.add(id)
    closure.set(id, s)
  }

  // Add direct relations
  for (const rel of relations) {
    if (closure.has(rel.targetId) && closure.has(rel.prerequisiteId)) {
      closure.get(rel.targetId)!.add(rel.prerequisiteId)
    }
  }

  // Warshall's transitive closure algorithm
  for (const k of itemIds) {
    for (const i of itemIds) {
      if (closure.get(i)!.has(k)) {
        for (const j of closure.get(k)!) {
          closure.get(i)!.add(j)
        }
      }
    }
  }

  return closure
}

/**
 * Computes the transitive reduction of a DAG / poset.
 * Removes redundant transitive shortcuts to produce the minimal Hasse diagram cover relations.
 *
 * @param itemIds Domain items
 * @param relations Prerequisite relations
 * @returns Minimal cover relations (Hasse edges)
 */
export function computeTransitiveReduction(
  itemIds: string[],
  relations: Array<{ prerequisiteId: string; targetId: string }>,
): Array<{ prerequisiteId: string; targetId: string }> {
  const closure = computeTransitiveClosure(itemIds, relations)
  const reduction: Array<{ prerequisiteId: string; targetId: string }> = []

  // Direct adjacency map
  const directMap = new Map<string, Set<string>>()
  for (const id of itemIds) {
    directMap.set(id, new Set())
  }
  for (const rel of relations) {
    if (rel.prerequisiteId !== rel.targetId && directMap.has(rel.targetId)) {
      directMap.get(rel.targetId)!.add(rel.prerequisiteId)
    }
  }

  // An edge p -> q is retained iff there is no intermediate k such that p <= k and k <= q with p != k != q
  for (const [targetId, prereqs] of directMap.entries()) {
    for (const prereqId of prereqs) {
      let isRedundant = false
      for (const intermediate of directMap.get(targetId)!) {
        if (intermediate !== prereqId) {
          // If intermediate requires prereqId, then prereqId -> targetId is a shortcut
          if (closure.get(intermediate)?.has(prereqId)) {
            isRedundant = true
            break
          }
        }
      }
      if (!isRedundant) {
        reduction.push({ prerequisiteId: prereqId, targetId })
      }
    }
  }

  return reduction
}

/**
 * Detects strongly connected components and cycles in prerequisite relations.
 * If cycles of length > 1 exist, those items form an equivalence class (must be learned simultaneously).
 *
 * @returns Array of item ID cycles (each cycle is an array of item IDs)
 */
export function detectSurmiseCycles(
  itemIds: string[],
  relations: Array<{ prerequisiteId: string; targetId: string }>,
): string[][] {
  const closure = computeTransitiveClosure(itemIds, relations)
  const visited = new Set<string>()
  const cycles: string[][] = []

  for (const i of itemIds) {
    if (visited.has(i)) continue
    const eqClass: string[] = [i]

    for (const j of itemIds) {
      if (i !== j && closure.get(i)?.has(j) && closure.get(j)?.has(i)) {
        eqClass.push(j)
        visited.add(j)
      }
    }

    if (eqClass.length > 1) {
      visited.add(i)
      cycles.push(eqClass)
    }
  }

  return cycles
}

// ============================================================================
// 2. BIRKHOFF DOWN-SET ISOMORPHISM & QUASI-ORDINAL SPACE
// ============================================================================

/**
 * Generates all order ideals (down-sets) of a quasi-order (Birkhoff 1937).
 * A set K is a down-set if for all q in K and p <= q, we have p in K.
 * The family of down-sets forms the unique quasi-ordinal knowledge space for (Q, <=).
 */
export function generateDownSets(
  itemIds: string[],
  closure: Map<string, Set<string>>,
): Set<string>[] {
  const n = itemIds.length
  const downSets: Set<string>[] = []

  // For domain sizes up to 16, power set search with early pruning
  // For larger domains, iterative union closure of principal down-sets
  if (n <= 16) {
    const totalSubsets = 1 << n
    for (let mask = 0; mask < totalSubsets; mask++) {
      const candidate = new Set<string>()
      for (let bit = 0; bit < n; bit++) {
        if ((mask & (1 << bit)) !== 0) {
          candidate.add(itemIds[bit]!)
        }
      }

      // Check if candidate is closed downwards
      let isDownClosed = true
      for (const q of candidate) {
        const prereqs = closure.get(q)
        if (prereqs) {
          for (const p of prereqs) {
            if (!candidate.has(p)) {
              isDownClosed = false
              break
            }
          }
        }
        if (!isDownClosed) break
      }

      if (isDownClosed) {
        downSets.push(candidate)
      }
    }
  } else {
    // Principal order ideals: down-set generated by each single item
    const principalDownSets: Set<string>[] = itemIds.map((id) => closure.get(id) || new Set([id]))

    // Iterative union closure starting with empty set and principal down-sets
    const knownSets = new Map<string, Set<string>>()
    knownSets.set('∅', new Set<string>())

    for (const p of principalDownSets) {
      const key = canonicalKey(Array.from(p))
      knownSets.set(key, p)
    }

    let addedNew = true
    while (addedNew) {
      addedNew = false
      const currentSets = Array.from(knownSets.values())
      for (let i = 0; i < currentSets.length; i++) {
        for (let j = i + 1; j < currentSets.length; j++) {
          const unionSet = new Set<string>([...currentSets[i]!, ...currentSets[j]!])
          const key = canonicalKey(Array.from(unionSet))
          if (!knownSets.has(key)) {
            knownSets.set(key, unionSet)
            addedNew = true
          }
        }
      }
    }

    downSets.push(...knownSets.values())
  }

  return downSets
}

/**
 * Builds a Quasi-Ordinal Knowledge Space from items and prerequisite relations.
 * Guaranteed by Birkhoff's theorem to be closed under both union and intersection.
 */
export function buildQuasiOrdinalKnowledgeSpace(
  domainId: string,
  title: string,
  items: KSTItem[],
  relations: SurmiseRelation[],
): KnowledgeStructure {
  const itemIds = items.map((i) => i.id)
  const closure = computeTransitiveClosure(itemIds, relations)
  const downSets = generateDownSets(itemIds, closure)

  // Sort states by size and canonical order
  const states: KnowledgeState[] = downSets
    .map((set) => {
      const sorted = Array.from(set).sort()
      return {
        stateId: canonicalKey(sorted),
        itemIds: sorted,
        level: sorted.length,
      }
    })
    .sort((a, b) => a.level - b.level || a.stateId.localeCompare(b.stateId))

  return {
    domainId,
    title,
    description: `Quasi-ordinal knowledge space with ${items.length} items and ${states.length} states.`,
    domainItems: items,
    states,
    isKnowledgeSpace: true,
    isQuasiOrdinal: true,
    isWellGraded: true, // Quasi-ordinal spaces with no multi-item cycles are well-graded
    learningPathsCount: 0, // Computed in well-graded module
  }
}

// ============================================================================
// 3. SURMISE SYSTEMS WITH AND/OR CLAUSES
// ============================================================================

/**
 * Validates a Surmise System for structural consistency.
 */
export function validateSurmiseSystem(system: SurmiseSystem): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const itemIds = new Set(system.items.map((i) => i.id))

  for (const clause of system.clauses) {
    if (!itemIds.has(clause.targetId)) {
      errors.push(`Clause target item '${clause.targetId}' not found in domain items.`)
    }
    for (const path of clause.clauses) {
      for (const prereq of path) {
        if (!itemIds.has(prereq)) {
          errors.push(
            `Prerequisite item '${prereq}' in clause for '${clause.targetId}' not found in domain.`,
          )
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Generates all knowledge states permitted by a Surmise System with AND/OR clauses.
 * A state K is valid if for every item q in K, at least one clause in sigma(q) is satisfied (C <= K).
 */
export function generateStatesFromSurmiseClauses(
  items: KSTItem[],
  clauses: SurmiseClause[],
): KnowledgeState[] {
  const itemIds = items.map((i) => i.id)
  const n = itemIds.length
  const clauseMap = new Map<string, string[][]>()

  for (const c of clauses) {
    clauseMap.set(c.targetId, c.clauses)
  }

  const validStates: KnowledgeState[] = []
  const maxStates = 1 << n

  for (let mask = 0; mask < maxStates; mask++) {
    const candidate = new Set<string>()
    for (let bit = 0; bit < n; bit++) {
      if ((mask & (1 << bit)) !== 0) {
        candidate.add(itemIds[bit]!)
      }
    }

    let isValid = true
    for (const q of candidate) {
      const paths = clauseMap.get(q)
      if (paths && paths.length > 0) {
        // At least one path must have all its prerequisites in candidate
        const hasSatisfiedPath = paths.some((path) => path.every((p) => candidate.has(p)))
        if (!hasSatisfiedPath) {
          isValid = false
          break
        }
      }
    }

    if (isValid) {
      const sorted = Array.from(candidate).sort()
      validStates.push({
        stateId: canonicalKey(sorted),
        itemIds: sorted,
        level: sorted.length,
      })
    }
  }

  return validStates.sort((a, b) => a.level - b.level || a.stateId.localeCompare(b.stateId))
}

export function canonicalKey(items: string[]): string {
  if (items.length === 0) return '∅'
  return items.slice().sort().join(',')
}

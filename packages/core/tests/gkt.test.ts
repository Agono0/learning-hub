import { describe, expect, it } from 'vitest'
import {
  GktEdge,
  GktNode,
  propagateGktBelief,
  topologicalSortGkt,
  wouldIntroduceCycle,
} from '../src/gkt'

describe('Graph Knowledge Tracing (GKT) Domain', () => {
  describe('wouldIntroduceCycle', () => {
    it('detects self-loops and multi-hop cycles', () => {
      const edges: GktEdge[] = [
        { prerequisiteId: 'A', dependentId: 'B', weight: 1.0 },
        { prerequisiteId: 'B', dependentId: 'C', weight: 1.0 },
      ]
      // Self loop
      expect(wouldIntroduceCycle(edges, { prerequisiteId: 'A', dependentId: 'A' })).toBe(true)
      // Cycle: C -> A
      expect(wouldIntroduceCycle(edges, { prerequisiteId: 'C', dependentId: 'A' })).toBe(true)
      // Valid edge: A -> D
      expect(wouldIntroduceCycle(edges, { prerequisiteId: 'A', dependentId: 'D' })).toBe(false)
    })
  })

  describe('propagateGktBelief & Root-Cause Diagnosis', () => {
    it('propagates failure upstream and alerts on prerequisite weakness', () => {
      const nodes = new Map<string, GktNode>([
        [
          'linear-algebra-basics',
          {
            id: 'linear-algebra-basics',
            title: 'Matrix Multiplication',
            masteryProb: 0.55, // Already somewhat weak
            slipProb: 0.1,
            guessProb: 0.2,
            transitProb: 0.15,
          },
        ],
        [
          'svd-decomposition',
          {
            id: 'svd-decomposition',
            title: 'Singular Value Decomposition',
            masteryProb: 0.4,
            slipProb: 0.1,
            guessProb: 0.2,
            transitProb: 0.15,
          },
        ],
      ])

      const edges: GktEdge[] = [
        {
          prerequisiteId: 'linear-algebra-basics',
          dependentId: 'svd-decomposition',
          weight: 1.0,
        },
      ]

      // Learner fails SVD question
      const result = propagateGktBelief(nodes, edges, {
        nodeId: 'svd-decomposition',
        passed: false,
      })

      expect(result.updatedMasteries['svd-decomposition']).toBeLessThan(0.4)
      expect(result.updatedMasteries['linear-algebra-basics']).toBeLessThan(0.55)
      expect(result.rootCauseAlert).toBeDefined()
      expect(result.rootCauseAlert?.culpritPrerequisiteId).toBe('linear-algebra-basics')
      expect(result.rootCauseAlert?.message).toContain('Matrix Multiplication')
    })

    it('boosts target and propagates positive credit downstream upon success', () => {
      const nodes = new Map<string, GktNode>([
        [
          'concept-a',
          {
            id: 'concept-a',
            title: 'Derivatives',
            masteryProb: 0.5,
            slipProb: 0.1,
            guessProb: 0.2,
            transitProb: 0.15,
          },
        ],
        [
          'concept-b',
          {
            id: 'concept-b',
            title: 'Taylor Series',
            masteryProb: 0.3,
            slipProb: 0.1,
            guessProb: 0.2,
            transitProb: 0.15,
          },
        ],
      ])

      const edges: GktEdge[] = [
        { prerequisiteId: 'concept-a', dependentId: 'concept-b', weight: 1.0 },
      ]

      const result = propagateGktBelief(nodes, edges, {
        nodeId: 'concept-a',
        passed: true,
      })

      expect(result.updatedMasteries['concept-a']).toBeGreaterThan(0.5)
      expect(result.updatedMasteries['concept-b']).toBeGreaterThan(0.3)
      expect(result.rootCauseAlert).toBeUndefined()
    })
  })

  describe('topologicalSortGkt', () => {
    it('sorts nodes in valid dependency order', () => {
      const nodes: GktNode[] = [
        { id: 'C', title: 'C', masteryProb: 0.1, slipProb: 0.1, guessProb: 0.2, transitProb: 0.15 },
        { id: 'A', title: 'A', masteryProb: 0.1, slipProb: 0.1, guessProb: 0.2, transitProb: 0.15 },
        { id: 'B', title: 'B', masteryProb: 0.1, slipProb: 0.1, guessProb: 0.2, transitProb: 0.15 },
      ]
      const edges: GktEdge[] = [
        { prerequisiteId: 'A', dependentId: 'B', weight: 1.0 },
        { prerequisiteId: 'B', dependentId: 'C', weight: 1.0 },
      ]

      const sorted = topologicalSortGkt(nodes, edges)
      const ids = sorted.map((n) => n.id)
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'))
      expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'))
    })
  })
})

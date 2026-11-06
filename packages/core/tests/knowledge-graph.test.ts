import { describe, expect, it } from 'vitest'
import {
  evaluateRemedialPause,
  topologicalSort,
  willCreateCycle,
  type ConceptNode,
  type PrerequisiteEdge,
} from '../src/knowledge-graph'

describe('knowledge graph & prerequisite DAG', () => {
  it('detects cycles before adding an edge', () => {
    const edges: PrerequisiteEdge[] = [
      { from: 'algebra', to: 'calculus', strength: 1.0 },
      { from: 'calculus', to: 'differential-equations', strength: 1.0 },
    ]

    // Adding differential-equations -> algebra would create a cycle
    expect(
      willCreateCycle(edges, { from: 'differential-equations', to: 'algebra', strength: 1.0 }),
    ).toBe(true)

    // Self loop
    expect(willCreateCycle(edges, { from: 'algebra', to: 'algebra', strength: 1.0 })).toBe(true)

    // Valid forward edge
    expect(willCreateCycle(edges, { from: 'algebra', to: 'geometry', strength: 1.0 })).toBe(false)
  })

  it('performs topological sorting on valid DAG', () => {
    const nodes: ConceptNode[] = [
      { id: 'diff-eq', title: 'Differential Equations', mastery: 0.5, lapses: 0 },
      { id: 'algebra', title: 'Algebra', mastery: 0.9, lapses: 0 },
      { id: 'calculus', title: 'Calculus', mastery: 0.8, lapses: 0 },
    ]
    const edges: PrerequisiteEdge[] = [
      { from: 'algebra', to: 'calculus', strength: 1.0 },
      { from: 'calculus', to: 'diff-eq', strength: 1.0 },
    ]

    const order = topologicalSort(nodes, edges)
    expect(order).toEqual(['algebra', 'calculus', 'diff-eq'])
  })

  it('evaluates remedial pause when prerequisite mastery is inadequate', () => {
    const nodes: ConceptNode[] = [
      { id: 'linear-algebra', title: 'Linear Algebra', mastery: 0.45, lapses: 1 },
      { id: 'neural-networks', title: 'Neural Networks', mastery: 0.2, lapses: 0 },
    ]
    const edges: PrerequisiteEdge[] = [
      { from: 'linear-algebra', to: 'neural-networks', strength: 1.0 },
    ]

    const check = evaluateRemedialPause('neural-networks', nodes, edges, 0.7)
    expect(check.blocked).toBe(true)
    expect(check.remedialConceptId).toBe('linear-algebra')
    expect(check.reason).toContain('Linear Algebra')
  })

  it('allows progression when prerequisites are mastered', () => {
    const nodes: ConceptNode[] = [
      { id: 'linear-algebra', title: 'Linear Algebra', mastery: 0.88, lapses: 0 },
      { id: 'neural-networks', title: 'Neural Networks', mastery: 0.2, lapses: 0 },
    ]
    const edges: PrerequisiteEdge[] = [
      { from: 'linear-algebra', to: 'neural-networks', strength: 1.0 },
    ]

    const check = evaluateRemedialPause('neural-networks', nodes, edges, 0.7)
    expect(check.blocked).toBe(false)
  })
})

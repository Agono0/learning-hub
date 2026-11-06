/**
 * @fileoverview Adaptive Knowledge Graph & Prerequisite Dependency Engine.
 *
 * Implements a Directed Acyclic Graph (DAG) for curriculum concepts and skills:
 * - Cycle detection and topological sort
 * - Prerequisite mastery checks
 * - Remedial learning pause logic: detects when failures in a root prerequisite
 *   must temporarily pause dependent units until prerequisite stability improves.
 */
import { z } from 'zod'

export const conceptNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mastery: z.number().min(0).max(1).default(0),
  lapses: z.number().int().nonnegative().default(0),
})
export type ConceptNode = z.infer<typeof conceptNodeSchema>

export const prerequisiteEdgeSchema = z.object({
  from: z.string().min(1), // prerequisite concept
  to: z.string().min(1), // dependent concept
  strength: z.number().min(0).max(1).default(1.0),
})
export type PrerequisiteEdge = z.infer<typeof prerequisiteEdgeSchema>

export interface RemedialCheckResult {
  blocked: boolean
  conceptId: string
  remedialConceptId?: string
  reason?: string
}

/**
 * Validates that an edge does not introduce a cycle into the graph.
 * Returns true if the graph remains a DAG, false if a cycle is created.
 */
export function willCreateCycle(edges: PrerequisiteEdge[], newEdge: PrerequisiteEdge): boolean {
  if (newEdge.from === newEdge.to) return true

  // BFS / DFS from newEdge.to searching for newEdge.from
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.from) ?? []
    list.push(e.to)
    adj.set(e.from, list)
  }

  // If a path already exists from newEdge.to to newEdge.from, adding from->to creates a cycle
  const visited = new Set<string>()
  const queue: string[] = [newEdge.to]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (curr === newEdge.from) return true
    if (!visited.has(curr)) {
      visited.add(curr)
      const nexts = adj.get(curr) ?? []
      for (const n of nexts) {
        if (!visited.has(n)) queue.push(n)
      }
    }
  }

  return false
}

/**
 * Computes a topological ordering of concepts given the prerequisite edges.
 * Throws an error if the graph contains cycles.
 */
export function topologicalSort(nodes: ConceptNode[], edges: PrerequisiteEdge[]): string[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
  }

  for (const e of edges) {
    if (!inDegree.has(e.from)) inDegree.set(e.from, 0)
    if (!inDegree.has(e.to)) inDegree.set(e.to, 0)
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)

    const list = adj.get(e.from) ?? []
    list.push(e.to)
    adj.set(e.from, list)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }

  const order: string[] = []
  while (queue.length > 0) {
    const curr = queue.shift()!
    order.push(curr)

    const nexts = adj.get(curr) ?? []
    for (const n of nexts) {
      const nextDeg = (inDegree.get(n) ?? 1) - 1
      inDegree.set(n, nextDeg)
      if (nextDeg === 0) queue.push(n)
    }
  }

  if (order.length < inDegree.size) {
    throw new Error('Knowledge graph contains cycles; cannot produce topological order.')
  }

  return order
}

/**
 * Evaluates whether a target concept should trigger a remedial learning pause
 * due to under-mastered prerequisites or recent lapse spikes in root concepts.
 *
 * @param targetConceptId - The concept the learner wants to practice.
 * @param nodes - Node list with current mastery and lapse statistics.
 * @param edges - Directed prerequisite relations (from -> to).
 * @param minMasteryThreshold - Minimum prerequisite mastery required (default 0.70).
 */
export function evaluateRemedialPause(
  targetConceptId: string,
  nodes: ConceptNode[],
  edges: PrerequisiteEdge[],
  minMasteryThreshold = 0.7,
): RemedialCheckResult {
  const nodeMap = new Map<string, ConceptNode>(nodes.map((n) => [n.id, n]))
  const directPrereqs = edges.filter((e) => e.to === targetConceptId).map((e) => e.from)

  for (const prereqId of directPrereqs) {
    const prereq = nodeMap.get(prereqId)
    if (!prereq) continue

    // Remedial trigger 1: Prerequisite mastery below minimum bar
    if (prereq.mastery < minMasteryThreshold) {
      return {
        blocked: true,
        conceptId: targetConceptId,
        remedialConceptId: prereqId,
        reason: `Prerequisite "${prereq.title}" mastery (${Math.round(prereq.mastery * 100)}%) is below required ${Math.round(minMasteryThreshold * 100)}%.`,
      }
    }

    // Remedial trigger 2: Recent lapse spike in prerequisite
    if (prereq.lapses >= 3) {
      return {
        blocked: true,
        conceptId: targetConceptId,
        remedialConceptId: prereqId,
        reason: `Prerequisite "${prereq.title}" has ${prereq.lapses} recent lapses. Refresh this foundation before continuing.`,
      }
    }
  }

  return {
    blocked: false,
    conceptId: targetConceptId,
  }
}

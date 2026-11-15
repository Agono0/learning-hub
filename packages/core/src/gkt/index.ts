/**
 * Learning HUB — Graph Knowledge Tracing (GKT) & Prerequisite DAG Engine.
 *
 * Implements:
 * 1. Bayesian Knowledge Tracing with bidirectional DAG propagation (Nakagawa et al. 2019; Corbett & Anderson 1995).
 * 2. Root-cause misconception diagnosis: when advanced concept fails, blame propagates upstream
 *    to pinpoint prerequisite bottlenecks.
 * 3. Topological sorting and cycle prevention.
 */
import { z } from 'zod'

export const gktNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  courseId: z.number().int().positive().optional(),
  masteryProb: z.number().min(0.001).max(0.999).default(0.1),
  slipProb: z.number().min(0.01).max(0.4).default(0.1),
  guessProb: z.number().min(0.01).max(0.5).default(0.2),
  transitProb: z.number().min(0.01).max(0.5).default(0.15),
  lastAssessedAt: z.string().optional(),
})
export type GktNode = z.infer<typeof gktNodeSchema>

export const gktEdgeSchema = z.object({
  prerequisiteId: z.string().min(1),
  dependentId: z.string().min(1),
  weight: z.number().min(0.1).max(1.0).default(1.0),
})
export type GktEdge = z.infer<typeof gktEdgeSchema>

export interface GktUpdateEvent {
  nodeId: string
  passed: boolean
}

export interface RootCauseDiagnosis {
  culpritPrerequisiteId: string
  culpritTitle?: string
  currentMastery: number
  failedDependentId: string
  message: string
}

export interface GktPropagationResult {
  updatedMasteries: Record<string, number> // nodeId -> new masteryProb
  rootCauseAlert?: RootCauseDiagnosis
}

/**
 * Checks if adding an edge from `prereqId` to `dependentId` would introduce a cycle.
 */
export function wouldIntroduceCycle(
  edges: GktEdge[],
  newEdge: { prerequisiteId: string; dependentId: string },
): boolean {
  if (newEdge.prerequisiteId === newEdge.dependentId) return true

  // Check if a path already exists from dependentId -> prerequisiteId
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.prerequisiteId) ?? []
    list.push(e.dependentId)
    adj.set(e.prerequisiteId, list)
  }

  const visited = new Set<string>()
  const queue = [newEdge.dependentId]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (curr === newEdge.prerequisiteId) return true // Path found: adding newEdge would cycle
    if (!visited.has(curr)) {
      visited.add(curr)
      const neighbors = adj.get(curr) ?? []
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n)
      }
    }
  }

  return false
}

/**
 * Executes Bayesian belief propagation across the knowledge graph:
 * 1. Computes local posterior mastery P(L_target | outcome).
 * 2. If failed, propagates blame upstream to direct prerequisites. If any prerequisite
 *    mastery falls below 0.60, triggers a Root-Cause Diagnosis naming the weakest one.
 * 3. If passed, propagates positive credit downstream to dependents.
 */
export function propagateGktBelief(
  nodes: Map<string, GktNode>,
  edges: GktEdge[],
  event: GktUpdateEvent,
): GktPropagationResult {
  const target = nodes.get(event.nodeId)
  if (!target) {
    throw new Error(`Target concept "${event.nodeId}" not found in GKT graph`)
  }

  const updatedMasteries: Record<string, number> = {}

  // 1. Local BKT update on target
  const pL = target.masteryProb
  let posteriorL: number

  if (event.passed) {
    const pCorrectGivenKnown = 1 - target.slipProb
    const pCorrectGivenUnknown = target.guessProb
    const pTotalCorrect = pL * pCorrectGivenKnown + (1 - pL) * pCorrectGivenUnknown
    posteriorL = (pL * pCorrectGivenKnown) / (pTotalCorrect || 1)
  } else {
    const pWrongGivenKnown = target.slipProb
    const pWrongGivenUnknown = 1 - target.guessProb
    const pTotalWrong = pL * pWrongGivenKnown + (1 - pL) * pWrongGivenUnknown
    posteriorL = (pL * pWrongGivenKnown) / (pTotalWrong || 1)
  }

  // Knowledge acquisition transition step
  const newTargetMastery = posteriorL + (1 - posteriorL) * target.transitProb
  const clampedTarget = Math.max(0.01, Math.min(0.99, Math.round(newTargetMastery * 1000) / 1000))
  updatedMasteries[target.id] = clampedTarget

  let rootCauseAlert: RootCauseDiagnosis | undefined

  if (!event.passed) {
    // 2. Upstream blame propagation: find prerequisites that lead into target
    const parentEdges = edges.filter((e) => e.dependentId === event.nodeId)
    for (const edge of parentEdges) {
      const parent = nodes.get(edge.prerequisiteId)
      if (!parent) continue

      // Blame factor proportional to edge weight and slip inverse
      const blame = 0.2 * edge.weight * (1 - target.slipProb) * (1 - parent.masteryProb)
      // Floor at 0.05 — but never ABOVE the parent's current belief: a failure
      // downstream must not raise an already-weaker prerequisite.
      const floor = Math.min(0.05, parent.masteryProb)
      const degraded = Math.max(floor, Math.round((parent.masteryProb - blame) * 1000) / 1000)
      updatedMasteries[parent.id] = degraded

      // Root cause = the WEAKEST prerequisite below 0.60 (ties: first edge wins).
      if (degraded < 0.6 && (!rootCauseAlert || degraded < rootCauseAlert.currentMastery)) {
        rootCauseAlert = {
          culpritPrerequisiteId: parent.id,
          culpritTitle: parent.title,
          currentMastery: degraded,
          failedDependentId: target.id,
          message: `Failure in "${target.title}" stems from foundational gap in prerequisite "${parent.title}" (Mastery: ${Math.round(degraded * 100)}%). Reviewing prerequisite first is recommended.`,
        }
      }
    }
  } else {
    // 3. Downstream credit propagation: slight boost to immediate dependents' prior
    const childEdges = edges.filter((e) => e.prerequisiteId === event.nodeId)
    for (const edge of childEdges) {
      const child = nodes.get(edge.dependentId)
      if (!child) continue

      const boost = 0.08 * edge.weight * clampedTarget * child.transitProb
      const boosted = Math.min(0.99, Math.round((child.masteryProb + boost) * 1000) / 1000)
      updatedMasteries[child.id] = boosted
    }
  }

  return { updatedMasteries, rootCauseAlert }
}

/**
 * Topologically sorts concept nodes according to prerequisite edges.
 */
export function topologicalSortGkt(nodes: GktNode[], edges: GktEdge[]): GktNode[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
  }

  for (const e of edges) {
    if (inDegree.has(e.dependentId)) {
      inDegree.set(e.dependentId, (inDegree.get(e.dependentId) ?? 0) + 1)
    }
    const list = adj.get(e.prerequisiteId) ?? []
    list.push(e.dependentId)
    adj.set(e.prerequisiteId, list)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }

  const sorted: GktNode[] = []
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  while (queue.length > 0) {
    const currId = queue.shift()!
    const node = nodeMap.get(currId)
    if (node) sorted.push(node)

    const neighbors = adj.get(currId) ?? []
    for (const neighbor of neighbors) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  // If sorted count < nodes count, a cycle exists; return original list as fallback
  return sorted.length === nodes.length ? sorted : nodes
}

/**
 * Keep only edges whose BOTH endpoints are in `nodeIds` — a course-scoped graph must
 * not carry edges into nodes it does not contain (they would be silently dropped by
 * propagation and confuse the topological sort's in-degree counts).
 */
export function edgesWithinNodes<E extends { prerequisiteId: string; dependentId: string }>(
  edges: readonly E[],
  nodeIds: ReadonlySet<string>,
): E[] {
  return edges.filter((e) => nodeIds.has(e.prerequisiteId) && nodeIds.has(e.dependentId))
}

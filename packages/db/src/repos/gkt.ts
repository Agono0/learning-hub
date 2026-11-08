/**
 * Learning HUB — Graph Knowledge Tracing (GKT) DB Repository.
 */
import { eq, inArray } from 'drizzle-orm'
import { edgesWithinNodes } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { conceptDagEdges, conceptDagNodes } from '../schema'
import { withTransaction } from '../transaction'

export function upsertConceptDagNode(
  node: {
    id: string
    title: string
    courseId?: number
    description?: string
    masteryProb?: number
    slipProb?: number
    guessProb?: number
    transitProb?: number
  },
  database?: LearningHubDB,
): typeof conceptDagNodes.$inferSelect {
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [row] = db
    .insert(conceptDagNodes)
    .values({
      id: node.id,
      title: node.title,
      courseId: node.courseId,
      description: node.description,
      masteryProb: node.masteryProb ?? 0.1,
      slipProb: node.slipProb ?? 0.1,
      guessProb: node.guessProb ?? 0.2,
      transitProb: node.transitProb ?? 0.15,
      createdAt: nowIso,
    })
    .onConflictDoUpdate({
      target: conceptDagNodes.id,
      set: {
        title: node.title,
        description: node.description ?? null,
      },
    })
    .returning()
    .all()

  return row!
}

export function addConceptDagEdge(
  edge: {
    prerequisiteId: string
    dependentId: string
    weight?: number
  },
  database?: LearningHubDB,
): typeof conceptDagEdges.$inferSelect {
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [row] = db
    .insert(conceptDagEdges)
    .values({
      prerequisiteId: edge.prerequisiteId,
      dependentId: edge.dependentId,
      weight: edge.weight ?? 1.0,
      createdAt: nowIso,
    })
    .onConflictDoUpdate({
      target: [conceptDagEdges.prerequisiteId, conceptDagEdges.dependentId],
      set: {
        weight: edge.weight ?? 1.0,
      },
    })
    .returning()
    .all()

  return row!
}

export function getConceptDag(
  courseId?: number,
  database?: LearningHubDB,
): {
  nodes: (typeof conceptDagNodes.$inferSelect)[]
  edges: (typeof conceptDagEdges.$inferSelect)[]
} {
  const db = database ?? getDb()

  const nodes = courseId
    ? db.select().from(conceptDagNodes).where(eq(conceptDagNodes.courseId, courseId)).all()
    : db.select().from(conceptDagNodes).all()

  const nodeIds = nodes.map((n) => n.id)
  let edges: (typeof conceptDagEdges.$inferSelect)[] = []

  if (nodeIds.length > 0) {
    // Both endpoints must be inside the (course-scoped) node set — an edge into a
    // node from another course would otherwise leak into this graph.
    edges = edgesWithinNodes(
      db
        .select()
        .from(conceptDagEdges)
        .where(inArray(conceptDagEdges.prerequisiteId, nodeIds))
        .all(),
      new Set(nodeIds),
    )
  }

  return { nodes, edges }
}

/** One concept node by id, or undefined. */
export function getConceptDagNode(
  id: string,
  database?: LearningHubDB,
): typeof conceptDagNodes.$inferSelect | undefined {
  const db = database ?? getDb()
  return db.select().from(conceptDagNodes).where(eq(conceptDagNodes.id, id)).get()
}

/**
 * Persist a propagation result atomically (hard rule: multi-row writes are
 * transactional). Only `assessedNodeId` — the concept the learner was actually
 * tested on — gets a new `last_assessed_at`; neighbours moved by belief
 * propagation keep theirs, so "last assessed" stays an honest timestamp.
 * Probabilities are clamped to the schema's [0.001, 0.999] range.
 */
export function updateNodeMasteries(
  masteries: Record<string, number>,
  database?: LearningHubDB,
  assessedNodeId?: string,
): void {
  const nowIso = new Date().toISOString()
  const entries = Object.entries(masteries).filter(([, p]) => Number.isFinite(p))
  if (entries.length === 0) return

  withTransaction((tx) => {
    for (const [nodeId, prob] of entries) {
      const masteryProb = Math.min(0.999, Math.max(0.001, prob))
      const set =
        assessedNodeId === undefined || nodeId === assessedNodeId
          ? { masteryProb, lastAssessedAt: nowIso }
          : { masteryProb }
      tx.update(conceptDagNodes).set(set).where(eq(conceptDagNodes.id, nodeId)).run()
    }
  }, database)
}

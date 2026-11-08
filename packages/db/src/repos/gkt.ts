/**
 * Learning HUB — Graph Knowledge Tracing (GKT) DB Repository.
 */
import { eq, inArray } from 'drizzle-orm'
import { getDb, type LearningHubDB } from '../index'
import { conceptDagEdges, conceptDagNodes } from '../schema'

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
    edges = db
      .select()
      .from(conceptDagEdges)
      .where(inArray(conceptDagEdges.prerequisiteId, nodeIds))
      .all()
  }

  return { nodes, edges }
}

export function updateNodeMasteries(
  masteries: Record<string, number>,
  database?: LearningHubDB,
): void {
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  for (const [nodeId, prob] of Object.entries(masteries)) {
    db.update(conceptDagNodes)
      .set({
        masteryProb: prob,
        lastAssessedAt: nowIso,
      })
      .where(eq(conceptDagNodes.id, nodeId))
      .run()
  }
}

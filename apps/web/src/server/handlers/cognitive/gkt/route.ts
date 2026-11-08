/**
 * /api/cognitive/gkt — Graph Knowledge Tracing Bayesian belief propagation & root-cause diagnosis.
 *
 * GET  → the (optionally course-scoped) concept DAG, nodes topologically sorted.
 * POST → `upsert_node`, `add_edge` (refused with 409 when it would create a cycle —
 *        a prerequisite graph must stay a DAG), or `evaluate_review` (one pass/fail
 *        on a concept → BKT update + upstream blame / downstream credit, persisted
 *        atomically, with a root-cause alert naming the weakest prerequisite).
 */
import { z } from 'zod'
import {
  propagateGktBelief,
  topologicalSortGkt,
  wouldIntroduceCycle,
  type GktEdge,
  type GktNode,
} from '@learning-hub/core'
import {
  addConceptDagEdge,
  getConceptDag,
  getConceptDagNode,
  updateNodeMasteries,
  upsertConceptDagNode,
} from '@learning-hub/db'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'

const nodeIdSchema = z.string().trim().min(1).max(120)

const gktPostSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsert_node'),
    courseId: z.number().int().positive().optional(),
    nodeData: z.object({
      id: nodeIdSchema,
      title: z.string().trim().min(1).max(200),
      description: z.string().max(2000).optional(),
      masteryProb: z.number().min(0.001).max(0.999).optional(),
    }),
  }),
  z.object({
    action: z.literal('add_edge'),
    edgeData: z.object({
      prerequisiteId: nodeIdSchema,
      dependentId: nodeIdSchema,
      weight: z.number().min(0.1).max(1).optional(),
    }),
  }),
  z.object({
    action: z.literal('evaluate_review'),
    courseId: z.number().int().positive().optional(),
    nodeId: nodeIdSchema,
    passed: z.boolean(),
  }),
])

const gktQuerySchema = z.object({
  courseId: z.coerce.number().int().positive().optional(),
})

type DagRows = ReturnType<typeof getConceptDag>

function toCoreNode(n: DagRows['nodes'][number]): GktNode {
  return {
    id: n.id,
    title: n.title,
    courseId: n.courseId ?? undefined,
    masteryProb: n.masteryProb,
    slipProb: n.slipProb,
    guessProb: n.guessProb,
    transitProb: n.transitProb,
    lastAssessedAt: n.lastAssessedAt ?? undefined,
  }
}

function toCoreEdge(e: DagRows['edges'][number]): GktEdge {
  return { prerequisiteId: e.prerequisiteId, dependentId: e.dependentId, weight: e.weight }
}

export const GET = withRoute(async (req: Request) => {
  const { courseId } = readQuery(req, gktQuerySchema)
  const { nodes, edges } = getConceptDag(courseId)
  const coreEdges = edges.map(toCoreEdge)
  return Response.json({
    ok: true,
    nodes: topologicalSortGkt(nodes.map(toCoreNode), coreEdges),
    edges: coreEdges,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, gktPostSchema)

  switch (body.action) {
    case 'upsert_node': {
      const node = upsertConceptDagNode({
        id: body.nodeData.id,
        title: body.nodeData.title,
        description: body.nodeData.description,
        masteryProb: body.nodeData.masteryProb,
        courseId: body.courseId,
      })
      return Response.json({ ok: true, node })
    }

    case 'add_edge': {
      const { prerequisiteId, dependentId, weight } = body.edgeData
      if (!getConceptDagNode(prerequisiteId) || !getConceptDagNode(dependentId)) {
        throw new ApiError(404, 'both concepts must exist before they can be linked')
      }
      // Cycle check against the WHOLE graph — prerequisites may span courses.
      const all = getConceptDag().edges.map(toCoreEdge)
      if (wouldIntroduceCycle(all, { prerequisiteId, dependentId })) {
        throw new ApiError(409, 'that link would create a prerequisite cycle')
      }
      const edge = addConceptDagEdge({ prerequisiteId, dependentId, weight })
      return Response.json({ ok: true, edge })
    }

    case 'evaluate_review': {
      const { nodes, edges } = getConceptDag(body.courseId)
      const nodeMap = new Map(nodes.map((n) => [n.id, toCoreNode(n)]))
      if (!nodeMap.has(body.nodeId)) throw new ApiError(404, 'concept not found')

      const result = propagateGktBelief(nodeMap, edges.map(toCoreEdge), {
        nodeId: body.nodeId,
        passed: body.passed,
      })
      updateNodeMasteries(result.updatedMasteries, undefined, body.nodeId)

      return Response.json({
        ok: true,
        updatedMasteries: result.updatedMasteries,
        rootCauseAlert: result.rootCauseAlert,
      })
    }
  }
})

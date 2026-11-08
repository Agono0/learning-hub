/**
 * /api/cognitive/gkt — Graph Knowledge Tracing Bayesian belief propagation & root-cause diagnosis.
 */
import { z } from 'zod'
import { GktEdge, GktNode, propagateGktBelief, topologicalSortGkt } from '@learning-hub/core'
import {
  addConceptDagEdge,
  getConceptDag,
  updateNodeMasteries,
  upsertConceptDagNode,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const gktEvaluateSchema = z.object({
  action: z.enum(['evaluate_review', 'upsert_node', 'add_edge']),
  courseId: z.number().int().positive().optional(),
  nodeId: z.string().optional(),
  passed: z.boolean().optional(),
  // For node upsert
  nodeData: z
    .object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      masteryProb: z.number().optional(),
    })
    .optional(),
  // For edge add
  edgeData: z
    .object({
      prerequisiteId: z.string(),
      dependentId: z.string(),
      weight: z.number().optional(),
    })
    .optional(),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const courseId = url.searchParams.get('courseId')
    ? Number(url.searchParams.get('courseId'))
    : undefined

  const { nodes, edges } = getConceptDag(courseId)

  // Map to core GKT types
  const coreNodes: GktNode[] = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    courseId: n.courseId ?? undefined,
    masteryProb: n.masteryProb,
    slipProb: n.slipProb,
    guessProb: n.guessProb,
    transitProb: n.transitProb,
    lastAssessedAt: n.lastAssessedAt ?? undefined,
  }))

  const coreEdges: GktEdge[] = edges.map((e) => ({
    prerequisiteId: e.prerequisiteId,
    dependentId: e.dependentId,
    weight: e.weight,
  }))

  const sortedNodes = topologicalSortGkt(coreNodes, coreEdges)

  return Response.json({
    ok: true,
    nodes: sortedNodes,
    edges: coreEdges,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, gktEvaluateSchema)

  if (body.action === 'upsert_node' && body.nodeData) {
    const node = upsertConceptDagNode({
      id: body.nodeData.id,
      title: body.nodeData.title,
      description: body.nodeData.description,
      masteryProb: body.nodeData.masteryProb,
      courseId: body.courseId,
    })
    return Response.json({ ok: true, node })
  }

  if (body.action === 'add_edge' && body.edgeData) {
    const edge = addConceptDagEdge({
      prerequisiteId: body.edgeData.prerequisiteId,
      dependentId: body.edgeData.dependentId,
      weight: body.edgeData.weight,
    })
    return Response.json({ ok: true, edge })
  }

  if (body.action === 'evaluate_review') {
    if (!body.nodeId || body.passed === undefined) {
      return Response.json(
        { ok: false, error: 'nodeId and passed required for evaluate_review' },
        { status: 400 },
      )
    }

    const { nodes, edges } = getConceptDag(body.courseId)
    const nodeMap = new Map<string, GktNode>(
      nodes.map((n) => [
        n.id,
        {
          id: n.id,
          title: n.title,
          courseId: n.courseId ?? undefined,
          masteryProb: n.masteryProb,
          slipProb: n.slipProb,
          guessProb: n.guessProb,
          transitProb: n.transitProb,
        },
      ]),
    )

    const coreEdges: GktEdge[] = edges.map((e) => ({
      prerequisiteId: e.prerequisiteId,
      dependentId: e.dependentId,
      weight: e.weight,
    }))

    const result = propagateGktBelief(nodeMap, coreEdges, {
      nodeId: body.nodeId,
      passed: body.passed,
    })

    // Persist updated masteries
    updateNodeMasteries(result.updatedMasteries)

    return Response.json({
      ok: true,
      updatedMasteries: result.updatedMasteries,
      rootCauseAlert: result.rootCauseAlert,
    })
  }

  return Response.json({ ok: false, error: 'Invalid GKT request' }, { status: 400 })
})

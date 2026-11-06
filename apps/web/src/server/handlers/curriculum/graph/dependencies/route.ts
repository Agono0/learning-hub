/**
 * /api/curriculum/graph/dependencies — Manages concept prerequisite edges in the DAG.
 */
import { z } from 'zod'
import { willCreateCycle } from '@learning-hub/core/knowledge-graph'
import {
  addConceptDependency,
  listConceptDependencies,
  removeConceptDependency,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const addEdgeSchema = z.object({
  sourceConcept: z.string().min(1),
  targetConcept: z.string().min(1),
  strength: z.number().min(0).max(1).default(1.0),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const concept = url.searchParams.get('concept') || undefined
  const dependencies = listConceptDependencies(concept)

  return Response.json({
    ok: true,
    dependencies,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, addEdgeSchema)

  // Fetch existing edges to verify that this addition does not create a cycle
  const currentEdges = listConceptDependencies().map((d) => ({
    from: d.sourceConcept,
    to: d.targetConcept,
    strength: d.strength,
  }))

  const wouldCycle = willCreateCycle(currentEdges, {
    from: body.sourceConcept,
    to: body.targetConcept,
    strength: body.strength,
  })

  if (wouldCycle) {
    return Response.json(
      {
        ok: false,
        error: 'Cannot add prerequisite: would create a circular dependency in the graph.',
      },
      { status: 400 },
    )
  }

  const created = addConceptDependency(body)
  return Response.json({
    ok: true,
    dependency: created,
  })
})

export const DELETE = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = Number(url.searchParams.get('id'))
  if (!id || Number.isNaN(id)) {
    return Response.json({ ok: false, error: 'Valid id required' }, { status: 400 })
  }
  const deleted = removeConceptDependency(id)
  return Response.json({ ok: deleted })
})

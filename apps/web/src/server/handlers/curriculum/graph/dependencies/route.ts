/**
 * /api/curriculum/graph/dependencies — Manages concept prerequisite edges in the DAG.
 */
import { queryId } from '@/lib/query-params'
import { z } from 'zod'
import {
  ConceptCycleError,
  addConceptDependency,
  listConceptDependencies,
  removeConceptDependency,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const addEdgeSchema = z.object({
  sourceConcept: z.string().trim().min(1).max(200),
  targetConcept: z.string().trim().min(1).max(200),
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

  // The repo checks for cycles in the same transaction as the insert.
  let created
  try {
    created = addConceptDependency(body)
  } catch (err) {
    if (err instanceof ConceptCycleError) {
      return Response.json({ ok: false, error: err.message }, { status: 400 })
    }
    throw err
  }
  return Response.json({
    ok: true,
    dependency: created,
  })
})

export const DELETE = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = queryId(url.searchParams, 'id')
  if (id === null) {
    return Response.json({ ok: false, error: 'Valid id required' }, { status: 400 })
  }
  const deleted = removeConceptDependency(id)
  return Response.json({ ok: deleted })
})

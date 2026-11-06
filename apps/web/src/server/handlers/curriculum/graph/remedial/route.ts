/**
 * /api/curriculum/graph/remedial — Evaluates remedial prerequisite blocks.
 */
import { z } from 'zod'
import { evaluateRemedialPause, type ConceptNode } from '@learning-hub/core/knowledge-graph'
import { listConceptDependencies } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const checkRemedialSchema = z.object({
  conceptId: z.string().min(1),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        mastery: z.number().min(0).max(1).default(0),
        lapses: z.number().int().nonnegative().default(0),
      }),
    )
    .optional(),
  threshold: z.number().min(0).max(1).default(0.7),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, checkRemedialSchema)

  const edges = listConceptDependencies().map((d) => ({
    from: d.sourceConcept,
    to: d.targetConcept,
    strength: d.strength,
  }))

  const nodes: ConceptNode[] = body.nodes ?? [
    { id: body.conceptId, title: body.conceptId, mastery: 0.5, lapses: 0 },
  ]

  const result = evaluateRemedialPause(body.conceptId, nodes, edges, body.threshold)

  return Response.json({
    ok: true,
    result,
  })
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const conceptId = url.searchParams.get('conceptId')
  if (!conceptId) {
    return Response.json({ ok: false, error: 'conceptId parameter required' }, { status: 400 })
  }

  const edges = listConceptDependencies().map((d) => ({
    from: d.sourceConcept,
    to: d.targetConcept,
    strength: d.strength,
  }))

  // Fast evaluation with minimal stub nodes
  const nodes: ConceptNode[] = [{ id: conceptId, title: conceptId, mastery: 0.5, lapses: 0 }]
  const result = evaluateRemedialPause(conceptId, nodes, edges, 0.7)

  return Response.json({
    ok: true,
    result,
  })
})

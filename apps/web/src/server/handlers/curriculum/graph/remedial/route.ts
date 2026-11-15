/**
 * /api/curriculum/graph/remedial — Evaluates remedial prerequisite blocks.
 * GET ?conceptId= → honest verdict from REAL skill mastery (matched by name);
 * POST → caller-supplied nodes (programmatic/skill-linked flows).
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { evaluateRemedialPause, type ConceptNode } from '@learning-hub/core/knowledge-graph'
import { db, listConceptDependencies, mastery, skills } from '@learning-hub/db'
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

  // Honest evaluation: use REAL mastery where a curriculum skill shares the
  // concept's name; prereqs without practice data are reported as such and
  // never fabricate a verdict (a stubbed 50% would flag everything as blocked).
  const directPrereqs = [...new Set(edges.filter((e) => e.to === conceptId).map((e) => e.from))]
  const [skillRows] = await Promise.all([
    db
      .select({ name: skills.name, pKnown: mastery.pKnown, attempts: mastery.attempts })
      .from(skills)
      .leftJoin(mastery, eq(mastery.skillId, skills.id)),
  ])
  const masteryByName = new Map(skillRows.map((r) => [r.name, r]))
  const prereqs = directPrereqs.map((name) => {
    const m = masteryByName.get(name)
    return {
      name,
      masteryPct: m?.pKnown != null ? Math.round(m.pKnown * 100) / 100 : null,
      attempts: m?.attempts ?? 0,
    }
  })

  if (directPrereqs.length === 0) {
    return Response.json({
      ok: true,
      result: null,
      prereqs: [],
      message: 'No prerequisites registered for this concept — add edges in the DAG builder first.',
    })
  }
  const withData = prereqs.filter(
    (p): p is { name: string; masteryPct: number; attempts: number } => p.masteryPct !== null,
  )
  if (withData.length === 0) {
    return Response.json({
      ok: true,
      result: null,
      prereqs,
      message: 'No mastery data yet for these prerequisites — verdicts need practice data.',
    })
  }

  const nodes: ConceptNode[] = withData.map((p) => ({
    id: p.name,
    title: p.name,
    mastery: p.masteryPct,
    lapses: 0,
  }))
  const result = evaluateRemedialPause(conceptId, nodes, edges, 0.7)

  return Response.json({
    ok: true,
    result,
    prereqs,
  })
})

/**
 * POST /api/search/nl — natural-language search over the whole library.
 *
 * The AI never answers the question; it only PLANS the search (1-4 keyword
 * queries + which collections to search). The plan is executed against the
 * local FTS index (searchAll), so results are always the user's own data and
 * work identically without any provider (manual mode = the raw question).
 */
import { z } from 'zod'
import { SEARCH_KINDS, searchAll, type SearchKind } from '@learning-hub/db'
import { NL_SEARCH_SYSTEM, nlSearchPlanSchema, nlSearchPrompt } from '@learning-hub/core'
import { db } from '@/lib/db'
import { requireAI, AIUnavailableError, type AIClient } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'

const nlSearchSchema = z.object({
  question: z.string().min(1).max(800),
  mode: z.enum(['ai', 'manual']).optional().default('ai'),
})

const KIND_SET = new Set<string>(SEARCH_KINDS)

/** Runs a search plan and merges hits (FTS first query's kinds take priority). */
function executePlan(queries: string[], kinds: string[]) {
  const allowed = kinds.filter((k) => KIND_SET.has(k))
  const hitKinds = new Set<SearchKind>(
    (allowed.length > 0 ? allowed : [...SEARCH_KINDS]) as SearchKind[],
  )
  const seen = new Set<string>()
  const hits = []
  let mode: 'fts5' | 'like' = 'fts5'
  for (const query of queries.slice(0, 4)) {
    const result = searchAll(db, query, 12)
    if (result.mode === 'like') mode = 'like'
    for (const hit of result.hits) {
      if (!hitKinds.has(hit.kind)) continue
      const key = `${hit.kind}:${hit.id}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push(hit)
    }
  }
  return { hits: hits.slice(0, 40), mode }
}

/** Manual plan: the question itself, every collection (the index prefixes). */
function manualPlan(question: string) {
  return { queries: [question], kinds: [...SEARCH_KINDS] }
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, nlSearchSchema)

  if (body.mode === 'ai') {
    let ai: AIClient
    try {
      ai = await requireAI()
    } catch (e) {
      if (e instanceof AIUnavailableError) {
        const plan = manualPlan(body.question)
        return Response.json({
          ok: true,
          usedAI: false,
          needsSetup: true,
          plan,
          ...executePlan(plan.queries, plan.kinds),
        })
      }
      return aiErrorResponse(e)
    }
    try {
      const plan = await ai.generateJSON({
        schema: nlSearchPlanSchema,
        system: NL_SEARCH_SYSTEM,
        prompt: nlSearchPrompt(body.question),
      })
      return Response.json({
        ok: true,
        usedAI: true,
        needsSetup: false,
        plan,
        ...executePlan(plan.queries, plan.kinds),
      })
    } catch (e) {
      return aiErrorResponse(e)
    }
  }

  const plan = manualPlan(body.question)
  return Response.json({
    ok: true,
    usedAI: false,
    needsSetup: false,
    plan,
    ...executePlan(plan.queries, plan.kinds),
  })
})

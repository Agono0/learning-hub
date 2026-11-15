/**
 * /api/reading/highlights — extract (heuristic), triage (keep/discard),
 * mark-seen, and the daily resurface queue (Readwise-style).
 * GET ?mode=resurface&limit=10 | ?sourceId=n — READ-ONLY (the resurface queue
 *   no longer mutates strength/lastReviewedAt; RSC prefetch and double-fetch
 *   used to inflate memory strength on every read)
 * POST { seenIds: number[] } → explicit resurface-seen promotion (the old GET
 *   side effect, now opt-in and user-driven)
 * POST { sourceId, text?, max? } → extract highlight candidates from text or source
 * PATCH { id, action: 'keep'|'discard' } → triage
 */
import { z } from 'zod'
import {
  createHighlightCandidates,
  getSource,
  listHighlights,
  markHighlightsSeen,
  resurfaceHighlightsQuery,
  triageHighlight,
} from '@learning-hub/db'
import { extractHighlightCandidates } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const resurfaceParamsSchema = z.object({
  mode: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  sourceId: z.coerce.number().int().positive().optional(),
})

const extractSchema = z.object({
  sourceId: z.number().int().positive('sourceId required'),
  text: z.string().optional(),
  max: z.number().int().min(1).max(50).optional(),
})

const seenSchema = z.object({
  seenIds: z.array(z.number().int().positive()).min(1, 'seenIds required'),
})

const triageSchema = z.object({
  id: z.number().int().positive('id and action required'),
  action: z.enum(['keep', 'discard'], { message: 'id and action required' }),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = resurfaceParamsSchema.safeParse(Object.fromEntries(url.searchParams))
  const mode = url.searchParams.get('mode')
  if (mode === 'resurface') {
    const limit = parsed.success ? (parsed.data.limit ?? 10) : 10
    const resurfaced = resurfaceHighlightsQuery({ limit })
    // read-only: strength/lastReviewedAt are NOT touched here anymore — the
    // client opts in via POST { seenIds } (passive reads must not inflate memory)
    return Response.json({ resurface: resurfaced })
  }
  const sourceId = url.searchParams.get('sourceId')
  const rows = listHighlights(sourceId ? { sourceId: Number(sourceId) } : {})
  return Response.json({ highlights: rows })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, z.union([seenSchema, extractSchema]))

  if ('seenIds' in body) {
    // explicit resurface-seen: promote-if-known for the shown highlights only
    const updated = markHighlightsSeen(body.seenIds)
    return Response.json({ ok: true, seen: updated })
  }

  const source = getSource(body.sourceId)
  if (!source) return Response.json({ error: 'source not found' }, { status: 404 })
  const text = body.text?.trim() || source.content
  const candidates = extractHighlightCandidates(text, body.max ?? 8)
  const createdRows = createHighlightCandidates(source.id, candidates)
  return Response.json({
    ok: true,
    created: createdRows.length,
    highlights: candidates,
    createdRows,
  })
})

export const PATCH = withRoute(async (req: Request) => {
  const body = await readJson(req, triageSchema)
  const update = triageHighlight(body.id, body.action)
  if (!update) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ ok: true, ...update })
})

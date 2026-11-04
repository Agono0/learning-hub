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
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, highlights, sources } from '@learning-hub/db'
import { extractHighlightCandidates, resurfaceHighlights, resurfaceSeen, triageUpdate, type HighlightRow } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

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
  const rows = await db.select().from(highlights)
  if (mode === 'resurface') {
    const limit = parsed.success ? (parsed.data.limit ?? 10) : 10
    const resurfaced = resurfaceHighlights(rows as HighlightRow[], new Date(), limit)
    const withSource = await Promise.all(
      resurfaced.map(async (h) => {
        const [src] = await db.select({ title: sources.title }).from(sources).where(eq(sources.id, h.sourceId)).limit(1)
        return { ...h, sourceTitle: src?.title ?? null }
      }),
    )
    // read-only: strength/lastReviewedAt are NOT touched here anymore — the
    // client opts in via POST { seenIds } (passive reads must not inflate memory)
    return Response.json({ resurface: withSource })
  }
  const sourceId = url.searchParams.get('sourceId')
  const filtered = sourceId ? rows.filter((r) => r.sourceId === Number(sourceId)) : rows
  return Response.json({ highlights: filtered })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, z.union([seenSchema, extractSchema]))

  if ('seenIds' in body) {
    // explicit resurface-seen: promote-if-known for the shown highlights only
    const rows = db.select().from(highlights).where(inArray(highlights.id, body.seenIds)).all()
    const updated: number[] = []
    for (const h of rows) {
      const update = resurfaceSeen(h as HighlightRow, new Date())
      db.update(highlights).set(update).where(eq(highlights.id, h.id)).run()
      updated.push(h.id)
    }
    return Response.json({ ok: true, seen: updated })
  }

  const [source] = await db.select().from(sources).where(eq(sources.id, body.sourceId)).limit(1)
  if (!source) return Response.json({ error: 'source not found' }, { status: 404 })
  const text = body.text?.trim() || source.content
  const candidates = extractHighlightCandidates(text, body.max ?? 8)
  const created: number[] = []
  for (const candidate of candidates) {
    const [row] = await db
      .insert(highlights)
      .values({ sourceId: source.id, text: candidate, strength: 0.5, triaged: 0 })
      .returning()
    created.push(row!.id)
  }
  return Response.json({ ok: true, created: created.length, highlights: candidates })
})

export const PATCH = withRoute(async (req: Request) => {
  const body = await readJson(req, triageSchema)
  const [row] = await db.select().from(highlights).where(eq(highlights.id, body.id)).limit(1)
  if (!row) return Response.json({ error: 'not found' }, { status: 404 })
  const update = triageUpdate(row as HighlightRow, body.action, new Date())
  await db.update(highlights).set(update).where(eq(highlights.id, body.id))
  return Response.json({ ok: true, ...update })
})

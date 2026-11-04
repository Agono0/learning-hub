/**
 * /api/reading/[id] — one source: read (with highlights), patch reading
 * position / priority / status, delete.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, highlights, sources } from '@learning-hub/db'
import { nextFragment } from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'

const patchSourceSchema = z.object({
  position: z.number().min(0).max(100).optional(),
  priority: z.number().min(0).max(100).optional(),
  status: z.string().optional(),
})

function parseId(id: string): number {
  const sourceId = Number(id)
  if (!Number.isInteger(sourceId) || sourceId <= 0) throw new ApiError(400, 'invalid id')
  return sourceId
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sourceId = Number(id)
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  if (!source) return Response.json({ error: 'not found' }, { status: 404 })
  const rows = await db.select().from(highlights).where(eq(highlights.sourceId, sourceId))
  const fragment = nextFragment(source, 800)
  return Response.json({ source, highlights: rows, fragment })
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const sourceId = parseId(id)
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  if (!source) return Response.json({ error: 'not found' }, { status: 404 })
  const body = await readJson(req, patchSourceSchema)

  const patch: Partial<typeof sources.$inferInsert> = {}
  if (body.position !== undefined) {
    patch.position = Math.round(body.position)
    patch.lastReadAt = new Date().toISOString()
    if (patch.position >= 100) patch.status = 'done'
    else if (source.status === 'queued') patch.status = 'reading'
  }
  if (body.priority !== undefined) patch.priority = Math.round(body.priority)
  if (body.status !== undefined) patch.status = body.status
  await db.update(sources).set(patch).where(eq(sources.id, sourceId))
  const [updated] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  return Response.json({ ok: true, source: updated })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const sourceId = parseId(id)

  db.transaction((tx) => {
    tx.delete(highlights).where(eq(highlights.sourceId, sourceId)).run()
    tx.delete(sources).where(eq(sources.id, sourceId)).run()
  })

  return Response.json({ ok: true })
})

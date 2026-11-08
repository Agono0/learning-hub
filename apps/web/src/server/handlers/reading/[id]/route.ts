/**
 * /api/reading/[id] — one source: read (with highlights), patch reading
 * position / priority / status, delete.
 */
import { z } from 'zod'
import { deleteSource, getSourceDetail, updateSource } from '@learning-hub/db'
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
  const detail = getSourceDetail(sourceId)
  if (!detail) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json(detail)
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const sourceId = parseId(id)
  const body = await readJson(req, patchSourceSchema)

  const updated = updateSource(sourceId, body)
  if (!updated) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ ok: true, source: updated })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const sourceId = parseId(id)
  deleteSource(sourceId)
  return Response.json({ ok: true })
})

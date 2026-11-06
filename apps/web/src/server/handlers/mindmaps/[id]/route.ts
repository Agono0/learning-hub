/**
 * /api/mindmaps/:id — Fetch, update, or delete a mindmap diagram.
 */
import { z } from 'zod'
import { deleteMindmap, getMindmap, updateMindmap } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const updateMindmapSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  nodesJson: z.string().min(2).optional(),
  edgesJson: z.string().optional(),
})

export const GET = withRoute(async (_req: Request, ctx: unknown) => {
  const { params } = ctx as { params: { id: string } }
  const id = Number(params.id)
  if (!id) throw new ApiError(400, 'Invalid mindmap id')

  const row = getMindmap(id)
  if (!row) throw new ApiError(404, 'Mindmap not found')

  return Response.json({ ok: true, mindmap: row })
})

export const PUT = withRoute(async (req: Request, ctx: unknown) => {
  const { params } = ctx as { params: { id: string } }
  const id = Number(params.id)
  if (!id) throw new ApiError(400, 'Invalid mindmap id')

  const body = await readJson(req, updateMindmapSchema)
  const updated = updateMindmap(id, body)
  if (!updated) throw new ApiError(404, 'Mindmap not found')

  return Response.json({ ok: true, mindmap: updated })
})

export const DELETE = withRoute(async (_req: Request, ctx: unknown) => {
  const { params } = ctx as { params: { id: string } }
  const id = Number(params.id)
  if (!id) throw new ApiError(400, 'Invalid mindmap id')

  const ok = deleteMindmap(id)
  if (!ok) throw new ApiError(404, 'Mindmap not found')

  return Response.json({ ok: true })
})

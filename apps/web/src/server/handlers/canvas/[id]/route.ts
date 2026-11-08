/**
 * /api/canvas/[id] — read / save items+edges / delete.
 */
import { z } from 'zod'
import { deleteCanvas, getCanvas, updateCanvas } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** One draggable board element, as produced by the canvas page. */
const canvasItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['note', 'card', 'excerpt']),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
})

/** One directed connection between two canvas items. */
const canvasEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
})

const patchCanvasSchema = z.object({
  title: z.string().optional(),
  items: z.array(canvasItemSchema).optional(),
  edges: z.array(canvasEdgeSchema).optional(),
})

function parseId(id: string): number {
  const canvasId = Number(id)
  if (!Number.isInteger(canvasId) || canvasId <= 0) throw new ApiError(400, 'invalid id')
  return canvasId
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const canvas = getCanvas(Number(id))
  if (!canvas) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ canvas })
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const canvasId = parseId(id)
  const body = await readJson(req, patchCanvasSchema)
  const updated = updateCanvas(canvasId, body)
  if (!updated) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ ok: true })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  deleteCanvas(parseId(id))
  return Response.json({ ok: true })
})

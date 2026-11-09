/**
 * /api/palace/[id] — edit palace + loci, walk order, delete.
 * PATCH replaces the full loci set when `items` is provided (palace loci are
 * edited as a whole list in the builder), returns items in walk order
 * (palaceWalkOrder = ascending lociIndex).
 */
import { z } from 'zod'
import { deletePalace, getPalaceWithItems, updatePalace } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const patchPalaceSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        lociIndex: z.number().int().min(0),
        name: z.string(),
        vividImage: z.string().nullable().optional(),
        cardId: z.number().int().positive().nullable().optional(),
      }),
    )
    .optional(),
})

function parseId(id: string): number {
  const palaceId = Number(id)
  if (!Number.isInteger(palaceId) || palaceId <= 0) throw new ApiError(400, 'invalid id')
  return palaceId
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const palaceId = Number(id)
  const result = getPalaceWithItems(palaceId)
  if (!result) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json(result)
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const palaceId = parseId(id)
  const body = await readJson(req, patchPalaceSchema)
  const result = updatePalace(palaceId, body)
  if (!result) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ ok: true, palace: result.palace, items: result.items })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const palaceId = parseId(id)
  deletePalace(palaceId)
  return Response.json({ ok: true })
})

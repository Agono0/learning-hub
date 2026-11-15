/**
 * /api/palace — memory palaces: list (with loci) and create.
 * Layout shape: { rooms: { name, emoji }[] } (per schema).
 */
import { z } from 'zod'
import { createPalace, listPalaces } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const createPalaceSchema = z.object({
  name: z.string().trim().min(1, 'name required'),
  description: z.string().nullable().optional(),
  rooms: z.array(z.object({ name: z.string(), emoji: z.string().optional() })).optional(),
})

export async function GET() {
  const palaces = listPalaces()
  return Response.json({ palaces })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createPalaceSchema)
  const result = createPalace({
    name: body.name,
    description: body.description ?? null,
    rooms: body.rooms,
  })
  return Response.json({ ok: true, palace: result.palace, items: result.items }, { status: 201 })
})

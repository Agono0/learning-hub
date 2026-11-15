/**
 * /api/canvas — freeform JSON canvases (items + edges), full CRUD.
 */
import { z } from 'zod'
import { createCanvas, listCanvases } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const createCanvasSchema = z.object({
  title: z.string().optional(),
  scope: z.string().optional(),
  scopeId: z.number().int().positive().optional(),
})

export async function GET() {
  const rows = listCanvases({ limit: 50 })
  return Response.json({ canvases: rows })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createCanvasSchema)
  const canvas = createCanvas({
    title: body.title,
    scope: body.scope,
    scopeId: body.scopeId,
  })
  return Response.json({ ok: true, canvas })
})

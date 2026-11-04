/**
 * /api/canvas — freeform JSON canvases (items + edges), full CRUD.
 */
import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { db, canvases } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const createCanvasSchema = z.object({
  title: z.string().optional(),
  scope: z.string().optional(),
  scopeId: z.number().int().positive().optional(),
})

export async function GET() {
  const rows = await db.select().from(canvases).orderBy(desc(canvases.updatedAt)).limit(50)
  return Response.json({ canvases: rows })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createCanvasSchema)
  const [canvas] = await db
    .insert(canvases)
    .values({ title: body.title?.trim() || 'Untitled canvas', scope: body.scope ?? 'free', scopeId: body.scopeId ?? null })
    .returning()
  return Response.json({ ok: true, canvas })
})

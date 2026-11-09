import { z } from 'zod'
import { createDistractionApp, deleteDistractionApp, listDistractionApps } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

/** GET /api/distractions — the apps/sites you declared war on. */
export async function GET() {
  const rows = listDistractionApps()
  return Response.json({ distractions: rows })
}

const createDistractionSchema = z.object({
  name: z.string().trim().min(2, 'name is required'),
  kind: z.enum(['app', 'website', 'habit']).optional(),
})

/** POST /api/distractions { name, kind? } */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createDistractionSchema)
  const inserted = createDistractionApp({ name: body.name, kind: body.kind ?? 'app' })
  if (!inserted) return Response.json({ error: 'Already on the list' }, { status: 409 })
  return Response.json({ distraction: inserted }, { status: 201 })
})

/** DELETE /api/distractions?id=N */
export async function DELETE(req: Request) {
  const id = Number.parseInt(new URL(req.url).searchParams.get('id') ?? '', 10)
  if (!Number.isInteger(id))
    return Response.json({ error: 'id query param required' }, { status: 400 })
  deleteDistractionApp(id)
  return Response.json({ ok: true })
}

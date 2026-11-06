/**
 * /api/mindmaps — List and create mind-map diagrams.
 */
import { z } from 'zod'
import { createMindmap, listMindmaps } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const createMindmapSchema = z.object({
  title: z.string().min(1).max(200),
  nodesJson: z.string().min(2),
  edgesJson: z.string().optional(),
})

export const GET = withRoute(async () => {
  const mindmaps = listMindmaps()
  return Response.json({ ok: true, mindmaps })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createMindmapSchema)
  const created = createMindmap({
    title: body.title,
    nodesJson: body.nodesJson,
    edgesJson: body.edgesJson,
  })

  return Response.json({ ok: true, mindmap: created })
})

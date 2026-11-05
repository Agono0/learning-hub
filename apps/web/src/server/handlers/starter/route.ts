/**
 * /api/starter — Runtime-neutral Starter Course Library & Curated Seed installer.
 * Works identically on web (Node) and Windows/Android Tauri Web Worker (OPFS).
 */
import { z } from 'zod'
import { getStarterCatalogStatus, installStarterPack } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const installSchema = z.object({
  seedCore: z.boolean().optional().default(true),
  courseSlugs: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
})

export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    ...getStarterCatalogStatus(),
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, installSchema)
  const result = installStarterPack({
    seedCore: body.seedCore,
    courseSlugs: body.courseSlugs,
  })
  return Response.json({
    ok: true,
    ...result,
    catalog: getStarterCatalogStatus(),
  })
})

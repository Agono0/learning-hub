/**
 * /api/world/plots — Plant and query trees in the 3D Low-Poly Forest world.
 */
import { queryLimit } from '@/lib/query-params'
import { z } from 'zod'
import { addForestPlot, getForestPlots, getUserAvatar } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const addPlotSchema = z.object({
  treeType: z.string().min(1),
  growthStage: z.enum(['sapling', 'growing', 'mature', 'withered']).optional(),
  posX: z.number().optional(),
  posY: z.number().optional(),
  posZ: z.number().optional(),
  focusSessionId: z.string().nullable().optional(),
  durationMinutes: z.number().int().positive().optional(),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = queryLimit(url.searchParams, 100, 200)
  const plots = getForestPlots('default', limit)

  return Response.json({
    ok: true,
    plots,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, addPlotSchema)
  const avatar = getUserAvatar('default')

  // Validation: Ensure tree species is unlocked
  if (!avatar.unlockedTrees.includes(body.treeType)) {
    return Response.json(
      { ok: false, error: `Tree species ${body.treeType} is not unlocked` },
      { status: 400 },
    )
  }

  // If coordinates not specified, place procedurally around diorama circle
  const existing = getForestPlots('default', 50)
  const index = existing.length
  const angle = (index * 137.5 * Math.PI) / 180 // Golden angle distribution
  const radius = 4 + Math.sqrt(index) * 2.5
  const defaultX = Math.cos(angle) * radius
  const defaultZ = Math.sin(angle) * radius

  const plot = addForestPlot({
    userId: 'default',
    treeType: body.treeType,
    growthStage: body.growthStage ?? 'mature',
    posX: body.posX ?? defaultX,
    posY: body.posY ?? 0,
    posZ: body.posZ ?? defaultZ,
    focusSessionId: body.focusSessionId,
    durationMinutes: body.durationMinutes ?? 25,
  })

  return Response.json({
    ok: true,
    plot,
  })
})

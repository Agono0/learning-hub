/**
 * /api/social/seasons — 30-Tier Seasonal Study Pass progression and rewards.
 */
import { z } from 'zod'
import { calculateSeasonProgress, generateSeasonTiers } from '@learning-hub/core/guilds'
import { addSeasonXp, claimSeasonReward, getSeasonalProgress } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const seasonActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add_xp'),
    xp: z.number().int().positive(),
    seasonId: z.string().optional(),
  }),
  z.object({
    action: z.literal('claim_reward'),
    tier: z.number().int().min(1).max(30),
    seasonId: z.string().optional(),
  }),
])

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const seasonId = url.searchParams.get('seasonId') || 'season-1'

  const progress = getSeasonalProgress(seasonId)
  const calculation = calculateSeasonProgress(progress.seasonXp, 30)
  const tiers = generateSeasonTiers(30)

  return Response.json({
    ok: true,
    seasonId,
    progress: {
      ...progress,
      ...calculation,
    },
    tiers,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, seasonActionSchema)

  if (body.action === 'add_xp') {
    const updated = addSeasonXp(body.xp, body.seasonId)
    const calculation = calculateSeasonProgress(updated.seasonXp, 30)
    return Response.json({
      ok: true,
      progress: {
        ...updated,
        ...calculation,
      },
    })
  }

  if (body.action === 'claim_reward') {
    const success = claimSeasonReward(body.tier, body.seasonId)
    const updated = getSeasonalProgress(body.seasonId)
    return Response.json({
      ok: success,
      progress: updated,
    })
  }

  return Response.json({ ok: false, error: 'Invalid action' }, { status: 400 })
})

/**
 * /api/games/boss — Solo Boss Battles derived from revlog.
 */
import { z } from 'zod'
import { BOSS_ROSTER } from '@learning-hub/core/boss'
import { getActiveBossBattle, startBossBattle, syncBossBattleProgress } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const bossActionSchema = z.object({
  action: z.enum(['start', 'sync']),
  bossKey: z.string().optional(),
})

export const GET = withRoute(async () => {
  const active = getActiveBossBattle()
  return Response.json({
    ok: true,
    active,
    roster: Object.values(BOSS_ROSTER),
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bossActionSchema)

  if (body.action === 'start') {
    const started = startBossBattle(body.bossKey ?? 'chronos')
    return Response.json({ ok: true, battle: started })
  }

  // Sync turn
  const synced = syncBossBattleProgress()
  return Response.json({ ok: true, ...synced })
})

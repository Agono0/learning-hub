/**
 * /api/world/state — Returns the 3D world state: avatar, study coin balance, plots, settings.
 */
import { getCoinBalance, getForestPlots, getUserAvatar, getWorldSettings } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async () => {
  const avatar = getUserAvatar('default')
  const balance = getCoinBalance('default')
  const plots = getForestPlots('default', 100)
  const settings = getWorldSettings('default')

  return Response.json({
    ok: true,
    avatar,
    balance,
    plots,
    settings,
  })
})

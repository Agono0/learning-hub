/**
 * GET /api/plugins/contributions — declarative plugin contributions for the
 * web layer (command-palette actions + dashboard widgets). Boots the plugin
 * loader and the in-app engines on first call.
 */
import { getPluginContributions } from '@learning-hub/core'
import { ensurePluginsLoaded } from '@/lib/plugins'
import { ensureEnginesLoaded } from '@/server/engine'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async () => {
  await ensurePluginsLoaded()
  ensureEnginesLoaded()
  const { paletteActions, dashboardWidgets } = getPluginContributions()
  return Response.json({
    ok: true,
    paletteActions,
    dashboardWidgets,
    plugins: paletteActions.length + dashboardWidgets.length,
  })
})

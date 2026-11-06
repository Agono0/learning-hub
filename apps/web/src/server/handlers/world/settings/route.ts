/**
 * /api/world/settings — User preferences for 3D world, camera mode, timer theme, and integration.
 */
import { z } from 'zod'
import { getWorldSettings, updateWorldSettings } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const settingsPatchSchema = z.object({
  viewMode: z.enum(['diorama', 'third_person', 'hybrid']).optional(),
  timerTheme: z.enum(['tree', 'hourglass', 'campfire', 'clockwork', 'crystal']).optional(),
  integrationMode: z.enum(['dedicated', 'focus_embedded', 'hud_modal']).optional(),
  soundscape: z.enum(['none', 'birds', 'rain', 'fire', 'wind']).optional(),
  lowPolyQuality: z.enum(['high', 'medium', 'low']).optional(),
})

export const GET = withRoute(async () => {
  const settings = getWorldSettings('default')
  return Response.json({
    ok: true,
    settings,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, settingsPatchSchema)
  const updated = updateWorldSettings('default', body)

  return Response.json({
    ok: true,
    settings: updated,
  })
})

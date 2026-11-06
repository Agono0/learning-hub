/**
 * /api/focus/bridge — Extension companion bridge credentials and heartbeat.
 */
import { z } from 'zod'
import {
  getOrCreateFocusBridge,
  recordFocusBridgeHeartbeat,
  rotateFocusBridgeToken,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const bridgeActionSchema = z.object({
  action: z.enum(['rotate', 'heartbeat']),
  extensionId: z.string().optional(),
})

export const GET = withRoute(async () => {
  const bridge = getOrCreateFocusBridge()
  return Response.json({
    ok: true,
    pairingToken: bridge.pairingToken,
    lastHeartbeatAt: bridge.lastHeartbeatAt,
    extensionId: bridge.extensionId,
    loopbackPort: 47615,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bridgeActionSchema)
  if (body.action === 'rotate') {
    const bridge = rotateFocusBridgeToken()
    return Response.json({
      ok: true,
      pairingToken: bridge.pairingToken,
      lastHeartbeatAt: bridge.lastHeartbeatAt,
      loopbackPort: 47615,
    })
  }

  if (body.action === 'heartbeat') {
    recordFocusBridgeHeartbeat(body.extensionId)
    return Response.json({ ok: true })
  }

  return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 })
})

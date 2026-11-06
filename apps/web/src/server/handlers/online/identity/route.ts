/**
 * /api/online/identity — Manages local online identity, preferences, and server endpoint.
 */
import { z } from 'zod'
import {
  getDefaultOnlineServer,
  getOnlineIdentity,
  getOnlinePrefs,
  setOnlineServer,
  updateOnlineIdentity,
  updateOnlinePrefs,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const updateIdentitySchema = z.object({
  mode: z.enum(['device_key', 'magic_link', 'offline']).optional(),
  alias: z.string().min(1).max(40).optional(),
  serverUrl: z.string().url().optional(),
  showOnLeaderboard: z.boolean().optional(),
  allowBuddyRequests: z.boolean().optional(),
  sharePresence: z.boolean().optional(),
})

export const GET = withRoute(async () => {
  const identity = getOnlineIdentity()
  const prefs = getOnlinePrefs()
  const server = getDefaultOnlineServer()

  return Response.json({
    ok: true,
    identity: {
      id: identity.id,
      mode: identity.mode,
      userId: identity.userId,
      alias: identity.alias,
      pubKey: identity.pubKey,
      registeredAt: identity.registeredAt,
    },
    prefs,
    server,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, updateIdentitySchema)

  const updates: Parameters<typeof updateOnlineIdentity>[0] = {}
  if (body.mode) updates.mode = body.mode
  if (body.alias) updates.alias = body.alias

  // If turning on device_key and no pubkey exists yet, generate random device keys
  if (body.mode === 'device_key') {
    const current = getOnlineIdentity()
    if (!current.pubKey) {
      const randomBytes = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, '0'),
      ).join('')
      updates.pubKey = `pk_${randomBytes}`
      updates.privKey = `sk_${Date.now()}_${randomBytes.slice(0, 16)}`
      updates.registeredAt = new Date().toISOString()
    }
  }

  const updatedIdentity = updateOnlineIdentity(updates)

  if (
    body.showOnLeaderboard !== undefined ||
    body.allowBuddyRequests !== undefined ||
    body.sharePresence !== undefined
  ) {
    updateOnlinePrefs({
      showOnLeaderboard: body.showOnLeaderboard,
      allowBuddyRequests: body.allowBuddyRequests,
      sharePresence: body.sharePresence,
    })
  }

  if (body.serverUrl) {
    setOnlineServer('Custom Worker', body.serverUrl, true)
  }

  return Response.json({
    ok: true,
    identity: {
      id: updatedIdentity.id,
      mode: updatedIdentity.mode,
      userId: updatedIdentity.userId,
      alias: updatedIdentity.alias,
      pubKey: updatedIdentity.pubKey,
      registeredAt: updatedIdentity.registeredAt,
    },
    prefs: getOnlinePrefs(),
    server: getDefaultOnlineServer(),
  })
})

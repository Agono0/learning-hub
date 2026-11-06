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
import {
  generateIdentityKeyPair,
  identityChallenge,
  identitySigningPayload,
  signIdentityPayload,
} from '@learning-hub/core'

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

  // Turning on device_key generates a REAL ECDSA P-256 pair once: the private
  // key stays in the local DB (never synced), the public key registers with
  // the worker over a signed challenge.
  if (body.mode === 'device_key') {
    const current = getOnlineIdentity()
    if (!current.pubKey) {
      const pair = await generateIdentityKeyPair()
      updates.pubKey = pair.publicKey
      updates.privKey = pair.privateKey
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

  // Register the public key with the worker over a signed challenge (best
  // effort — offline users stay fully functional as `device_key` locals).
  let registered = false
  if (updatedIdentity.mode === 'device_key' && updatedIdentity.pubKey && updatedIdentity.privKey) {
    try {
      const timestamp = Date.now()
      const challenge = identityChallenge(updatedIdentity.userId, timestamp)
      const signature = await signIdentityPayload(
        updatedIdentity.privKey,
        identitySigningPayload(challenge, updatedIdentity.alias),
      )
      const res = await fetch(`${getDefaultOnlineServer()}/api/v1/auth/register-key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pubkey: updatedIdentity.pubKey,
          alias: updatedIdentity.alias,
          challenge,
          signature,
        }),
        signal: AbortSignal.timeout(5000),
      })
      registered = res.ok
    } catch {
      registered = false
    }
  }

  return Response.json({
    ok: true,
    registered,
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

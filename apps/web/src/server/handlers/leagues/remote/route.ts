/**
 * /api/leagues/remote — signed mutations against a remote league authority.
 *
 * INACTIVE GROUNDWORK. The gate is the LH_REMOTE_LEAGUES environment variable:
 * unless it is exactly "1" every call answers 503 and nothing is signed or
 * sent. The leagues UI does not call this route; the local leagues in
 * /api/leagues stay local, friendly practice. Enabling this is the owner's
 * decision, together with deploying the worker's LeagueRoom.
 *
 * What the route does when enabled: it signs a mutation with the device
 * identity key (the private key never leaves the local database), takes the
 * next sequence number atomically, sends the envelope to the linked worker
 * and records the authority's verdict. The authority, not this route, decides
 * whether the mutation counts.
 */
import { z } from 'zod'
import {
  LeagueRemoteInputError,
  enqueueLeagueMutation,
  getOnlineIdentity,
  loadLeagueQueue,
  getRemoteLink,
  linkRemoteLeague,
  listRemoteLinks,
  recordRemoteOutcome,
  reserveNextSeq,
  fetchRemoteState,
  AUTHORITY_REDIRECT_MESSAGE,
  isRedirectReply,
  readBoundedReply,
  REMOTE_REDIRECT_MODE,
  syncRemoteLeague,
  REMOTE_REQUEST_TIMEOUT_MS,
  remoteBase,
} from '@learning-hub/db'
import {
  LeagueMutationSchema,
  SyncQueueFullError,
  leagueSignerFromStoredKey,
  signLeagueMutation,
  summarizeQueue,
} from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'
import { remoteFetch } from '@/server/net'

export function remoteLeaguesEnabled(): boolean {
  return process.env.LH_REMOTE_LEAGUES === '1'
}

function disabled(): Response {
  return Response.json(
    { ok: false, enabled: false, error: 'Remote leagues are not enabled' },
    { status: 503 },
  )
}

const target = z.object({
  serverUrl: z.string().min(1).max(300),
  remoteLeagueId: z.string().min(1).max(60),
})

const bodySchema = z.discriminatedUnion('action', [
  target.extend({ action: z.literal('link') }),
  target.extend({ action: z.literal('state') }),
  target.extend({ action: z.literal('mutate'), mutation: LeagueMutationSchema }),
  // Offline path: queue a mutation now, deliver it on a later sync.
  target.extend({ action: z.literal('enqueue'), mutation: LeagueMutationSchema }),
  target.extend({ action: z.literal('sync') }),
  target.extend({ action: z.literal('queue') }),
])

export const GET = withRoute(async () => {
  const enabled = remoteLeaguesEnabled()
  return Response.json({
    ok: true,
    enabled,
    links: enabled
      ? listRemoteLinks().map((l) => ({
          serverUrl: l.serverUrl,
          remoteLeagueId: l.remoteLeagueId,
          nextSeq: l.nextSeq,
          lastStatus: l.lastStatus,
          lastSyncedAt: l.lastSyncedAt,
        }))
      : [],
  })
})

export const POST = withRoute(async (req: Request) => {
  if (!remoteLeaguesEnabled()) return disabled()
  const body = await readJson(req, bodySchema)

  let link
  try {
    link = linkRemoteLeague({ serverUrl: body.serverUrl, remoteLeagueId: body.remoteLeagueId })
  } catch (err) {
    if (err instanceof LeagueRemoteInputError) throw new ApiError(400, err.message)
    throw err
  }

  if (body.action === 'link') {
    return Response.json({
      ok: true,
      serverUrl: link.serverUrl,
      remoteLeagueId: link.remoteLeagueId,
    })
  }

  const base = remoteBase(link)

  if (body.action === 'enqueue') {
    try {
      const { itemId, queue } = enqueueLeagueMutation(link.id, body.mutation)
      return Response.json({ ok: true, itemId, queue: summarizeQueue(queue) }, { status: 202 })
    } catch (err) {
      if (err instanceof SyncQueueFullError) throw new ApiError(409, err.message)
      throw err
    }
  }

  if (body.action === 'queue') {
    const { queue, recovered } = loadLeagueQueue(link.id)
    return Response.json({ ok: true, recovered, queue: summarizeQueue(queue) })
  }

  if (body.action === 'sync') {
    const outcome = await syncRemoteLeague(link, { fetch: (url, init) => remoteFetch(url, init) })
    if (!outcome.ok) throw new ApiError(409, outcome.message)
    return Response.json(outcome)
  }

  if (body.action === 'state') {
    const res = await fetchRemoteState(link, { fetch: (url, init) => remoteFetch(url, init) })
    return Response.json({ ok: res.ok, status: res.status, remote: res.remote })
  }

  // mutate: needs a real device identity. No key, no signature, no request.
  const identity = getOnlineIdentity()
  if (identity.mode !== 'device_key' || !identity.pubKey || !identity.privKey) {
    throw new ApiError(409, 'A device key identity is required to sign league mutations')
  }
  const seq = reserveNextSeq(link.id)
  if (seq === undefined) throw new ApiError(404, 'League link vanished')

  const signer = await leagueSignerFromStoredKey({
    publicKey: identity.pubKey,
    privateKey: identity.privKey,
  })
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const envelope = await signLeagueMutation({
    signer,
    leagueId: link.remoteLeagueId,
    seq,
    mutation: body.mutation,
    timestamp: Date.now(),
    nonce,
  })

  let res: Response
  let redirected = false
  try {
    res = await remoteFetch(`${base}/mutate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ envelope }),
      signal: AbortSignal.timeout(REMOTE_REQUEST_TIMEOUT_MS),
      redirect: REMOTE_REDIRECT_MODE,
    })
    if (isRedirectReply(res)) {
      await res.body?.cancel().catch(() => undefined)
      redirected = true
      throw new Error('authority redirected')
    }
  } catch {
    recordRemoteOutcome(link.id, 'unreachable')
    if (redirected) {
      return Response.json(
        {
          ok: false,
          status: 0,
          code: 'authority_redirected',
          seq,
          remote: { error: AUTHORITY_REDIRECT_MESSAGE },
        },
        { status: 502 },
      )
    }
    return Response.json({ ok: false, status: 0, code: 'unreachable', seq }, { status: 502 })
  }
  const data = (await readBoundedReply(res)) as { ok?: boolean; code?: string }
  const code = res.ok ? 'ok' : (data.code ?? `http_${res.status}`)
  recordRemoteOutcome(link.id, code)
  const stored = getRemoteLink(link.serverUrl, link.remoteLeagueId)
  return Response.json(
    { ok: res.ok, status: res.status, code, seq, nextSeq: stored?.nextSeq, remote: data },
    { status: res.ok ? 200 : res.status >= 500 ? 502 : 409 },
  )
})

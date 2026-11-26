/**
 * @fileoverview One place that pushes a linked remote league's queue and reads
 * its state, shared by the web route and the CLI so both sign, flush and
 * record outcomes the same way.
 *
 * INACTIVE GROUNDWORK. Nothing calls this unless the owner enables remote
 * leagues. The caller supplies the fetch, so the web server can route it
 * through its guarded fetch and tests can wire it straight into a room.
 */
import {
  createSeqTracker,
  flushQueue,
  leagueSignerFromStoredKey,
  pruneQueue,
  summarizeQueue,
  type SyncQueueSummary,
  type FlushDeps,
  type TransportReply,
} from '@learning-hub/core/leagues'
import { getOnlineIdentity } from './online'
import {
  bumpSeqAtLeast,
  loadLeagueQueue,
  recordRemoteOutcome,
  saveLeagueQueue,
  type LeagueRemoteLink,
} from './league-remote'

type SignedEnvelope = Parameters<FlushDeps['send']>[1]

/** Largest authority reply we will read. */
export const MAX_REMOTE_REPLY_BYTES = 64 * 1024
export const REMOTE_REQUEST_TIMEOUT_MS = 8_000

export type RemoteFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface RemoteSyncDeps {
  fetch: RemoteFetch
  now?: () => number
  newNonce?: () => string
  timeoutMs?: number
}

export type SyncOutcome =
  | {
      ok: true
      recovered: boolean
      attempted: number
      nextWakeAt: number | null
      queue: SyncQueueSummary
    }
  | { ok: false; code: 'no_device_key'; message: string }

export type StateOutcome = { ok: boolean; status: number; remote: unknown }

export function remoteBase(link: Pick<LeagueRemoteLink, 'serverUrl' | 'remoteLeagueId'>): string {
  return `${link.serverUrl}/api/v1/leagues/${link.remoteLeagueId}`
}

/**
 * Init for every request to a league authority: redirects are never followed by the runtime. A
 * signed mutation must go to the origin the link names, not wherever a reply points.
 */
export const REMOTE_REDIRECT_MODE = 'manual' as const

/** True for a redirect reply (what `redirect: 'manual'` hands back instead of following). */
export function isRedirectReply(res: Response): boolean {
  return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)
}

/**
 * Read a reply with a byte cap, counted while streaming. The reader is cancelled the moment the
 * cap is crossed, so a hostile authority cannot make the client buffer more than the cap plus one
 * chunk. Anything unreadable becomes an error object.
 */
export async function readBoundedReply(res: Response): Promise<unknown> {
  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_REMOTE_REPLY_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { error: 'authority reply too large' }
      }
      chunks.push(value)
    }
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(all))
  } catch {
    return { error: 'authority reply was not JSON' }
  }
}

/** The stored device key as a signer, or null when no device key identity exists. */
export async function loadDeviceSigner() {
  const identity = getOnlineIdentity()
  if (identity.mode !== 'device_key' || !identity.pubKey || !identity.privKey) return null
  return leagueSignerFromStoredKey({ publicKey: identity.pubKey, privateKey: identity.privKey })
}

function randomNonce(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/**
 * Send every due lane head once and persist the result. The sequence counter
 * only ever moves forward, and a failed push leaves items queued for the next
 * sync. The authority, not this function, decides whether a change counts.
 */
export async function syncRemoteLeague(
  link: LeagueRemoteLink,
  deps: RemoteSyncDeps,
): Promise<SyncOutcome> {
  const signer = await loadDeviceSigner()
  if (!signer) {
    return {
      ok: false,
      code: 'no_device_key',
      message: 'A device key identity is required to sign league mutations',
    }
  }
  const now = deps.now ?? Date.now
  const base = remoteBase(link)
  const { queue: stored, recovered } = loadLeagueQueue(link.id)
  const tracker = { next: { ...createSeqTracker().next, [link.remoteLeagueId]: link.nextSeq } }
  const result = await flushQueue(stored, tracker, {
    signer,
    leagueId: link.remoteLeagueId,
    now,
    newNonce: deps.newNonce ?? randomNonce,
    send: async (_id: string, envelope: SignedEnvelope): Promise<TransportReply> => {
      try {
        const res = await deps.fetch(`${base}/mutate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ envelope }),
          signal: AbortSignal.timeout(deps.timeoutMs ?? REMOTE_REQUEST_TIMEOUT_MS),
          redirect: REMOTE_REDIRECT_MODE,
        })
        if (isRedirectReply(res)) {
          await res.body?.cancel().catch(() => undefined)
          return { kind: 'network-error' }
        }
        return { kind: 'http', status: res.status, body: await readBoundedReply(res) }
      } catch {
        return { kind: 'network-error' }
      }
    },
  })
  const kept = pruneQueue(result.queue, now())
  saveLeagueQueue(link.id, kept)
  bumpSeqAtLeast(link.id, result.tracker.next[link.remoteLeagueId] ?? link.nextSeq)
  const last = result.attempted.at(-1)
  recordRemoteOutcome(
    link.id,
    last ? (last.outcome.kind === 'accepted' ? 'ok' : last.outcome.kind) : 'idle',
  )
  return {
    ok: true,
    recovered,
    attempted: result.attempted.length,
    nextWakeAt: result.nextWakeAt,
    queue: summarizeQueue(kept),
  }
}

/** Fetch the authority's view of the league. Read-only, unsigned. */
export async function fetchRemoteState(
  link: LeagueRemoteLink,
  deps: Pick<RemoteSyncDeps, 'fetch' | 'timeoutMs'>,
): Promise<StateOutcome> {
  const res = await deps.fetch(`${remoteBase(link)}/state`, {
    signal: AbortSignal.timeout(deps.timeoutMs ?? REMOTE_REQUEST_TIMEOUT_MS),
    redirect: REMOTE_REDIRECT_MODE,
  })
  if (isRedirectReply(res)) {
    await res.body?.cancel().catch(() => undefined)
    return { ok: false, status: res.status, remote: { error: 'authority redirected' } }
  }
  return { ok: res.ok, status: res.status, remote: await readBoundedReply(res) }
}

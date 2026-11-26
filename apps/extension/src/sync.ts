/**
 * Lock sync orchestration for the service worker, with every side effect injected so the real
 * decision flow is testable without chrome globals.
 *
 * Scope: this hardens the WEB FALLBACK only. The native loopback path is unchanged and is NOT
 * authenticated by this change: the bearer token goes to whichever local process owns the port.
 * `source` labels are descriptive, not a security assurance for loopback.
 *
 * Order: native loopback bridge, then the web fallback (accepted only with a verified HMAC proof),
 * then the cached lock. A response that does not verify never touches the rules or the cache: it is
 * treated exactly like a failed fetch, so the cached-lock decision runs.
 */
import { MAX_LOCK_HORIZON_MS, isValidNonce, verifyLockProof } from '@learning-hub/core/focus-lock'
import { type ExtensionState, type StoredLock } from './state'

export const FALLBACK_URL = 'http://localhost:3000/api/focus/max'
export const MAX_RESPONSE_BYTES = 64 * 1024
export const FETCH_TIMEOUT_MS = 5_000

export interface SyncDeps {
  getState: () => Promise<ExtensionState>
  saveLock: (lock: StoredLock) => Promise<void>
  applyRules: (domains: string[]) => Promise<void>
  clearRules: () => Promise<void>
  fetchImpl: typeof fetch
  now: () => number
  randomBytes: (n: number) => Uint8Array
  /** The extension's own id, sent with the loopback heartbeat as before. */
  extensionId: string
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Read at most `max` bytes of a response body, then parse JSON. Null when oversize or invalid. */
export async function readBoundedJson(
  res: Response,
  max = MAX_RESPONSE_BYTES,
  signal?: AbortSignal,
): Promise<unknown> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return null
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  // A stalled body must not outlive the request timeout: abort cancels the reader.
  const onAbort = () => void reader.cancel().catch(() => {})
  signal?.addEventListener('abort', onAbort, { once: true })
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch {
      return null
    } finally {
      if (signal?.aborted) return null
    }
    const { done, value } = chunk
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  signal?.removeEventListener('abort', onAbort)
  const all = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    all.set(c, off)
    off += c.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(all))
  } catch {
    return null
  }
}

/** Fetch and bounded-parse under one timeout that covers headers and body. */
async function fetchJson(
  deps: SyncDeps,
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; json: unknown } | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await deps.fetchImpl(url, { ...init, signal: ctrl.signal })
    if (!res.ok) return { ok: false, json: null }
    return { ok: true, json: await readBoundedJson(res, MAX_RESPONSE_BYTES, ctrl.signal) }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** Native loopback bridge (authenticated by the pairing token). Null on any failure. */
async function fromLoopback(deps: SyncDeps, state: ExtensionState): Promise<StoredLock | null> {
  if (!state.pairingToken) return null
  const base = `http://127.0.0.1:${state.loopbackPort}`
  const r = await fetchJson(deps, `${base}/v1/lock`, {
    headers: { Authorization: `Bearer ${state.pairingToken}` },
  })
  const json = r?.ok ? (r.json as Record<string, unknown> | null) : null
  if (!json || typeof json !== 'object') return null
  // Periodic heartbeat, fire and forget.
  void fetchJson(deps, `${base}/v1/heartbeat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.pairingToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ extensionId: deps.extensionId }),
  })
  return {
    active: Boolean(json.active),
    endsAt: typeof json.endsAt === 'string' ? json.endsAt : null,
    domains: Array.isArray(json.domains)
      ? json.domains.filter((d): d is string => typeof d === 'string')
      : [],
    source: 'loopback',
  }
}

/** Web fallback. Accepted only when a fresh-nonce HMAC proof verifies; otherwise null. */
export async function fromVerifiedFallback(
  deps: SyncDeps,
  state: ExtensionState,
): Promise<StoredLock | null> {
  // No pairing token stored: nothing to verify against, so the fallback is unavailable.
  if (!state.pairingToken) return null
  const nonce = b64url(deps.randomBytes(16))
  if (!isValidNonce(nonce)) return null
  const r = await fetchJson(deps, `${FALLBACK_URL}?nonce=${nonce}`, {
    headers: { Accept: 'application/json' },
  })
  const json = r?.ok ? (r.json as Record<string, unknown> | null) : null
  if (!json || typeof json !== 'object') return null
  // Only the signed proof is read. Any unsigned field of the response is ignored.
  const verified = await verifyLockProof(state.pairingToken, nonce, json.proof, deps.now())
  if (!verified.ok) return null
  return { ...verified.lock, source: 'fallback-verified' }
}

/** When a cached lock stops being honored (ms), or null if it never was active. */
export function cachedLockUntil(lock: StoredLock, nowMs: number): number | null {
  if (!lock.active || !lock.endsAt) return null
  const end = Date.parse(lock.endsAt)
  if (!Number.isFinite(end)) return null
  if (lock.source === 'legacy') {
    // Written before provenance existed, so possibly from an unsigned response. Honored no longer
    // than its own end and no longer than one product lock ceiling from first sight by this
    // version. Never refreshed: it can shorten, never extend.
    // A first-seen time in the future (clock moved back, hand-edited storage) is clamped to now,
    // so the window can never reach further than now + 4h.
    const parsed = lock.migratedAt ? Date.parse(lock.migratedAt) : NaN
    const from = Number.isFinite(parsed) ? Math.min(parsed, nowMs) : nowMs
    return Math.min(end, from + MAX_LOCK_HORIZON_MS)
  }
  return end
}

/** One sync pass. Returns what it did, for tests and logging. */
export async function runSync(
  deps: SyncDeps,
  isLatest: () => boolean = () => true,
): Promise<'loopback' | 'fallback-verified' | 'cache' | 'none'> {
  const state = await deps.getState()
  const now = deps.now()

  let fetched = await fromLoopback(deps, state)
  if (!fetched) fetched = await fromVerifiedFallback(deps, state)
  // A newer pass started while this one awaited the network: drop this result, never apply it.
  if (!isLatest()) return 'none'

  if (fetched) {
    await deps.saveLock(fetched)
    const until = fetched.active && fetched.endsAt ? Date.parse(fetched.endsAt) : NaN
    if (fetched.active && Number.isFinite(until) && until > now)
      await deps.applyRules(fetched.domains)
    else await deps.clearRules()
    return fetched.source === 'loopback' ? 'loopback' : 'fallback-verified'
  }

  const cached = state.lastKnownLock
  if (cached) {
    let lock = cached
    if (
      lock.source === 'legacy' &&
      lock.active &&
      !(lock.migratedAt && Date.parse(lock.migratedAt) <= now)
    ) {
      // First sight of a legacy entry (or a first-seen time in the future): start its window now and persist, so it never slides.
      lock = { ...lock, migratedAt: new Date(now).toISOString() }
      await deps.saveLock(lock)
    }
    const until = cachedLockUntil(lock, now)
    if (until !== null && until > now) await deps.applyRules(lock.domains)
    else await deps.clearRules()
    return 'cache'
  }
  await deps.clearRules()
  return 'none'
}

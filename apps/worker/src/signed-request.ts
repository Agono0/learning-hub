/**
 * Verification of signed requests (publish) and join assertions (study rooms).
 *
 * Semantics:
 * - No credential headers at all: the caller is anonymous (existing behavior, neutral label).
 * - Any credential supplied but malformed, stale, or not verifying: refused (401). No downgrade.
 * - A valid signature from a key that is not registered in `users`: refused (403,
 *   register-required). A signature alone is a key, not an identity.
 * - A valid signature from a registered key: the identity (id and alias) comes from the
 *   `users` row, never from the request.
 */
import {
  SIGNED_REQUEST_WINDOW_MS,
  requestSigningPayload,
  digestHex,
  verifyIdentityPayload,
} from '@learning-hub/core/identity-crypto'

export interface IdentityEnv {
  DB?: D1Database
  /**
   * The worker's own trusted public host (for example hub.example.com). Signed requests and join
   * assertions are bound to it. When unset, every credentialed operation fails closed (503);
   * the request's Host header is never trusted as the audience.
   */
  EXPECTED_HOST?: string
}

export type Principal =
  | { kind: 'anonymous' }
  | {
      kind: 'registered'
      userId: string
      alias: string
      pubkey: string
      /** SHA-256 of the canonical signed payload plus the key: stable across signature encodings. */
      requestId: string
    }

export type AuthResult =
  { ok: true; principal: Principal } | { ok: false; status: number; error: string }

export const HEADER_KEY = 'x-lh-key'
export const HEADER_TS = 'x-lh-ts'
export const HEADER_SIG = 'x-lh-sig'

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** Looks up a registered key. Returns null when the key is not registered. */
export async function lookupRegistered(
  env: IdentityEnv,
  pubkey: string,
): Promise<{ id: string; alias: string } | null | 'unavailable'> {
  if (!env.DB) return 'unavailable'
  const row = await env.DB.prepare('SELECT id, alias FROM users WHERE pubkey = ?')
    .bind(pubkey)
    .first<{ id: string; alias: string }>()
  return row?.id ? { id: row.id, alias: row.alias } : null
}

/** Authenticates a request whose body bytes are already read (the exact bytes that were signed). */
export async function authenticateRequest(
  request: Request,
  body: Uint8Array,
  env: IdentityEnv,
  now = Date.now(),
): Promise<AuthResult> {
  const key = request.headers.get(HEADER_KEY)
  const ts = request.headers.get(HEADER_TS)
  const sig = request.headers.get(HEADER_SIG)
  if (key === null && ts === null && sig === null)
    return { ok: true, principal: { kind: 'anonymous' } }

  const invalid = { ok: false as const, status: 401, error: 'invalid credentials' }
  if (!key || !ts || !sig || key.length > 512 || sig.length > 256) return invalid
  if (!BASE64.test(key) || !BASE64.test(sig) || !/^\d{1,15}$/.test(ts)) return invalid
  const timestamp = Number(ts)
  if (Math.abs(now - timestamp) > SIGNED_REQUEST_WINDOW_MS) return invalid

  if (!env.EXPECTED_HOST)
    return { ok: false, status: 503, error: 'verified requests are not configured' }
  const url = new URL(request.url)
  const host = env.EXPECTED_HOST
  const payload = requestSigningPayload({
    method: request.method,
    host,
    pathAndQuery: url.pathname + url.search,
    timestamp,
    bodySha256: await digestHex(body),
  })
  if (!(await verifyIdentityPayload(key, payload, sig))) return invalid

  const found = await lookupRegistered(env, key)
  if (found === 'unavailable') {
    return { ok: false, status: 503, error: 'identity store unavailable' }
  }
  if (!found) return { ok: false, status: 403, error: 'register your key first' }
  return {
    ok: true,
    principal: {
      kind: 'registered',
      userId: found.id,
      alias: found.alias,
      pubkey: key,
      requestId: await digestHex(`${payload}|${key}`),
    },
  }
}

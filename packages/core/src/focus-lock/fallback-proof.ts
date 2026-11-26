/**
 * Learning HUB - signed lock proof for the extension's web fallback.
 *
 * The companion extension can read the lock from the local web app when the native loopback bridge
 * is not answering. That endpoint has no login, so without a proof any process answering on the
 * port could return "inactive" (dropping the lock) or "active" with a far-future end (installing
 * one). The web app signs the lock it reports with HMAC-SHA256 under the pairing token the user
 * pasted into the extension, and the extension accepts only a response that verifies.
 *
 * Threat limits, stated plainly: this stops a responder that does NOT know the pairing token. It
 * does not protect against a process that can read the user's database or the extension storage,
 * or that already fetched the token from the running web app. It is not local-client auth.
 *
 * Browser-safe: WebCrypto + TextEncoder only (no Node modules), so the extension can bundle it.
 */
import { MAX_FOCUS_HARD_CAP_MINUTES } from './session'

export const PROOF_VERSION = 1
/** How far the proof timestamp may differ from the verifier's clock. */
export const PROOF_SKEW_MS = 120_000
/** Longest validity window a proof may claim. */
export const PROOF_MAX_TTL_MS = 120_000
export const MAX_PROOF_DOMAINS = 500
export const MAX_DOMAIN_CHARS = 253
export const MAX_PROOF_BODY_BYTES = 64 * 1024
/** Product ceiling on one session; a signed endsAt further out than this is refused. */
export const MAX_LOCK_HORIZON_MS = MAX_FOCUS_HARD_CAP_MINUTES * 60_000

const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/
const MAC_RE = /^[A-Za-z0-9_-]{43}$/
const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

export interface ProofLock {
  active: boolean
  /** ISO end of the lock. Null only when inactive. */
  endsAt: string | null
  /** Absolute ceiling (ISO) when the server has one. */
  hardCapAt: string | null
  domains: string[]
}

export interface LockProof {
  v: number
  nonce: string
  issuedAt: string
  expiresAt: string
  lock: ProofLock
  mac: string
}

export type VerifyResult =
  | { ok: true; lock: { active: boolean; endsAt: string | null; domains: string[] } }
  | { ok: false; reason: string }

export function isValidNonce(n: unknown): n is string {
  return typeof n === 'string' && NONCE_RE.test(n)
}

function parseIso(s: unknown): number | null {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return null
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : null
}

/** Lowercase, trim, validate, de-duplicate and sort. Returns null when anything is malformed. */
export function normalizeProofDomains(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_PROOF_DOMAINS) return null
  const out = new Set<string>()
  for (const d of input) {
    if (typeof d !== 'string') return null
    const n = d.trim().toLowerCase()
    if (n.length === 0 || n.length > MAX_DOMAIN_CHARS || !DOMAIN_RE.test(n)) return null
    out.add(n)
  }
  return [...out].sort()
}

/**
 * Fixed, unambiguous byte layout of everything that influences acceptance. Every field is
 * length-prefixed, so no value can borrow bytes from its neighbour. Domain-separated by the tag.
 */
export function canonicalProofString(p: {
  v: number
  nonce: string
  issuedAt: string
  expiresAt: string
  lock: ProofLock
}): string {
  const f = (name: string, value: string) => `${name}:${value.length}:${value}\n`
  const domains = p.lock.domains
  return (
    'lh-focus-lock-proof\n' +
    f('v', String(p.v)) +
    f('nonce', p.nonce) +
    f('issuedAt', p.issuedAt) +
    f('expiresAt', p.expiresAt) +
    f('active', p.lock.active ? '1' : '0') +
    f('endsAt', p.lock.endsAt === null ? '-' : `=${p.lock.endsAt}`) +
    f('hardCapAt', p.lock.hardCapAt === null ? '-' : `=${p.lock.hardCapAt}`) +
    f('domains', String(domains.length)) +
    domains.map((d) => f('d', d)).join('')
  )
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

function hmacKey(token: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  )
}

/**
 * Sign a lock. The lock is normalized first; throws on a malformed nonce, domain list or
 * timestamp so a bad input never produces a valid-looking proof.
 */
export async function signLockProof(
  token: string,
  input: { nonce: string; lock: ProofLock; nowMs: number; ttlMs?: number },
): Promise<LockProof> {
  if (!token) throw new Error('signLockProof: empty token')
  if (!isValidNonce(input.nonce)) throw new Error('signLockProof: invalid nonce')
  const domains = normalizeProofDomains(input.lock.domains)
  if (!domains) throw new Error('signLockProof: invalid domains')
  for (const t of [input.lock.endsAt, input.lock.hardCapAt]) {
    if (t !== null && parseIso(t) === null) throw new Error('signLockProof: invalid timestamp')
  }
  const ttl = Math.min(input.ttlMs ?? 60_000, PROOF_MAX_TTL_MS)
  const body = {
    v: PROOF_VERSION,
    nonce: input.nonce,
    issuedAt: new Date(input.nowMs).toISOString(),
    expiresAt: new Date(input.nowMs + ttl).toISOString(),
    lock: { ...input.lock, domains },
  }
  const mac = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(token, 'sign'),
    new TextEncoder().encode(canonicalProofString(body)),
  )
  return { ...body, mac: b64url(new Uint8Array(mac)) }
}

/**
 * Verify a response's `proof`. Strict about shape; the MAC covers v, nonce, both timestamps and
 * the whole lock. On success returns the lock the extension may act on: for an active lock the
 * end is the earlier of endsAt and hardCapAt, and it must be in the future and within the
 * product's 4 h ceiling from the verifier's clock. An inactive lock is valid with a null end.
 */
export async function verifyLockProof(
  token: string,
  expectedNonce: string,
  raw: unknown,
  nowMs: number,
): Promise<VerifyResult> {
  const bad = (reason: string): VerifyResult => ({ ok: false, reason })
  if (!token) return bad('no-token')
  if (!isValidNonce(expectedNonce)) return bad('bad-expected-nonce')
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('shape')
  const p = raw as Record<string, unknown>
  if (p.v !== PROOF_VERSION) return bad('version')
  if (p.nonce !== expectedNonce) return bad('nonce')
  const issued = parseIso(p.issuedAt)
  const expires = parseIso(p.expiresAt)
  if (issued === null || expires === null) return bad('timestamps')
  if (Math.abs(nowMs - issued) > PROOF_SKEW_MS) return bad('issued-window')
  if (expires <= issued || expires - issued > PROOF_MAX_TTL_MS) return bad('ttl')
  if (nowMs > expires) return bad('expired')
  const l = p.lock as Record<string, unknown> | null
  if (!l || typeof l !== 'object' || Array.isArray(l)) return bad('lock-shape')
  if (typeof l.active !== 'boolean') return bad('lock-active')
  const endsAt =
    l.endsAt === null ? null : parseIso(l.endsAt) === null ? undefined : (l.endsAt as string)
  const hardCapAt =
    l.hardCapAt === null
      ? null
      : parseIso(l.hardCapAt) === null
        ? undefined
        : (l.hardCapAt as string)
  if (endsAt === undefined || hardCapAt === undefined) return bad('lock-timestamps')
  const domains = normalizeProofDomains(l.domains)
  if (!domains) return bad('lock-domains')
  // The signed list must already be in canonical form: a non-canonical list is a different string.
  if (JSON.stringify(domains) !== JSON.stringify(l.domains))
    return bad('lock-domains-not-canonical')
  if (typeof p.mac !== 'string' || !MAC_RE.test(p.mac)) return bad('mac-shape')
  const sig = unb64url(p.mac)
  if (!sig) return bad('mac-shape')

  const lock: ProofLock = { active: l.active, endsAt, hardCapAt, domains }
  const data = new TextEncoder().encode(
    canonicalProofString({
      v: PROOF_VERSION,
      nonce: expectedNonce,
      issuedAt: p.issuedAt as string,
      expiresAt: p.expiresAt as string,
      lock,
    }),
  )
  const okMac = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(token, 'verify'),
    sig as BufferSource,
    data,
  )
  if (!okMac) return bad('mac')

  if (!lock.active) return { ok: true, lock: { active: false, endsAt: null, domains } }
  if (endsAt === null) return bad('active-without-end')
  let end = Date.parse(endsAt)
  if (hardCapAt !== null) end = Math.min(end, Date.parse(hardCapAt))
  if (end <= nowMs) return bad('lock-ended')
  if (end - nowMs > MAX_LOCK_HORIZON_MS) return bad('lock-horizon')
  return { ok: true, lock: { active: true, endsAt: new Date(end).toISOString(), domains } }
}

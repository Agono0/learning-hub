/**
 * Persisted extension state — one validated reader shared by the service
 * worker and the popup. `chrome.storage` hands back untyped data (it can be
 * stale from an older version or edited by hand), so nothing is trusted
 * without checking its shape.
 */

/** Native app loopback bridge default port. */
export const DEFAULT_PORT = 47615

/**
 * Where a cached lock came from. Descriptive, not a security assurance for loopback: the
 * `loopback` bridge response is unauthenticated (the token goes to whichever process owns the
 * port). `fallback-verified` means a web response whose nonce-bound HMAC proof verified.
 * `legacy` marks an entry written before provenance existed: it may have come from an unsigned
 * web response, so it is never relabeled as verified.
 */
export type LockSource = 'loopback' | 'fallback-verified' | 'legacy'

export interface StoredLock {
  active: boolean
  endsAt: string | null
  domains: string[]
  /** Absent in entries written by older versions (read back as `legacy`). */
  source?: LockSource
  /** ISO time a legacy entry was first seen by this version; its honoring window starts here. */
  migratedAt?: string
}

export interface ExtensionState {
  pairingToken?: string
  loopbackPort: number
  lastKnownLock: StoredLock | null
}

/** Storage keys this extension owns. */
export const STATE_KEYS = ['pairingToken', 'loopbackPort', 'lastKnownLock'] as const

/** A valid TCP port (1-65535) from user/storage input, else the default. */
export function normalizePort(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.trim()) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_PORT
}

function parseLock(value: unknown): StoredLock | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.active !== 'boolean') return null
  const source: LockSource =
    v.source === 'loopback' || v.source === 'fallback-verified' ? v.source : 'legacy'
  return {
    active: v.active,
    endsAt: typeof v.endsAt === 'string' ? v.endsAt : null,
    domains: Array.isArray(v.domains)
      ? v.domains.filter((d): d is string => typeof d === 'string')
      : [],
    source,
    ...(source === 'legacy' &&
    typeof v.migratedAt === 'string' &&
    Number.isFinite(Date.parse(v.migratedAt))
      ? { migratedAt: v.migratedAt }
      : {}),
  }
}

/** Validates raw `chrome.storage.local.get(STATE_KEYS)` output. */
export function parseStoredState(raw: Record<string, unknown>): ExtensionState {
  const token = typeof raw.pairingToken === 'string' ? raw.pairingToken.trim() : ''
  return {
    ...(token ? { pairingToken: token } : {}),
    loopbackPort: normalizePort(raw.loopbackPort),
    lastKnownLock: parseLock(raw.lastKnownLock),
  }
}

/** True while a stored lock is active and has not yet ended at `now`. */
export function isLockActive(lock: StoredLock | null, now: number): boolean {
  return Boolean(lock?.active && lock.endsAt && new Date(lock.endsAt).getTime() > now)
}

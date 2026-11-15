/**
 * Friction capture (F-10, plan-M19-M21 M21's last open item).
 *
 * During an active Max Focus session the DNR rules already block distraction
 * domains — but the ATTEMPT is the learning signal: it is exactly the leak the
 * web app records via its friction gate, now captured where it actually
 * happens (the browser). The decision function is pure and testable; the
 * service worker wires it to navigation events and reports fire-and-forget.
 *
 * Silent by contract: no popups, no counters — a navigation either produces
 * one friction event or nothing.
 */
import { isDomainAllowed, normalizeDomain } from '@learning-hub/core/focus-lock'
import type { StoredLock } from './state'
import type { CaptureRequest } from './capture'

export interface FrictionDecision {
  record: boolean
  /** Present only when record === true. */
  payload?: {
    trigger: 'distraction'
    proceeded: false
    /** Seconds from session start to the attempt (>= 0). */
    delaySec: number
    /** The blocked domain, for the honesty log's human reader. */
    domain: string
  }
  reason?: 'not-in-session' | 'session-expired' | 'domain-not-blocked' | 'loopback-page'
}

export type RecordedFrictionDecision = FrictionDecision & {
  record: true
  payload: NonNullable<FrictionDecision['payload']>
}

/**
 * Decide whether a navigation to `pageUrl` during the given lock state is a
 * friction event. Mirrors the DNR block semantics (isDomainAllowed — subdomain
 * label boundary, loopback always allowed) so we only record what the rules
 * actually block.
 */
export function decideFriction(
  lock: StoredLock | null,
  pageUrl: string,
  now: number,
): FrictionDecision {
  if (!lock || !lock.active) return { record: false, reason: 'not-in-session' }
  const endsAtMs = lock.endsAt ? new Date(lock.endsAt).getTime() : 0
  if (!endsAtMs || endsAtMs <= now) return { record: false, reason: 'session-expired' }

  let hostname = ''
  try {
    hostname = new URL(pageUrl).hostname
  } catch {
    return { record: false, reason: 'loopback-page' }
  }
  // Extension-internal pages (blocked.html etc.) are chrome-extension:// —
  // isDomainAllowed treats non-http hosts honestly; skip them explicitly.
  const scheme = pageUrl.split(':')[0]?.toLowerCase()
  if (scheme !== 'http' && scheme !== 'https') {
    return { record: false, reason: 'loopback-page' }
  }
  // Loopback always allowed (same carve-out as the DNR rules).
  const norm = normalizeDomain(hostname)
  if (
    norm === 'localhost' ||
    norm === '127.0.0.1' ||
    norm === '::1' ||
    norm.endsWith('.localhost')
  ) {
    return { record: false, reason: 'loopback-page' }
  }

  if (!isDomainAllowed(hostname, lock.domains)) {
    // delaySec is the web app's gate-run delay — the extension blocks at
    // once (no gate run), so 0 is the honest value.
    return {
      record: true,
      payload: {
        trigger: 'distraction',
        proceeded: false,
        delaySec: 0,
        domain: norm,
      },
    }
  }
  return { record: false, reason: 'domain-not-blocked' }
}

/** POST /api/friction body for a recorded attempt (append-only, rule 8). */
export function buildFrictionReport(decision: RecordedFrictionDecision): CaptureRequest {
  return {
    path: '/api/friction',
    body: {
      trigger: decision.payload.trigger,
      proceeded: decision.payload.proceeded,
      delaySec: decision.payload.delaySec,
      reflection: `Extension blocked attempt: ${decision.payload.domain}`,
    },
  }
}

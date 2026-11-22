/**
 * Max Focus emergency allowlist (M2-15) — the emergency dialer and its
 * supporting system apps are ALWAYS permitted during a session, on every
 * platform. A distraction lock that can block calling for help is not a
 * safety tool; this module is the invariant that makes "always reachable"
 * a property of the DATA, not of any one client's behavior.
 *
 * Enforcement shape: the session's effective app allowlist is ALWAYS
 * `mergeAllowlists(userApps)` — the system set is unioned in and can never be
 * removed by user configuration, storage corruption, or a malicious sync.
 * Pure + runtime-neutral (core rule): the Android side feeds the result into
 * Lock Task packages (M2-11) / the Tier 2 watcher (M2-12); Windows doesn't
 * need an app allowlist for the dialer (the OS dialer-via-tel: flow is never
 * swallowed by the M2-06 hook), and the UI tile (EmergencyDialerTile) opens
 * the platform dialer directly.
 */
import { z } from 'zod'

/**
 * System apps that must remain reachable during ANY Max Focus session:
 * every known OEM dialer package, the contacts providers the dialer opens,
 * and the telecom router. Exact package names (normalized compare).
 */
export const SYSTEM_ALLOWED_APPS: readonly string[] = [
  // AOSP
  'com.android.dialer',
  'com.android.contacts',
  'com.android.server.telecom',
  'com.android.incallui',
  // Google
  'com.google.android.dialer',
  'com.google.android.contacts',
  // Samsung
  'com.samsung.android.dialer',
  'com.samsung.android.contacts',
  'com.samsung.android.incallui',
  // Xiaomi
  'com.xiaomi.milk.callerid' /* MIUI dialer companion */,
  'com.android.incallui.miui',
]

/**
 * The tel: URI scheme prefix the emergency tile uses. The tile opens the
 * DIALER (no number pre-filled) so regional emergency numbers (911/112/…)
 * stay the user's and the platform's business — we never hardcode one.
 */
export const EMERGENCY_DIALER_URI = 'tel:'

/** Normalized app identifier: lowercase, trimmed, `.exe`/package suffix-free. */
export function normalizeAppName(app: string): string {
  const lower = app.trim().toLowerCase()
  return lower.endsWith('.exe') ? lower.slice(0, -4) : lower
}

/**
 * The session's EFFECTIVE app allowlist: user's apps ∪ {@link SYSTEM_ALLOWED_APPS}.
 * Deduplicated + normalized; the system set can never be filtered out —
 * even an allowlist of `[]` yields the system apps (that is the point).
 */
export function mergeAllowlists(userApps: readonly string[]): string[] {
  const merged = new Set<string>()
  for (const app of SYSTEM_ALLOWED_APPS) merged.add(normalizeAppName(app))
  for (const app of userApps) {
    const normalized = normalizeAppName(app)
    if (normalized.length > 0) merged.add(normalized)
  }
  return [...merged]
}

/**
 * Zod-validated session allowlist (the value persisted into the session
 * record / sent to the native enforcers). Accepts whatever the user wrote;
 * output is the ENFORCED list via {@link mergeAllowlists}.
 */
export const sessionAllowlistSchema = z
  .object({
    domains: z.array(z.string().trim().min(1).max(255)).default([]),
    apps: z.array(z.string().trim().min(1).max(100)).default([]),
  })
  .transform((input) => ({
    domains: [...new Set(input.domains.map((d) => d.toLowerCase()))],
    apps: mergeAllowlists(input.apps),
  }))

/** The parsed {@link sessionAllowlistSchema} shape. */
export type SessionAllowlist = z.infer<typeof sessionAllowlistSchema>

/** True when `app` survives enforcement (system apps always do). */
export function isAppAlwaysAllowed(app: string): boolean {
  const normalized = normalizeAppName(app)
  return SYSTEM_ALLOWED_APPS.some((allowed) => normalizeAppName(allowed) === normalized)
}

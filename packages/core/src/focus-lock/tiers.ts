/**
 * Per-tier permission checklist (M2-32) — the pure state machine that turns
 * platform-reported permission names into "what's granted vs what's needed"
 * for each Max Focus enforcement tier.
 *
 * The native layers report permissions in whatever casing their platform uses
 * (Kotlin `SYSTEM_ALERT_WINDOW`, Rust `elevation`), so matching is
 * case-insensitive and whitespace-trimmed — the same convention as
 * `missingRequiredPermissions` (session.ts, M2-20's tamper check). This module
 * adds the per-tier REQUIREMENTS matrix and the "best reachable tier"
 * projection the pre-session checklist (M2-16) renders before the user
 * commits to a lock.
 */
import type { FocusSessionTier } from './index'

/**
 * Permission names required per tier, ordered strongest→weakest. Names are
 * the platform-neutral identifiers the native bridges report (lowercase).
 * - `device_owner` — Android Device Owner provisioning (M2-10)
 * - `lock_task` — Lock Task Mode available (M2-11)
 * - `accessibility_service` — Tier 2 watcher (M2-12)
 * - `overlay` — SYSTEM_ALERT_WINDOW (M2-13)
 * - `device_admin` — anti-uninstall admin (M2-14)
 * - `keyboard_hook` — Windows low-level hooks (M2-06)
 * - `elevation` — Windows admin (DisableTaskMgr + watchdog, M2-08)
 * - `extension_bridge` — browser-extension DNR blocking (always grantable on web)
 */
export const TIER_REQUIREMENTS: Record<FocusSessionTier, readonly string[]> = {
  owner: ['device_owner', 'lock_task', 'device_admin'],
  accessibility: ['device_admin', 'accessibility_service', 'overlay'],
  'windows-admin': ['keyboard_hook', 'elevation'],
  'windows-basic': ['keyboard_hook'],
}

/** Tier strength order — used by {@link bestAvailableTier}. */
export const TIER_STRENGTH: readonly FocusSessionTier[] = [
  'owner',
  'accessibility',
  'windows-admin',
  'windows-basic',
]

/** The checklist row the UI renders per requirement. */
export interface TierChecklistRow {
  /** Platform-neutral permission name. */
  permission: string
  /** True when the platform reports it granted. */
  granted: boolean
}

/** Result of {@link tierChecklist}. */
export interface TierChecklist {
  /** Per-requirement rows, in requirement order. */
  rows: TierChecklistRow[]
  /** Requirement names still missing. */
  missing: string[]
  /** True when nothing is missing — the tier is fully enforceable. */
  satisfied: boolean
}

/**
 * Canonical permission id: trimmed, lowercased, and separator-folded
 * (`KeyboardHook`, `keyboard_hook`, `keyboard-hook` all → `keyboardhook`).
 *
 * Stronger than session.ts's lowercase-only convention because native
 * reporters disagree on SEPARATORS as well as case (Rust snake_case vs
 * Kotlin/CamelCase identifiers) — the checklist must never show a granted
 * permission as missing over punctuation.
 */
function canonPermission(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

/**
 * Compute the granted-vs-needed checklist for one tier. Pure; the caller
 * polls `granted` each tick (the native bridges refresh their permission
 * state per tick — M2-20's `missingRequiredPermissions` shares the same
 * lowercase-insensitive spirit, with separator folding added here).
 */
export function tierChecklist(tier: FocusSessionTier, granted: readonly string[]): TierChecklist {
  const required = TIER_REQUIREMENTS[tier] ?? []
  const have = new Set(granted.map(canonPermission))
  const missing = required.filter((r) => !have.has(canonPermission(r)))
  const missingSet = new Set(missing)
  return {
    rows: required.map((permission) => ({ permission, granted: !missingSet.has(permission) })),
    missing,
    satisfied: missing.length === 0,
  }
}

/**
 * The strongest tier whose requirements are ALL satisfied by `granted`
 * (null when not even the weakest tier is enforceable — the honest
 * "you cannot lock this device" answer the checklist must show).
 */
export function bestAvailableTier(granted: readonly string[]): FocusSessionTier | null {
  for (const tier of TIER_STRENGTH) {
    if (tierChecklist(tier, granted).satisfied) return tier
  }
  return null
}

/**
 * Human checklist copy per requirement — the pre-session audit renders these
 * verbatim (store-policy compliant wording lives in the disclosure screens,
 * M2-17; these are the one-line status labels).
 */
export const TIER_PERMISSION_LABELS: Record<string, string> = {
  device_owner: 'Device Owner provisioning',
  lock_task: 'Lock Task Mode pinning',
  device_admin: 'Device admin (anti-uninstall)',
  accessibility_service: 'Accessibility watcher',
  overlay: 'Screen overlay',
  keyboard_hook: 'Keyboard guard hooks',
  elevation: 'Administrator elevation',
  extension_bridge: 'Browser extension bridge',
}

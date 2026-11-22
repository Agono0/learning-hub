'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Globe, Lock } from 'lucide-react'
import {
  bestAvailableTier,
  TIER_PERMISSION_LABELS,
  tierChecklist,
  type FocusSessionTier,
} from '@learning-hub/core'
import { Toggle } from '@/ui'
import { deviceOwnerStatus } from '@/platform/device-owner'

/**
 * What the platform audit knows after mount — `null` while unknown (SSR and
 * pre-effect), so the checklist renders an honest pending state instead of a
 * guessed one.
 */
interface PlatformAudit {
  /** Platform label shown in the audit header. */
  platform: 'windows' | 'android' | 'web'
  /** Platform-reported granted permission names (lowercase, platform-neutral). */
  granted: string[]
  /** The strongest tier this device can currently enforce (null = none). */
  tier: FocusSessionTier | null
}

/**
 * Pre-session checklist for Max Focus (M2-16): the permission audit (granted
 * vs needed per tier, M2-32's checklist), the "what will be blocked" list
 * computed from the session's resolved allowlist, and the EXPLICIT confirm
 * that must be checked before the page's start button enables.
 *
 * Presentation for the allowlist parts (props in — the page owns the
 * selection); platform audit is self-contained and mount-time only, so SSR
 * renders the honest "audit pending" state. Device Owner provisioning is
 * M2-10's panel; this component only READS the state.
 */
export function MaxFocusPrecheck({
  allowedDomains,
  allowedApps,
  confirmed,
  onConfirmedChange,
}: {
  /** Resolved domains that WILL be reachable (defaults + preset + extras). */
  allowedDomains: string[]
  /** Resolved desktop apps that WILL be reachable (empty on web/Android). */
  allowedApps: string[]
  /** The explicit confirm checkbox state (page-owned). */
  confirmed: boolean
  onConfirmedChange: (next: boolean) => void
}) {
  const [audit, setAudit] = useState<PlatformAudit | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
      const isTauriDesktop =
        typeof window !== 'undefined' &&
        Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
      let next: PlatformAudit
      if (isTauriDesktop) {
        next = { platform: 'windows', granted: ['keyboard_hook'], tier: 'windows-basic' }
      } else if (isAndroid) {
        const owner = await deviceOwnerStatus()
        const granted = owner?.isDeviceOwner
          ? ['device_owner', 'lock_task', 'device_admin']
          : owner
            ? ['device_admin']
            : []
        next = { platform: 'android', granted, tier: bestAvailableTier(granted) }
      } else {
        // Web host: no OS-level enforcement — the browser-extension bridge is
        // the only shield, and the checklist says so instead of pretending.
        next = { platform: 'web', granted: ['extension_bridge'], tier: null }
      }
      if (!cancelled) setAudit(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const checklist = audit?.tier ? tierChecklist(audit.tier, audit.granted) : null

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
      <p className="label flex items-center gap-2">
        <Lock className="h-3.5 w-3.5" /> Before you commit
      </p>

      {/* What will be blocked: everything except the resolved allowlist. */}
      <div className="space-y-1.5">
        <p className="text-xs text-secondary flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-indigo-400" />
          Only these stay reachable — every other site and desktop app is blocked:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {allowedDomains.map((d) => (
            <span
              key={`d-${d}`}
              className="rounded border border-(--hub-border) bg-(--hub-panel-2) px-2 py-0.5 text-xs text-secondary"
            >
              {d}
            </span>
          ))}
          {allowedApps.map((a) => (
            <span
              key={`a-${a}`}
              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-status-success-text"
            >
              app: {a}
            </span>
          ))}
          {allowedDomains.length === 0 && allowedApps.length === 0 && (
            <span className="text-xs text-tertiary">No extras selected yet.</span>
          )}
        </div>
      </div>

      {/* Permission audit — granted vs needed for the reachable tier (M2-32). */}
      <div className="space-y-1.5">
        <p className="text-xs text-secondary">Permission audit:</p>
        {!audit ? (
          <p className="text-xs text-tertiary">Checking what this device can enforce…</p>
        ) : audit.tier && checklist ? (
          <ul className="space-y-1">
            {checklist.rows.map((row) => (
              <li
                key={row.permission}
                className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200"
              >
                {row.granted ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success-text" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                )}
                <span>{TIER_PERMISSION_LABELS[row.permission] ?? row.permission}</span>
                <span className="text-tertiary">{row.granted ? 'granted' : 'needed'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-tertiary">
            {audit.platform === 'web'
              ? 'Web host: the browser extension is the only shield — no OS-level lock. Windows or Android unlocks the stronger tiers.'
              : 'No enforcement tier is fully granted yet — provisioning steps above raise it.'}
          </p>
        )}
      </div>

      {/* The explicit, deliberate confirm — the start button gates on it. */}
      <Toggle
        label="I understand: this device stays locked until the timer ends or the 4-hour cap"
        checked={confirmed}
        onChange={onConfirmedChange}
      />
    </div>
  )
}

export default MaxFocusPrecheck

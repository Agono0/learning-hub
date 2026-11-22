'use client'

/**
 * EmergencyDialerTile — the always-reachable dialer tile for Max Focus
 * sessions (M2-15).
 *
 * Opens the PLATFORM dialer via a plain `tel:` link (no number pre-filled:
 * regional emergency numbers stay the user's and the platform's business).
 * The tile is part of the session surface (focus page Max Focus tab / the
 * lock windows load the same shell), and the app allowlist sent to the
 * native enforcers is ALWAYS the enforced list from core
 * (`mergeAllowlists` — SYSTEM_ALLOWED_APPS can never be filtered out), so
 * the dialer stays usable even though the foreground guard (M2-07/M2-09)
 * refocuses everything else.
 */
import type { ReactElement } from 'react'
import { PhoneCall } from 'lucide-react'
import { EMERGENCY_DIALER_URI } from '@learning-hub/core/focus-lock/emergency'

export function EmergencyDialerTile(): ReactElement {
  return (
    <a
      href={EMERGENCY_DIALER_URI}
      className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-strong transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg) dark:border-(--hub-border) dark:bg-(--hub-panel) dark:hover:bg-(--hub-panel-2)"
      aria-label="Open the phone dialer — always available during Max Focus"
    >
      <PhoneCall className="h-4 w-4 text-emerald-600 dark:text-status-success-text" aria-hidden />
      Emergency calls always available
    </a>
  )
}

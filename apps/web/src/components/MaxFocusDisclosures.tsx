'use client'

/**
 * MaxFocusDisclosures — the store-policy compliant disclosure screens for the
 * Max Focus device-lock permissions (M2-12/M2-17).
 *
 * Shown BEFORE any permission jump. Each disclosure states, in plain language:
 * what is granted, exactly what is observed, what is never read, and how to
 * revoke. Android's accessibility disclosure policy (and basic honesty) both
 * require this — the watcher reads window TRANSITIONS only, and the config
 * makes content access structurally impossible (canRetrieveWindowContent is
 * false in `max_focus_accessibility.xml`).
 *
 * M2-17 adds the Device Admin disclosure to this file once M2-14 lands; the
 * component is structured so screens compose into the pre-session checklist
 * (M2-16).
 */
import { useEffect, useState } from 'react'
import { Accessibility, ShieldQuestion } from 'lucide-react'
import { Button, Callout } from '@/ui'
import {
  accessibilityWatcherSupported,
  openAccessibilitySettings,
} from '@/platform/accessibility-watcher'

export interface MaxFocusDisclosuresProps {
  /** Called after the user acknowledges the accessibility disclosure. */
  onAccessibilityAcknowledged?: () => void
}

/** The accessibility disclosure content, as the single source of truth. */
export function AccessibilityDisclosureContent(): React.ReactElement {
  return (
    <div className="space-y-2 text-sm text-secondary">
      <p>
        <strong className="text-strong">What this permission does:</strong> during a Max Focus
        session, the watcher sees <em>which app comes to the foreground</em> and brings Learning HUB
        back in front when a non-allowlisted app appears.
      </p>
      <p>
        <strong className="text-strong">What it can never read:</strong> screen content. The service
        is configured with content access disabled — it receives window transitions (app package
        names) only. Nothing is recorded or sent anywhere.
      </p>
      <p>
        <strong className="text-strong">When it acts:</strong> only while a Max Focus session is
        active. Between sessions it does nothing. You can revoke it any time in system accessibility
        settings, and the app keeps working without it (Tier 1 devices use Lock Task instead).
      </p>
    </div>
  )
}

export function MaxFocusDisclosures({ onAccessibilityAcknowledged }: MaxFocusDisclosuresProps) {
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported(accessibilityWatcherSupported())
  }, [])

  if (!supported) return null

  return (
    <div className="space-y-3" role="group" aria-label="Max Focus permission disclosures">
      <Callout tone="accent" title="Before you continue — accessibility permission">
        <AccessibilityDisclosureContent />
      </Callout>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            onAccessibilityAcknowledged?.()
            void openAccessibilitySettings()
          }}
          icon={<Accessibility className="h-4 w-4" aria-hidden />}
        >
          Open accessibility settings
        </Button>
        <span className="text-xs text-tertiary">
          <ShieldQuestion className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          You grant this in system settings — the app never asks silently.
        </span>
      </div>
    </div>
  )
}

'use client'
import React from 'react'

/**
 * MaxFocusDisclosures — the store-policy compliant disclosure screens for the
 * Max Focus device-lock permissions (M2-12 accessibility + M2-17 device
 * admin).
 *
 * Shown BEFORE any permission jump. Each disclosure states, in plain language:
 * what is granted, exactly what is observed, what is never read/done, and how
 * to revoke. Android's accessibility disclosure policy (and basic honesty)
 * both require this — the watcher reads window TRANSITIONS only, and the
 * config makes content access structurally impossible
 * (`canRetrieveWindowContent=false` in `max_focus_accessibility.xml`).
 *
 * The two screens compose into the pre-session checklist (M2-16); the native
 * settings jumps (`openAccessibilitySettings` / system device-admin list) are
 * the only actions — the app never grants anything itself.
 */
import { useEffect, useState } from 'react'
import { Accessibility, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { Button, Callout } from '@/ui'
import {
  accessibilityWatcherSupported,
  openAccessibilitySettings,
} from '@/platform/accessibility-watcher'

export interface MaxFocusDisclosuresProps {
  /** Called after the user acknowledges the accessibility disclosure. */
  onAccessibilityAcknowledged?: () => void
  /** Called after the user acknowledges the device-admin disclosure. */
  onDeviceAdminAcknowledged?: () => void
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

/**
 * The device-admin disclosure content (M2-17): the anti-uninstall guard for
 * Max Focus sessions. Store-policy compliant: states the scope, the
 * never-does list (no wipe, no location, no data collection), and revocation.
 */
export function DeviceAdminDisclosureContent(): React.ReactElement {
  return (
    <div className="space-y-2 text-sm text-secondary">
      <p>
        <strong className="text-strong">What device admin does here:</strong> during a Max Focus
        session it shows the persistent &quot;session running&quot; notification and — when the
        device is a provisioned Device Owner (Tier 1) — can block uninstalling the app so a session
        cannot be defeated by removing it. On Owner devices it may also pin the screen to your
        allowlisted apps (Lock Task).
      </p>
      <p>
        <strong className="text-strong">What it never does:</strong> no factory reset, no wipe, no
        location access, no reading of your data — the app requests the minimum admin capability
        (screen lock), and nothing in Learning HUB sends your activity anywhere.
      </p>
      <p>
        <strong className="text-strong">When it acts:</strong> while you have an active session (or
        until you revoke it). Revoke any time in system settings → Security → Device admin apps; the
        session simply becomes softer (Tier 2) and the app keeps working.
      </p>
    </div>
  )
}

export function MaxFocusDisclosures({
  onAccessibilityAcknowledged,
  onDeviceAdminAcknowledged,
}: MaxFocusDisclosuresProps) {
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

      <Callout tone="warning" title="Before you continue — device admin">
        <DeviceAdminDisclosureContent />
      </Callout>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => {
            onDeviceAdminAcknowledged?.()
          }}
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
        >
          I understand what device admin does
        </Button>
      </div>
    </div>
  )
}

'use client'

/**
 * Settings > Updates section (O1-14): release-channel picker, check cadence,
 * Wi-Fi-only download gate (Android), and the current build identity.
 *
 * Save model: **device-local** (audit L7a family, like Quick-HUD style) — the
 * update policy controls THIS device's updater, so it lives in
 * `localStorage['lh-update-settings']` through `@/lib/updates`
 * (`loadUpdateSettings` / `saveUpdateSettings`), validated by the core
 * `updateSettingsSchema` at every boundary. Every change saves immediately
 * (confirm-in-place "Saved on this device"); the global Save button is for
 * server-persisted sections and is not involved.
 *
 * Store builds (`LH_UPDATE_CHANNEL=play`, see O1-12) render the controls
 * read-only with an honest callout: updates arrive through the store.
 * "Check now" stays disabled until the native updater service is wired
 * (O1-10/O1-25) — the disabled state names the reason instead of pretending.
 */
import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  updateSettingsSchema,
  type UpdateChannel,
  type UpdateSettings,
} from '@learning-hub/core/update'
import { SectionHeader } from '@/components/ui/section-header'
import { getDeviceIdentity } from '@/lib/device'
import {
  APP_VERSION,
  checkForUpdate,
  loadUpdateSettings,
  saveUpdateSettings,
  SELF_UPDATE_ENABLED,
  UPDATE_BUILD_FLAVOR,
} from '@/lib/updates'
import { UpdateChangelog } from '@/components/UpdateChangelog'
import { Badge, Button, Callout, SelectField, Toggle } from '@/ui'

/** Channel options in stable SP-parity order (most volatile first). */
const CHANNEL_OPTIONS: Array<{ value: UpdateChannel; label: string }> = [
  { value: 'nightly', label: 'Nightly' },
  { value: 'beta', label: 'Beta' },
  { value: 'stable', label: 'Stable' },
]

/** Check cadence options (hours; 168 = weekly). Mirrors core's 1–168 range. */
const INTERVAL_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Every hour' },
  { value: 6, label: 'Every 6 hours' },
  { value: 12, label: 'Every 12 hours' },
  { value: 24, label: 'Daily' },
  { value: 72, label: 'Every 3 days' },
  { value: 168, label: 'Weekly' },
]

/**
 * Calm defaults used for the first (SSR + hydration) render — the effect then
 * swaps in the stored values after mount, so server and client markup match.
 */
const DEFAULTS: UpdateSettings = updateSettingsSchema.parse({})

/**
 * Manual-check states (O1-25): idle before the first press, then the honest
 * outcome of the last run. Rendered in the status line under "Check now".
 */
type ManualCheckState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'unavailable'

/**
 * The Updates section as rendered on `/settings`. Renders its own
 * `<section id="settings-updates">` panel so the page only composes it.
 */
export function UpdatesSettingsSection(): React.ReactElement {
  const [settings, setSettings] = useState<UpdateSettings>(DEFAULTS)
  const [isAndroid, setIsAndroid] = useState(false)
  const [savedTick, setSavedTick] = useState(0)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [checkState, setCheckState] = useState<ManualCheckState>('idle')
  const [checkVersion, setCheckVersion] = useState<string | null>(null)

  // Hydration-safe loads (device.ts pattern): storage and platform are read
  // after mount only, so SSR markup (defaults, no Android toggle) matches the
  // first client render exactly.
  useEffect(() => {
    setSettings(loadUpdateSettings())
    setIsAndroid(getDeviceIdentity().platform === 'android')
  }, [])

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  /** Apply a patch, persist it device-local, and confirm in place. */
  const update = (patch: Partial<UpdateSettings>) => {
    const next = updateSettingsSchema.parse({ ...settings, ...patch })
    setSettings(next)
    saveUpdateSettings(next)
    setSavedTick((t) => t + 1)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedTick(0), 2000)
  }

  const readOnly = !SELF_UPDATE_ENABLED

  /** Run one manual check (O1-25) and surface the honest outcome inline. */
  const runManualCheck = () => {
    if (checkState === 'checking') return
    setCheckState('checking')
    setCheckVersion(null)
    void checkForUpdate()
      .then((result) => {
        setCheckState(result.status)
        setCheckVersion(result.pointerVersion)
      })
      .catch(() => setCheckState('unavailable'))
  }

  /**
   * Status line for the manual check — never a spinner-only dead end; every
   * terminal state says what happened and what happens next.
   */
  const checkStatusText = (() => {
    if (checkState === 'checking') return 'Checking for updates…'
    if (checkState === 'up-to-date') return 'You are on the latest build for this channel.'
    if (checkState === 'available' && checkVersion)
      return `${checkVersion} is available — restart after download to apply.`
    if (checkState === 'unavailable') return 'The channel pointer is unreachable right now.'
    return 'Automatic checks also run on app start, honoring the interval and Wi-Fi policy above.'
  })()

  return (
    <section id="settings-updates" className="panel scroll-mt-32 space-y-4 md:scroll-mt-24">
      <SectionHeader icon={RefreshCw} title="Updates" />
      <p className="text-xs text-tertiary">
        Choose the release channel your app follows. Stored on this device only.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
        <Badge tone="accent">{UPDATE_BUILD_FLAVOR}</Badge>
        <span>Version {APP_VERSION || 'dev'}</span>
        {!readOnly && settings.lastCheckedAt ? (
          <span className="text-tertiary">Last check {settings.lastCheckedAt}</span>
        ) : null}
      </div>

      {readOnly && (
        <Callout tone="warning" title="App store build">
          This copy was installed from an app store, so updates arrive through the store and the
          settings below are read-only.
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField
          label="Release channel"
          hint="Nightly tracks fresh builds; stable changes rarely."
          value={settings.channel}
          disabled={readOnly}
          onChange={(e) => update({ channel: e.target.value as UpdateChannel })}
        >
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Check interval"
          hint="How often the app looks for a newer build."
          value={String(settings.autoCheckIntervalHours)}
          disabled={readOnly}
          onChange={(e) => update({ autoCheckIntervalHours: Number(e.target.value) })}
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SelectField>
      </div>

      {!readOnly && <UpdateChangelog channel={settings.channel} />}

      {isAndroid && (
        <Toggle
          checked={settings.wifiOnly}
          disabled={readOnly}
          onChange={(next) => update({ wifiOnly: next })}
          label="Download on Wi-Fi only"
          description="Wait for an unmetered network before downloading updates."
        />
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          variant="secondary"
          disabled={readOnly}
          loading={checkState === 'checking'}
          onClick={runManualCheck}
        >
          Check now
        </Button>
        <span className="text-xs text-tertiary">
          {savedTick > 0 ? 'Saved on this device' : checkStatusText}
        </span>
      </div>
    </section>
  )
}

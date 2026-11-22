/**
 * Integration tests for Settings > Updates (O1-14).
 *
 * Covers:
 * - SSR-safe render of `UpdatesSettingsSection` (renderToString, no browser
 *   APIs at render time — storage/platform reads are effect-only).
 * - The device-local settings store in `@/lib/updates` (defaults, roundtrip,
 *   corrupted-JSON fallback, node-env safety).
 * - The Play-store gate: with `LH_UPDATE_CHANNEL=play` baked, the section
 *   renders the read-only callout and disabled controls.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateSettingsSchema } from '@learning-hub/core/update'
import { UpdatesSettingsSection } from '../src/components/UpdatesSettingsSection'
import { loadUpdateSettings, saveUpdateSettings } from '../src/lib/updates'

/**
 * The lib guards on `window` (hydration safety), so the stub has to provide
 * `window.localStorage` as well as the bare `localStorage` global.
 */
function stubWindowStorage() {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage })
  return store
}

describe('UpdatesSettingsSection (SSR-safe)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('renders the section with defaults in server context', () => {
    const html = renderToString(React.createElement(UpdatesSettingsSection))
    expect(html).toContain('settings-updates')
    expect(html).toContain('Release channel')
    expect(html).toContain('Nightly')
    expect(html).toContain('Check interval')
    expect(html).toContain('Every 6 hours')
    expect(html).toContain('Check now')
    expect(html).toContain('Stored on this device only')
    // Play-store callout must NOT render for the default (self-update on) build.
    expect(html).not.toContain('App store build')
    // Android-only toggle stays hidden until platform detection runs client-side.
    expect(html).not.toContain('Download on Wi-Fi only')
  })

  it('renders the read-only store gate when the build flavor is play', async () => {
    vi.resetModules()
    vi.stubEnv('LH_UPDATE_CHANNEL', 'play')
    const { UpdatesSettingsSection: FreshSection } =
      (await import('../src/components/UpdatesSettingsSection')) as typeof import('../src/components/UpdatesSettingsSection')
    const html = renderToString(React.createElement(FreshSection))
    expect(html).toContain('App store build')
    expect(html).toContain('updates arrive through the store')
    // Controls are disabled when self-update is off (baked at build time).
    expect(html).toContain('disabled')
  })

  it('bakes self-update off for play flavor in the shared lib', async () => {
    vi.resetModules()
    vi.stubEnv('LH_UPDATE_CHANNEL', 'play')
    const mod = (await import('../src/lib/updates')) as typeof import('../src/lib/updates')
    expect(mod.UPDATE_BUILD_FLAVOR).toBe('play')
    expect(mod.SELF_UPDATE_ENABLED).toBe(false)
  })
})

describe('device-local update settings store', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns calm defaults when no storage exists (node/SSR env)', () => {
    const settings = loadUpdateSettings()
    expect(settings.channel).toBe('nightly')
    expect(settings.autoCheckIntervalHours).toBe(6)
    expect(settings.wifiOnly).toBe(true)
    expect(settings.autoApply).toBe(false)
  })

  it('saveUpdateSettings is a safe no-op without storage', () => {
    expect(() => saveUpdateSettings(loadUpdateSettings())).not.toThrow()
  })

  it('roundtrips values through localStorage and validates on read', () => {
    const store = stubWindowStorage()
    saveUpdateSettings({
      channel: 'stable',
      autoCheckIntervalHours: 72,
      wifiOnly: false,
      autoApply: false,
    })
    expect(store.get('lh-update-settings')).toContain('"channel":"stable"')
    const loaded = loadUpdateSettings()
    expect(loaded.channel).toBe('stable')
    expect(loaded.autoCheckIntervalHours).toBe(72)
    expect(loaded.wifiOnly).toBe(false)
  })

  it('falls back to defaults on corrupted JSON or invalid shapes', () => {
    stubWindowStorage()
    const storage = window.localStorage
    // Corrupted JSON
    storage.setItem('lh-update-settings', '{not json')
    expect(loadUpdateSettings().channel).toBe('nightly')
    // Valid JSON, invalid shape (channel outside the enum, interval out of range)
    storage.setItem(
      'lh-update-settings',
      JSON.stringify({ channel: 'canary', autoCheckIntervalHours: 9999 }),
    )
    const fallback = loadUpdateSettings()
    expect(fallback.channel).toBe('nightly')
    expect(fallback.autoCheckIntervalHours).toBe(
      updateSettingsSchema.parse({}).autoCheckIntervalHours,
    )
  })
})

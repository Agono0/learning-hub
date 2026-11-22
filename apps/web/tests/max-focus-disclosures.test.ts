/**
 * Unit tests for the Tier 2 accessibility bridge + disclosure screens
 * (M2-12 accessibility + M2-17 device admin). Off-Android the helpers are
 * no-ops and the disclosures render nothing (Android-only flow); the privacy
 * copy is shape-pinned so the "content access disabled" and "never wipes"
 * claims cannot silently disappear.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  AccessibilityDisclosureContent,
  DeviceAdminDisclosureContent,
  MaxFocusDisclosures,
} from '../src/components/MaxFocusDisclosures'
import {
  accessibilityWatcherSupported,
  openAccessibilitySettings,
  setAccessibilityWatchState,
} from '../src/platform/accessibility-watcher'

describe('accessibilityWatcherSupported', () => {
  it('is false outside a Tauri Android shell (plain web / node test env)', () => {
    expect(accessibilityWatcherSupported()).toBe(false)
  })
})

describe('setAccessibilityWatchState / openAccessibilitySettings', () => {
  it('are no-ops on non-Tauri hosts (never throw)', async () => {
    await expect(setAccessibilityWatchState(true, ['dev.learninghub.app'])).resolves.toBeNull()
    await expect(setAccessibilityWatchState(false, [])).resolves.toBeNull()
    await expect(openAccessibilitySettings()).resolves.toBeNull()
  })
})

describe('AccessibilityDisclosureContent (M2-12)', () => {
  it('states the window-transition scope and the no-content guarantee', () => {
    const html = renderToString(React.createElement(AccessibilityDisclosureContent))
    expect(html).toContain('which app comes to the foreground')
    expect(html).toContain('never read')
    expect(html).toContain('content access disabled')
    expect(html).toContain('Nothing is recorded or sent anywhere')
  })
})

describe('DeviceAdminDisclosureContent (M2-17)', () => {
  it('states the anti-uninstall scope and the never-does list', () => {
    const html = renderToString(React.createElement(DeviceAdminDisclosureContent))
    expect(html).toContain('block uninstalling the app')
    expect(html).toContain('no factory reset, no wipe')
    expect(html).toContain('no location access')
    expect(html).toContain('Device admin apps')
  })
})

describe('MaxFocusDisclosures (composed)', () => {
  it('renders nothing off-Android (disclosures are an Android-only flow)', () => {
    expect(renderToString(React.createElement(MaxFocusDisclosures, {}))).toBe('')
  })
})

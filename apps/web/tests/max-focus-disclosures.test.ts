/**
 * Unit tests for the Tier 2 accessibility bridge + disclosure screens
 * (M2-12). Off-Android the helpers are no-ops and the disclosure renders
 * nothing (it is an Android-only flow); the privacy copy is shape-pinned so
 * the "content access disabled" claim cannot silently disappear.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MaxFocusDisclosures } from '../src/components/MaxFocusDisclosures'
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

describe('MaxFocusDisclosures', () => {
  it('renders nothing off-Android (disclosure is an Android-only flow)', () => {
    expect(renderToString(React.createElement(MaxFocusDisclosures, {}))).toBe('')
  })
})

/**
 * Unit tests for device identity and platform detection (device.ts).
 *
 * Verifies that detectPlatform properly distinguishes:
 * - SSR (platform 'other')
 * - Regular browsers on desktop (platform 'web')
 * - Regular browsers on mobile (platform 'android')
 * - Tauri shell on Windows (WebView2 without 'tauri' in userAgent -> platform 'windows')
 * - Tauri shell on Android (platform 'android')
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transportMocks = vi.hoisted(() => ({
  isTauri: false,
}))

vi.mock('@/lib/transport', () => ({
  get isTauri() {
    return transportMocks.isTauri
  },
}))

describe('device identity & platform detection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    transportMocks.isTauri = false
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    transportMocks.isTauri = false
  })

  it('returns platform "other" in SSR context (window undefined)', async () => {
    vi.stubGlobal('window', undefined)
    const { getDeviceIdentity } = await import('../src/lib/device')
    const id = getDeviceIdentity()
    expect(id.platform).toBe('other')
    expect(id.name).toBe('This device')
  })

  it('detects desktop web browser as platform "web"', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    })
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    transportMocks.isTauri = false

    const { getDeviceIdentity } = await import('../src/lib/device')
    const id = getDeviceIdentity()
    expect(id.platform).toBe('web')
    expect(id.name).toBe('Browser')
  })

  it('detects mobile web browser as platform "android"', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    })
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    })
    transportMocks.isTauri = false

    const { getDeviceIdentity } = await import('../src/lib/device')
    const id = getDeviceIdentity()
    expect(id.platform).toBe('android')
    expect(id.name).toBe('Android device')
  })

  it('detects Windows Tauri shell as platform "windows" even when userAgent lacks tauri keyword', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    })
    // Standard WebView2 user agent on Windows has NO "tauri" or "LearningHUB" keyword
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    })
    transportMocks.isTauri = true

    const { getDeviceIdentity } = await import('../src/lib/device')
    const id = getDeviceIdentity()
    expect(id.platform).toBe('windows')
    expect(id.name).toBe('Desktop app')
  })

  it('detects Android Tauri shell as platform "android"', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    })
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    })
    transportMocks.isTauri = true

    const { getDeviceIdentity } = await import('../src/lib/device')
    const id = getDeviceIdentity()
    expect(id.platform).toBe('android')
    expect(id.name).toBe('Android device')
  })

  it('persists and returns custom device name', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    })

    const { getDeviceIdentity, setDeviceName } = await import('../src/lib/device')
    setDeviceName('My Custom Studio PC')
    const id = getDeviceIdentity()
    expect(id.name).toBe('My Custom Studio PC')
  })
})

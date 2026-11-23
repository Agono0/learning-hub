/**
 * Client-side device identity for the multi-device sync roster.
 *
 * The identity deliberately does NOT live in the database: snapshots travel
 * between devices wholesale, so any DB-resident identity would collide. A
 * stable UUID in localStorage stays on the device and is sent with sync
 * requests — the server stores it in `sync_devices` and mirrors the roster
 * back through snapshots.
 *
 * Hydration-safe: everything is behind function calls (never module-level),
 * mirroring the Phase-M19 pattern of keeping window access out of render.
 */
import { isTauri } from '@/lib/transport'

const DEVICE_ID_KEY = 'lh-device-id'
const DEVICE_NAME_KEY = 'lh-device-name'

export interface DeviceIdentity {
  deviceId: string
  /** Editable label shown on other devices. */
  name: string
  platform: 'web' | 'windows' | 'android' | 'other'
}

function detectPlatform(): DeviceIdentity['platform'] {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (isTauri || /tauri|LearningHUB/i.test(ua)) return 'windows'
  return 'web'
}

/** The stable per-device identity; generates and persists it on first call. */
export function getDeviceIdentity(): DeviceIdentity {
  if (typeof window === 'undefined') {
    return { deviceId: '', name: 'This device', platform: 'other' }
  }
  let deviceId = ''
  try {
    deviceId = window.localStorage.getItem(DEVICE_ID_KEY) ?? ''
    if (!deviceId) {
      deviceId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      window.localStorage.setItem(DEVICE_ID_KEY, deviceId)
    }
  } catch {
    // Storage restricted (private mode) — fall back to a session-only id.
    deviceId = deviceId || `dev-session-${Math.random().toString(36).slice(2, 12)}`
  }

  let name = ''
  try {
    name = window.localStorage.getItem(DEVICE_NAME_KEY) ?? ''
  } catch {
    // ignore
  }
  return { deviceId, name: name || defaultDeviceName(), platform: detectPlatform() }
}

/** Persists a custom label for this device ("Desk PC", "Phone"). */
export function setDeviceName(name: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEVICE_NAME_KEY, name.trim().slice(0, 80))
  } catch {
    // ignore
  }
}

function defaultDeviceName(): string {
  const platform = detectPlatform()
  if (platform === 'android') return 'Android device'
  if (platform === 'windows') return 'Desktop app'
  return 'Browser'
}

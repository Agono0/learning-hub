'use client'

/**
 * Tier 2 accessibility watcher bridge (M2-12) — webview side of the
 * non-owner Max Focus fallback on Android.
 *
 * PRIVACY LAW (mirrored in MaxFocusDisclosures.tsx and the service config):
 * the service reads window-TRANSITION events only — package names, never
 * screen content (`canRetrieveWindowContent="false"`). The watch state is
 * session-scoped and always cleared at session end.
 */
import { isTauri } from '@/lib/transport'

/** Result of arming/disarming the watcher. */
export interface WatchStateResult {
  /** Whether the state was written (the session is armed). */
  active: boolean
  /** Whether the accessibility service is currently enabled in system settings. */
  watcherConnected: boolean
}

/** True on a native Android shell — Tier 2 applies there only. */
export function accessibilityWatcherSupported(): boolean {
  return isTauri && typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

/**
 * Arm/disarm the watcher for the current session. Always clear at session
 * end (`active: false`) — the service is inert unless armed.
 */
export async function setAccessibilityWatchState(
  active: boolean,
  packages: string[],
): Promise<WatchStateResult | null> {
  if (!accessibilityWatcherSupported()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<WatchStateResult>('focus_android_set_watch_state', { active, packages })
  } catch {
    return null
  }
}

/**
 * Open the system accessibility settings so the user can grant the watcher.
 * Show the disclosure (MaxFocusDisclosures) BEFORE calling this — store
 * policy requires informed consent, and it is simply the honest thing to do.
 */
export async function openAccessibilitySettings(): Promise<boolean | null> {
  if (!accessibilityWatcherSupported()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('focus_android_open_accessibility_settings')
    return true
  } catch {
    return false
  }
}

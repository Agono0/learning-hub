'use client'

/**
 * Lock Task Mode bridge (M2-11) — the webview side of Max Focus Tier 1.
 *
 * Lock Task pins the Android foreground to the session's allowlisted packages
 * (the strongest tier, Device Owner only — provisioning is M2-10's ADB flow).
 * Tier 2 devices (not owner) fall back to the AccessibilityService watcher
 * (M2-12); the native side rejects Tier-1 commands there and the UI shows the
 * fallback path, so this wrapper returns `null` instead of throwing.
 *
 * Consent/policy notes: the allowlist comes from the session (the user chose
 * it before start); the emergency dialer package MUST be part of it (M2-15's
 * SYSTEM_ALLOWED_APPS validation runs on the web side before this call).
 */
import { isTauri } from '@/lib/transport'

/** Result of a successful pin (the active allowlist, echoed back). */
export interface LockTaskStartResult {
  active: true
  packages: string[]
}

/** True on a native Android shell — Tier 1 applies there only. */
export function lockTaskSupported(): boolean {
  return isTauri && typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

/**
 * Pin the foreground to `packages` (Device Owner only — the native side
 * rejects otherwise). `null` off-Android, for non-owner devices, or on
 * failure; callers route to the Tier 2 fallback instead of retrying.
 */
export async function startLockTask(packages: string[]): Promise<LockTaskStartResult | null> {
  if (!lockTaskSupported() || packages.length === 0) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<LockTaskStartResult>('focus_android_start_lock_task', { packages })
  } catch {
    return null
  }
}

/**
 * Unpin the foreground (session end / emergency exit). Idempotent; `null`
 * only off-Android.
 */
export async function stopLockTask(): Promise<boolean | null> {
  if (!lockTaskSupported()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('focus_android_stop_lock_task')
    return true
  } catch {
    return false
  }
}

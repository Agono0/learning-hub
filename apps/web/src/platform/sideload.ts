'use client'

/**
 * Android sideload install bridge (O1-13) — the webview-side wrapper around
 * the `MaxUpdatePlugin` Kotlin plugin (PackageInstaller) and its Rust
 * commands (`update_android_device_info`, `update_install_android_apk`).
 *
 * Mirrors `platform/haptics.ts`: dynamic `@tauri-apps/api/core` import behind
 * `isTauri`, null/no-op on plain web (sideload cannot exist there), and every
 * native error resolves to `null` so the UI renders an honest retry state
 * instead of crashing the update flow.
 *
 * Consent contract (docs/updates.md §"Android sideload consent flow"):
 * `installSideloadApk` NEVER installs silently — the native side opens the
 * system "install unknown apps" screen and reports `{ consentRequired: true }`
 * when the grant is missing, and `{ committed: true }` once the
 * PackageInstaller session is committed (the system installer dialog is the
 * final consent stage).
 */
import { isTauri } from '@/lib/transport'

/** Facts the consent UI needs: what APK fits, and whether installs are allowed. */
export interface AndroidDeviceInfo {
  /** Device's primary ABI, e.g. `arm64-v8a` (per-ABI APK pick). */
  abi: string
  /** Android SDK level. */
  sdkInt: number
  /** Whether the per-app "install unknown apps" grant is already given. */
  canInstall: boolean
}

/** Result of an install attempt (see the consent contract above). */
export interface SideloadInstallResult {
  /** True when the system consent screen was opened — re-tap after granting. */
  consentRequired?: boolean
  /** True when the PackageInstaller session was committed (system dialog next). */
  committed?: boolean
  /** PackageInstaller session id (for status correlation). */
  sessionId?: number
}

/** True on a native Android shell — the only host where sideload applies. */
export function sideloadSupported(): boolean {
  return isTauri && typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

/**
 * Ask the native layer for device facts (ABI + consent state), or `null` when
 * not on Android / the shell predates the plugin.
 */
export async function androidDeviceInfo(): Promise<AndroidDeviceInfo | null> {
  if (!sideloadSupported()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<AndroidDeviceInfo>('update_android_device_info')
  } catch {
    return null
  }
}

/**
 * Install the downloaded, sha256-verified per-ABI APK. See the consent
 * contract above; returns `null` on unsupported hosts or native failure
 * (callers show a retry, not a crash).
 */
export async function installSideloadApk(apkPath: string): Promise<SideloadInstallResult | null> {
  if (!sideloadSupported()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<SideloadInstallResult>('update_install_android_apk', { apkPath })
  } catch {
    return null
  }
}

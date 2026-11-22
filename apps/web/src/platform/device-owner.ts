'use client'

/**
 * Device Owner provisioning bridge (M2-10) — the webview side of Max Focus
 * Tier 1 on Android.
 *
 * Provisioning CANNOT happen from the app: `dpm set-device-owner` runs over
 * ADB from a computer, on a device with no accounts. The setup wizard shows
 * the EXACT command ({@link DEVICE_OWNER_ADB_COMMAND}) with a copy button,
 * and {@link deviceOwnerStatus} reports whether the device is already
 * provisioned (via the `max-focus-android` Kotlin plugin, registered in
 * lib.rs). Tier 1 enables Lock Task Mode (M2-11) and silent install sessions
 * — see docs/LIMITATIONS.md §"Android: no silent installs without Device
 * Owner".
 */
import { isTauri } from '@/lib/transport'

/**
 * The exact one-time provisioning command, verbatim — the wizard renders this
 * so the user can copy it to their computer's terminal.
 */
export const DEVICE_OWNER_ADB_COMMAND =
  'adb shell dpm set-device-owner dev.learninghub.app/dev.learninghub.app.MaxDeviceAdminReceiver'

/** Reported by the native layer ({@link deviceOwnerStatus}). */
export interface DeviceOwnerStatus {
  /** App package name (sanity echo). */
  packageName: string
  /** True when Learning HUB is Device Owner on this device (Tier 1 live). */
  isDeviceOwner: boolean
  /** True when Lock Task Mode is permitted (implies owner; M2-11). */
  isLockTaskPermitted: boolean
}

/** True on a native Android shell — the only host where provisioning applies. */
export function deviceOwnerProvisioningSupported(): boolean {
  return isTauri && typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

/**
 * Ask the native layer whether the device is already provisioned. Returns
 * `null` off-Android or when the shell predates the plugin — the wizard then
 * shows the command with an unknown-state note, never a false "provisioned".
 */
export async function deviceOwnerStatus(): Promise<DeviceOwnerStatus | null> {
  if (!deviceOwnerProvisioningSupported()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<DeviceOwnerStatus>('focus_android_provision_status')
  } catch {
    return null
  }
}

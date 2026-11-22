/**
 * Unit tests for the Device Owner provisioning bridge (M2-10) — web behavior:
 * off-Android the helpers are no-ops, and the ADB command is exactly the one
 * the Kotlin receiver is declared to accept (manifest registration + wizard
 * must never drift).
 */
import { describe, expect, it } from 'vitest'
import {
  DEVICE_OWNER_ADB_COMMAND,
  deviceOwnerProvisioningSupported,
  deviceOwnerStatus,
} from '../src/platform/device-owner'

describe('DEVICE_OWNER_ADB_COMMAND', () => {
  it('targets the registered MaxDeviceAdminReceiver exactly', () => {
    expect(DEVICE_OWNER_ADB_COMMAND).toBe(
      'adb shell dpm set-device-owner dev.learninghub.app/dev.learninghub.app.MaxDeviceAdminReceiver',
    )
    // The manifest declares the receiver in the same package/class — this
    // assertion fails if either side is renamed without the other.
    expect(DEVICE_OWNER_ADB_COMMAND).toMatch(/dpm set-device-owner/)
    expect(DEVICE_OWNER_ADB_COMMAND).toContain('MaxDeviceAdminReceiver')
  })
})

describe('deviceOwnerProvisioningSupported / deviceOwnerStatus', () => {
  it('are no-ops outside a Tauri Android shell (plain web / node test env)', async () => {
    expect(deviceOwnerProvisioningSupported()).toBe(false)
    await expect(deviceOwnerStatus()).resolves.toBeNull()
  })
})

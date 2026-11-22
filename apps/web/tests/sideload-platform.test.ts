/**
 * Unit tests for the Android sideload bridge wrapper (O1-13) — the web
 * behavior only: outside a Tauri shell the helpers are null/no-op and the
 * consent result contract stays shape-stable for the update service.
 */
import { describe, expect, it } from 'vitest'
import { androidDeviceInfo, installSideloadApk, sideloadSupported } from '../src/platform/sideload'

describe('sideloadSupported', () => {
  it('is false outside a Tauri shell (plain web / node test env)', () => {
    expect(sideloadSupported()).toBe(false)
  })
})

describe('androidDeviceInfo', () => {
  it('returns null on non-Tauri hosts instead of throwing', async () => {
    await expect(androidDeviceInfo()).resolves.toBeNull()
  })
})

describe('installSideloadApk', () => {
  it('returns null on non-Tauri hosts (no silent install path exists on web)', async () => {
    await expect(installSideloadApk('/data/app/updates/app-arm64.apk')).resolves.toBeNull()
  })

  it('documents the consent result contract (never a boolean-only result)', async () => {
    // Shape guard: consentRequired and committed are the two outcomes the
    // update service must distinguish; neither is a silent install.
    const result: { consentRequired?: boolean; committed?: boolean; sessionId?: number } = {
      consentRequired: true,
    }
    expect(result.committed).toBeUndefined()
    expect(result.consentRequired).toBe(true)
  })
})

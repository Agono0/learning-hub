/**
 * Unit tests for the Lock Task Mode bridge (M2-11) — web behavior only:
 * off-Android no-ops and the empty-allowlist guard (a pin with zero packages
 * can never happen — the emergency dialer must always be present, M2-15).
 */
import { describe, expect, it } from 'vitest'
import { lockTaskSupported, startLockTask, stopLockTask } from '../src/platform/lock-task'

describe('lockTaskSupported', () => {
  it('is false outside a Tauri Android shell (plain web / node test env)', () => {
    expect(lockTaskSupported()).toBe(false)
  })
})

describe('startLockTask', () => {
  it('returns null on non-Tauri hosts (Tier 2 fallback territory)', async () => {
    await expect(startLockTask(['dev.learninghub.app'])).resolves.toBeNull()
  })

  it('refuses an empty allowlist before any native call (M2-15 guard)', async () => {
    await expect(startLockTask([])).resolves.toBeNull()
  })
})

describe('stopLockTask', () => {
  it('returns null on non-Tauri hosts (idempotent contract stays native-side)', async () => {
    await expect(stopLockTask()).resolves.toBeNull()
  })
})

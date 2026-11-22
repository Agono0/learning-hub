/**
 * Unit tests for the build-time update-flavor flag (O1-12).
 *
 * Covers the pure resolver (`resolveUpdateState`) and the module-level baked
 * constants (`UPDATE_BUILD_FLAVOR`, `SELF_UPDATE_ENABLED`) both ways:
 * - `LH_UPDATE_CHANNEL=play` → store flavor, self-update OFF (Play policy).
 * - any release channel / unset / unknown → self-update ON (sideload default).
 *
 * The module-level cases stub `process.env.LH_UPDATE_CHANNEL` and re-import
 * the module fresh — the same code path the Next build inlines at bundle time.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveUpdateState,
  SELF_UPDATE_ENABLED,
  UPDATE_BUILD_FLAVOR,
  type UpdateBuildFlavor,
} from '../src/lib/updates'

describe('resolveUpdateState (flag reader)', () => {
  it('play disables self-update — exact, case-insensitive, trimmed', () => {
    expect(resolveUpdateState('play')).toEqual({ flavor: 'play', selfUpdateEnabled: false })
    expect(resolveUpdateState('PLAY')).toEqual({ flavor: 'play', selfUpdateEnabled: false })
    expect(resolveUpdateState('  Play  ')).toEqual({ flavor: 'play', selfUpdateEnabled: false })
  })

  it('release channels keep self-update on', () => {
    expect(resolveUpdateState('nightly')).toEqual({ flavor: 'nightly', selfUpdateEnabled: true })
    expect(resolveUpdateState('Beta')).toEqual({ flavor: 'beta', selfUpdateEnabled: true })
    expect(resolveUpdateState(' STABLE ')).toEqual({ flavor: 'stable', selfUpdateEnabled: true })
  })

  it('unset / empty / whitespace falls back to nightly with self-update on', () => {
    expect(resolveUpdateState(undefined)).toEqual({ flavor: 'nightly', selfUpdateEnabled: true })
    expect(resolveUpdateState(null)).toEqual({ flavor: 'nightly', selfUpdateEnabled: true })
    expect(resolveUpdateState('')).toEqual({ flavor: 'nightly', selfUpdateEnabled: true })
    expect(resolveUpdateState('   ')).toEqual({ flavor: 'nightly', selfUpdateEnabled: true })
  })

  it('unknown values fall back to nightly with self-update on (never disables)', () => {
    expect(resolveUpdateState('canary')).toEqual({ flavor: 'nightly', selfUpdateEnabled: true })
    expect(resolveUpdateState('production')).toEqual({ flavor: 'nightly', selfUpdateEnabled: true })
    expect(resolveUpdateState('playful')).toEqual({ flavor: 'nightly', selfUpdateEnabled: true })
  })

  it('is total: non-string junk never throws', () => {
    expect(resolveUpdateState(42 as unknown as string)).toEqual({
      flavor: 'nightly',
      selfUpdateEnabled: true,
    })
    expect(resolveUpdateState({} as unknown as string)).toEqual({
      flavor: 'nightly',
      selfUpdateEnabled: true,
    })
  })
})

describe('module-level baked constants (import-time env read)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('play build bakes self-update OFF at import time', async () => {
    vi.resetModules()
    vi.stubEnv('LH_UPDATE_CHANNEL', 'play')
    const mod = await import('../src/lib/updates')
    expect(mod.UPDATE_BUILD_FLAVOR).toBe('play')
    expect(mod.SELF_UPDATE_ENABLED).toBe(false)
  })

  it('nightly build bakes self-update ON at import time', async () => {
    vi.resetModules()
    vi.stubEnv('LH_UPDATE_CHANNEL', 'nightly')
    const mod = await import('../src/lib/updates')
    expect(mod.UPDATE_BUILD_FLAVOR).toBe('nightly')
    expect(mod.SELF_UPDATE_ENABLED).toBe(true)
  })

  it('unset env bakes the sideload default (nightly, self-update ON)', async () => {
    vi.resetModules()
    vi.stubEnv('LH_UPDATE_CHANNEL', '')
    const mod = await import('../src/lib/updates')
    expect(mod.UPDATE_BUILD_FLAVOR).toBe('nightly')
    expect(mod.SELF_UPDATE_ENABLED).toBe(true)
  })

  it('statically imported constants are internally consistent in this test env', () => {
    const flavors: UpdateBuildFlavor[] = ['nightly', 'beta', 'stable', 'play']
    expect(flavors).toContain(UPDATE_BUILD_FLAVOR)
    expect(SELF_UPDATE_ENABLED).toBe(UPDATE_BUILD_FLAVOR !== 'play')
  })
})

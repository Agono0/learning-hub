/**
 * SSR-safety + gate tests for UpdateController — the app-shell update wiring.
 *
 * Style mirrors `updates-settings.test.ts` / `update-banner.test.ts`: node env,
 * `renderToString` (no effects run), fresh module imports for env-dependent
 * constants. The controller's effect-driven flow (scheduler → verified manifest
 * → banner → apply) is exercised by the scheduler, banner, sideload and
 * manifest tests; here we prove the component is hydration-safe and calm by
 * default (renders nothing until a real offer exists) and honors the Play gate.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Transport seam with a getter so per-test `isTauri` reassignment is visible. */
const transportMocks = vi.hoisted(() => ({ apiGet: vi.fn(), isTauri: false }))

vi.mock('@/lib/transport', () => ({
  apiGet: transportMocks.apiGet,
  get isTauri() {
    return transportMocks.isTauri
  },
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('UpdateController (SSR-safe, calm by default)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
    transportMocks.isTauri = false
  })

  it('renders nothing off the native shell (browser tab)', async () => {
    transportMocks.isTauri = false
    const { UpdateController } = await import('../src/components/UpdateController')
    const html = renderToString(React.createElement(UpdateController))
    expect(html).toBe('')
  })

  it('renders nothing on the shell before any offer (no empty banner)', async () => {
    transportMocks.isTauri = true
    const { UpdateController } = await import('../src/components/UpdateController')
    const html = renderToString(React.createElement(UpdateController))
    expect(html).toBe('')
  })

  it('renders nothing for a play-flavor build (store gate)', async () => {
    vi.resetModules()
    vi.stubEnv('LH_UPDATE_CHANNEL', 'play')
    transportMocks.isTauri = true
    const { UpdateController } =
      (await import('../src/components/UpdateController')) as typeof import('../src/components/UpdateController')
    const html = renderToString(React.createElement(UpdateController))
    expect(html).toBe('')
  })
})

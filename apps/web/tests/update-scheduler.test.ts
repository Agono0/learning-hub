/**
 * Unit tests for the update check scheduler (O1-25).
 *
 * Covers the scheduling policy and the client service around it:
 * - `decideUpdateCheck` — the pure verdict: play gate first, then Wi-Fi-only
 *   (only a *known* metered connection defers the cheap pointer check), then
 *   the interval (missing/invalid `lastCheckedAt` counts as never checked).
 * - `isConnectionUnmetered` — the Network Information API probe: wifi/
 *   ethernet → unmetered, cellular/`saveData` → metered, unknown → `null`.
 * - `checkForUpdate` — pointer fetch through the transport seam, core
 *   `compareVersions` verdict, `lastCheckedAt` persisted only on success.
 * - `requestUpdateDownload` — the apply-path gates (play, shell, metered)
 *   before the `update_download_file` Tauri command is invoked.
 * - `startUpdateCheckScheduler` / stop — single-instance loop honoring the
 *   same decision (fake timers, injected check), and a play build never
 *   starts one at all.
 *
 * Style mirrors `update-channel-flag.test.ts` / `updates-settings.test.ts`:
 * node env, stubbed globals, fresh module imports for env-dependent constants.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSettingsSchema, type UpdateSettings } from '@learning-hub/core/update'
import {
  broadcastUpdateOffer,
  checkForUpdate,
  decideUpdateCheck,
  isConnectionUnmetered,
  onUpdateOffer,
  requestUpdateDownload,
  startUpdateCheckScheduler,
  stopUpdateCheckScheduler,
  type UpdateCheckResult,
} from '../src/lib/updates'

/** Transport seam: every test controls what the pointer fetch returns, and
 * `isTauri` is exposed through a GETTER so per-test reassignment is visible
 * to the module under test (a factory-copied primitive freezes at the
 * import-time value — CI showed `native-shell-required` where the test set
 * `isTauri = true`). */
const transportMocks = vi.hoisted(() => ({ apiGet: vi.fn(), isTauri: false }))

vi.mock('@/lib/transport', () => ({
  apiGet: transportMocks.apiGet,
  get isTauri() {
    return transportMocks.isTauri
  },
}))

/** Tauri command seam for the download path. */
const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

/** Calm defaults straight from the core schema (6h interval, wifi-only on). */
const DEFAULTS: UpdateSettings = updateSettingsSchema.parse({})

/** Hour in ms — keeps the interval arithmetic readable below. */
const HOUR_MS = 60 * 60 * 1000

/**
 * Import the module FRESH with `LH_APP_VERSION` applied: `APP_VERSION` is a
 * module-level constant, so `vi.stubEnv` on a statically imported module
 * can never change the verdict (CI: 'up-to-date' where 'available' was
 * expected). The `@/lib/transport` mock applies to fresh imports too.
 */
async function freshUpdates(): Promise<typeof import('../src/lib/updates')> {
  vi.resetModules()
  return (await import('../src/lib/updates')) as typeof import('../src/lib/updates')
}

describe('decideUpdateCheck (pure scheduling policy)', () => {
  it('runs when never checked before (no lastCheckedAt)', () => {
    const d = decideUpdateCheck({ settings: DEFAULTS, nowMs: 1_000, unmetered: true })
    expect(d).toEqual({ shouldCheck: true, reason: 'due' })
  })

  it('defers while the interval has not elapsed', () => {
    const d = decideUpdateCheck({
      settings: DEFAULTS,
      nowMs: 10 * HOUR_MS,
      lastCheckedAt: new Date(9 * HOUR_MS).toISOString(),
      unmetered: true,
    })
    expect(d).toEqual({ shouldCheck: false, reason: 'not-due' })
  })

  it('is due again the moment the interval has fully elapsed', () => {
    const d = decideUpdateCheck({
      settings: DEFAULTS,
      nowMs: 16 * HOUR_MS,
      lastCheckedAt: new Date(10 * HOUR_MS).toISOString(),
      unmetered: true,
    })
    expect(d).toEqual({ shouldCheck: true, reason: 'due' })
  })

  it('treats an unparsable lastCheckedAt as never checked', () => {
    const d = decideUpdateCheck({
      settings: DEFAULTS,
      nowMs: 1_000,
      lastCheckedAt: 'not-a-date',
      unmetered: true,
    })
    expect(d).toEqual({ shouldCheck: true, reason: 'due' })
  })

  it('defers on a KNOWN metered connection when wifi-only is on', () => {
    const d = decideUpdateCheck({ settings: DEFAULTS, nowMs: 1_000, unmetered: false })
    expect(d).toEqual({ shouldCheck: false, reason: 'metered-connection' })
  })

  it('allows the cheap check when the connection state is unknown (null)', () => {
    // Asymmetry by design: the pointer read is a few hundred bytes and
    // ask-first; only the byte-heavy download defers on unknown networks.
    const d = decideUpdateCheck({ settings: DEFAULTS, nowMs: 1_000, unmetered: null })
    expect(d).toEqual({ shouldCheck: true, reason: 'due' })
  })

  it('ignores the metered gate when wifi-only is off', () => {
    const settings = updateSettingsSchema.parse({ ...DEFAULTS, wifiOnly: false })
    const d = decideUpdateCheck({ settings, nowMs: 1_000, unmetered: false })
    expect(d).toEqual({ shouldCheck: true, reason: 'due' })
  })
})

describe('isConnectionUnmetered (Network Information API probe)', () => {
  // The probe takes an INJECTED host (`{ connection }`) instead of relying
  // on global-navigator stubbing — `vi.stubGlobal('navigator', …)` is
  // unreliable in the node env (CI: probe returned `null` for every stubbed
  // shape), and injection keeps the matrix deterministic on every runner.

  it('wifi and ethernet are unmetered', () => {
    expect(isConnectionUnmetered({ connection: { type: 'wifi' } })).toBe(true)
    expect(isConnectionUnmetered({ connection: { type: 'ethernet' } })).toBe(true)
  })

  it('cellular is metered', () => {
    expect(isConnectionUnmetered({ connection: { type: 'cellular' } })).toBe(false)
  })

  it('saveData outranks the type — the user asked the browser to save data', () => {
    expect(isConnectionUnmetered({ connection: { type: 'wifi', saveData: true } })).toBe(false)
  })

  it('missing type is unknown, not a guess', () => {
    expect(isConnectionUnmetered({ connection: {} })).toBeNull()
    expect(isConnectionUnmetered({})).toBeNull()
  })

  it('no host at all (SSR / webview without the API) is unknown', () => {
    // Explicit undefined falls back to the real global — in the node env the
    // global navigator (when present at all) has no `connection`, so the
    // honest answer is `null` on every CI runner.
    expect(isConnectionUnmetered(undefined)).toBeNull()
    expect(isConnectionUnmetered()).toBeNull()
  })
})

describe('checkForUpdate (pointer fetch + version verdict)', () => {
  beforeEach(() => {
    transportMocks.apiGet.mockReset()
  })

  it('reports up-to-date when the pointer version matches the build', async () => {
    vi.stubEnv('LH_APP_VERSION', '1.0.0')
    transportMocks.apiGet.mockResolvedValue({ version: '1.0.0', publishedAt: '', notes: null })
    const { checkForUpdate: fresh } = await freshUpdates()
    const result = await fresh()
    expect(result.status).toBe('up-to-date')
    expect(result.pointerVersion).toBe('1.0.0')
    expect(result.offer).toBeNull()
    expect(transportMocks.apiGet).toHaveBeenCalledWith('/api/update/notes', { channel: 'nightly' })
    vi.unstubAllEnvs()
  })

  it('reports available with an offer when the channel moved ahead', async () => {
    vi.stubEnv('LH_APP_VERSION', '1.0.0')
    transportMocks.apiGet.mockResolvedValue({ version: '2.0.0', publishedAt: '', notes: 'fixes' })
    const { checkForUpdate: fresh } = await freshUpdates()
    const result = await fresh()
    expect(result.status).toBe('available')
    expect(result.offer).toEqual({ version: '2.0.0', notes: 'fixes', manifestUrl: null })
    vi.unstubAllEnvs()
  })

  it('honors a channel override over the stored setting', async () => {
    transportMocks.apiGet.mockResolvedValue({ version: '1.0.0', publishedAt: '', notes: null })
    await checkForUpdate({ channel: 'beta' })
    expect(transportMocks.apiGet).toHaveBeenCalledWith('/api/update/notes', { channel: 'beta' })
  })

  it('dev builds (empty APP_VERSION) never self-offer', async () => {
    vi.stubEnv('LH_APP_VERSION', '')
    transportMocks.apiGet.mockResolvedValue({ version: '9.9.9', publishedAt: '', notes: null })
    const { checkForUpdate: fresh } = await freshUpdates()
    const result = await fresh()
    expect(result.status).toBe('up-to-date')
    vi.unstubAllEnvs()
  })

  it('reports unavailable and does NOT reset the cadence when the pointer fails', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage })
    transportMocks.apiGet.mockResolvedValue(null)
    const result = await checkForUpdate()
    expect(result.status).toBe('unavailable')
    expect(result.reason).toBe('pointer-unavailable')
    // A failed check must not write lastCheckedAt (the interval keeps running).
    expect(store.has('lh-update-settings')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('persists lastCheckedAt on a successful pointer read', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage })
    transportMocks.apiGet.mockResolvedValue({ version: '1.0.0', publishedAt: '', notes: null })
    await checkForUpdate({ nowMs: 1_700_000_000_000 })
    const written = JSON.parse(store.get('lh-update-settings') ?? '{}') as {
      lastCheckedAt?: string
    }
    expect(written.lastCheckedAt).toBe(new Date(1_700_000_000_000).toISOString())
    vi.unstubAllGlobals()
  })
})

describe('requestUpdateDownload (apply-path gates + Tauri invoke)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    invokeMock.mockReset()
  })

  const FILE = {
    url: 'https://example.test/full.nsis.zip',
    dest: 'updates/full.nsis.zip',
    total: 1024,
    expectedSha256: 'ab'.repeat(32),
  }

  it('never starts off the native shell (plain browser tab)', async () => {
    transportMocks.isTauri = false
    const result = await requestUpdateDownload(FILE)
    expect(result).toEqual({ started: false, reason: 'native-shell-required' })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('defers on an unknown connection when wifi-only is on (the heavy transfer)', async () => {
    transportMocks.isTauri = true
    // Injected `null` = unknown: the byte-heavy transfer defers even though
    // the cheap pointer check would have been allowed.
    const result = await requestUpdateDownload(FILE, { unmetered: null })
    expect(result).toEqual({ started: false, reason: 'metered-connection' })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('also defers on a KNOWN metered connection', async () => {
    transportMocks.isTauri = true
    const result = await requestUpdateDownload(FILE, { unmetered: false })
    expect(result).toEqual({ started: false, reason: 'metered-connection' })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('invokes update_download_file when unmetered and in the shell', async () => {
    transportMocks.isTauri = true
    invokeMock.mockResolvedValue(undefined)
    const result = await requestUpdateDownload(FILE, { unmetered: true })
    expect(result).toEqual({ started: true })
    expect(invokeMock).toHaveBeenCalledWith('update_download_file', {
      url: FILE.url,
      dest: FILE.dest,
      total: FILE.total,
      expectedSha256: FILE.expectedSha256,
    })
  })

  it('maps a native download failure to an honest, non-crashing result', async () => {
    transportMocks.isTauri = true
    invokeMock.mockRejectedValue(new Error('sha mismatch'))
    const result = await requestUpdateDownload(FILE, { unmetered: true })
    expect(result).toEqual({ started: false, reason: 'download-failed' })
  })

  it('without an injected probe it defers in the node env (unknown connection)', async () => {
    // No navigator.connection in the node env → the real probe returns null
    // → the heavy transfer defers (wifi-only defaults on).
    transportMocks.isTauri = true
    const result = await requestUpdateDownload(FILE)
    expect(result).toEqual({ started: false, reason: 'metered-connection' })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('play builds never invoke the updater, whatever the connection', async () => {
    vi.resetModules()
    vi.stubEnv('LH_UPDATE_CHANNEL', 'play')
    const mod = (await import('../src/lib/updates')) as typeof import('../src/lib/updates')
    transportMocks.isTauri = true
    const result = await mod.requestUpdateDownload(FILE, { unmetered: true })
    expect(result).toEqual({ started: false, reason: 'self-update-disabled' })
    expect(invokeMock).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    vi.resetModules()
  })
})

describe('startUpdateCheckScheduler (background loop)', () => {
  /** A done-nothing check result reused by the spy below. */
  const UP_TO_DATE: UpdateCheckResult = {
    status: 'up-to-date',
    pointerVersion: '1.0.0',
    offer: null,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    stopUpdateCheckScheduler()
  })

  afterEach(() => {
    stopUpdateCheckScheduler()
    vi.useRealTimers()
  })

  it('checks immediately on start, then honors the poll cadence', async () => {
    const check = vi.fn(async () => UP_TO_DATE)
    const onResult = vi.fn()
    startUpdateCheckScheduler({ pollIntervalMs: HOUR_MS, checkOverride: check, onResult })
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(UP_TO_DATE)
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('stops cleanly (idempotent) and never checks again', async () => {
    const check = vi.fn(async () => UP_TO_DATE)
    const stop = startUpdateCheckScheduler({ pollIntervalMs: HOUR_MS, checkOverride: check })
    await vi.advanceTimersByTimeAsync(0)
    stop()
    stop()
    await vi.advanceTimersByTimeAsync(5 * HOUR_MS)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('reports an offer when a tick finds a newer version', async () => {
    const offer = { version: '2.0.0', notes: null, manifestUrl: null }
    const check = vi.fn(async (): Promise<UpdateCheckResult> => ({
      status: 'available',
      pointerVersion: '2.0.0',
      offer,
    }))
    const onOffer = vi.fn()
    startUpdateCheckScheduler({ pollIntervalMs: HOUR_MS, checkOverride: check, onOffer })
    await vi.advanceTimersByTimeAsync(0)
    expect(onOffer).toHaveBeenCalledWith(offer)
  })

  it('defers every tick on a known metered connection (wifi-only default)', async () => {
    const check = vi.fn(async () => UP_TO_DATE)
    startUpdateCheckScheduler({
      pollIntervalMs: HOUR_MS,
      checkOverride: check,
      unmeteredOverride: false,
    })
    await vi.advanceTimersByTimeAsync(3 * HOUR_MS)
    expect(check).not.toHaveBeenCalled()
  })

  it('swallows a failing check and keeps the loop alive', async () => {
    const check = vi.fn(async () => {
      throw new Error('network down')
    })
    startUpdateCheckScheduler({ pollIntervalMs: HOUR_MS, checkOverride: check })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(check).toHaveBeenCalledTimes(2) // retried on cadence, never crashed
  })

  it('a play build never starts a loop at all', async () => {
    vi.resetModules()
    vi.stubEnv('LH_UPDATE_CHANNEL', 'play')
    const mod = (await import('../src/lib/updates')) as typeof import('../src/lib/updates')
    const check = vi.fn(async () => UP_TO_DATE)
    const stop = mod.startUpdateCheckScheduler({ pollIntervalMs: HOUR_MS, checkOverride: check })
    await vi.advanceTimersByTimeAsync(2 * HOUR_MS)
    expect(check).not.toHaveBeenCalled()
    stop()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('a second start replaces the first loop (single instance)', async () => {
    const first = vi.fn(async () => UP_TO_DATE)
    const second = vi.fn(async () => UP_TO_DATE)
    startUpdateCheckScheduler({ pollIntervalMs: HOUR_MS, checkOverride: first })
    // The immediate tick of the first loop already ran (synchronously); from
    // here on only the second loop's ticks may fire.
    startUpdateCheckScheduler({ pollIntervalMs: HOUR_MS, checkOverride: second })
    await vi.advanceTimersByTimeAsync(2 * HOUR_MS)
    expect(first).toHaveBeenCalledTimes(1) // its immediate tick, nothing after
    expect(second).toHaveBeenCalledTimes(3) // immediate + two cadence ticks
    stopUpdateCheckScheduler()
  })
})

describe('update offer broadcast bus (onUpdateOffer / broadcastUpdateOffer)', () => {
  it('notifies subscribers of broadcast offers', () => {
    const received: string[] = []
    const unsub = onUpdateOffer((offer) => {
      received.push(offer.version)
    })
    broadcastUpdateOffer({
      version: '20261123-abc1234',
      notes: 'New build',
      manifestUrl: 'https://example.com/manifest.json',
    })
    expect(received).toEqual(['20261123-abc1234'])
    unsub()
  })

  it('unsubscribing stops notifications', () => {
    const received: string[] = []
    const unsub = onUpdateOffer((offer) => {
      received.push(offer.version)
    })
    unsub()
    broadcastUpdateOffer({
      version: '20261123-abc1234',
      notes: 'New build',
      manifestUrl: 'https://example.com/manifest.json',
    })
    expect(received).toEqual([])
  })

  it('an error in one listener does not prevent other listeners from being called', () => {
    const received: string[] = []
    const unsub1 = onUpdateOffer(() => {
      throw new Error('boom')
    })
    const unsub2 = onUpdateOffer((offer) => {
      received.push(offer.version)
    })
    broadcastUpdateOffer({
      version: '20261123-abc1234',
      notes: 'New build',
      manifestUrl: 'https://example.com/manifest.json',
    })
    expect(received).toEqual(['20261123-abc1234'])
    unsub1()
    unsub2()
  })
})

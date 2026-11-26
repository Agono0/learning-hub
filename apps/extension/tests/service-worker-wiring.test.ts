/**
 * Real service-worker wiring with a mocked chrome: the worker module is imported, its alarm
 * listener is fired, and the real storage / declarativeNetRequest / fetch paths run. Synthetic
 * token and fixed clock; no real browser profile and no network (fetch is a local stub).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signLockProof } from '@learning-hub/core/focus-lock'

const TOKEN = 'synthetic-pairing-token-not-a-real-secret'
const NOW = Date.parse('2026-11-26T00:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

type Listener = (...a: unknown[]) => unknown
let store: Record<string, unknown>
let dynamicRules: Array<{ id: number }>
let alarmListener: Listener
let webCalls = 0
const updates: Array<{ removeRuleIds: number[]; addRules: unknown[] }> = []

function installChrome() {
  const noop = { addListener: () => {} }
  ;(globalThis as Record<string, unknown>).chrome = {
    runtime: {
      onInstalled: noop,
      onStartup: noop,
      getURL: (p: string) => `chrome-extension://x/${p}`,
      id: 'x',
    },
    contextMenus: undefined,
    alarms: { create: () => {}, onAlarm: { addListener: (l: Listener) => (alarmListener = l) } },
    tabs: { onUpdated: noop },
    webNavigation: undefined,
    storage: {
      local: {
        get: async () => ({ ...store }),
        set: async (p: Record<string, unknown>) => void Object.assign(store, p),
      },
    },
    declarativeNetRequest: {
      getDynamicRules: async () => dynamicRules,
      updateDynamicRules: async (u: {
        removeRuleIds: number[]
        addRules: Array<{ id: number }>
      }) => {
        updates.push(u as never)
        dynamicRules = u.addRules
      },
    },
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}
const fire = async () => {
  alarmListener({ name: 'lh-focus-poll' })
  await flush()
}

async function load(web: (url: string) => Response | Promise<Response>) {
  vi.resetModules()
  installChrome()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const u = String(input)
    if (u.startsWith('http://127.0.0.1')) throw new Error('loopback down')
    webCalls++
    return web(u)
  })
  await import('../src/service-worker')
}

beforeEach(() => {
  store = {}
  dynamicRules = [{ id: 1 }]
  updates.length = 0
  webCalls = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('service worker + mocked chrome', () => {
  it('a forged unsigned web response changes no rules and does not touch the cache', async () => {
    store = { pairingToken: TOKEN }
    await load(
      () =>
        new Response(
          JSON.stringify({ active: true, endsAt: iso(NOW + 3_600_000), domains: ['evil.example'] }),
        ),
    )
    await fire()
    expect(webCalls).toBe(1) // the fallback really ran and its response was ignored
    expect(store.lastKnownLock).toBeUndefined()
    expect(JSON.stringify(updates)).not.toContain('evil.example')
  })

  it('a verified proof installs rules and caches the lock with provenance', async () => {
    store = { pairingToken: TOKEN }
    await load(
      async (u) =>
        new Response(
          JSON.stringify({
            proof: await signLockProof(TOKEN, {
              nonce: new URL(u).searchParams.get('nonce')!,
              nowMs: NOW,
              lock: {
                active: true,
                endsAt: iso(NOW + 3_600_000),
                hardCapAt: null,
                domains: ['a.example'],
              },
            }),
          }),
        ),
    )
    await fire()
    expect(store.lastKnownLock).toMatchObject({
      active: true,
      source: 'fallback-verified',
      domains: ['a.example'],
    })
    expect(updates.length).toBeGreaterThan(0)
    expect(JSON.stringify(updates.at(-1)?.addRules)).toContain('a.example')
  })

  it('a legacy cached lock keeps blocking offline, is stamped once and stays legacy', async () => {
    store = {
      pairingToken: TOKEN,
      lastKnownLock: { active: true, endsAt: iso(NOW + 3_600_000), domains: ['old.example'] },
    }
    await load(() => {
      throw new Error('offline')
    })
    await fire()
    expect(store.lastKnownLock).toMatchObject({ source: 'legacy', migratedAt: iso(NOW) })
    expect(JSON.stringify(updates.at(-1)?.addRules)).toContain('old.example')
    await fire()
    expect((store.lastKnownLock as { migratedAt: string }).migratedAt).toBe(iso(NOW))
  })
})

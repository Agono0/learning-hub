import { describe, expect, it, vi } from 'vitest'
import { signLockProof } from '@learning-hub/core/focus-lock'
import { runSync, readBoundedJson, type SyncDeps } from '../src/sync'
import type { ExtensionState, StoredLock } from '../src/state'

const TOKEN = 'synthetic-pairing-token-not-a-real-secret'
const NOW = Date.parse('2026-11-26T00:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const H = 3_600_000

interface Harness {
  deps: SyncDeps
  saved: StoredLock[]
  rules: string[][]
  cleared: number
  urls: string[]
}

function harness(
  state: Partial<ExtensionState>,
  web: (url: string) => Response | Promise<Response>,
  loopback: () => Response | Promise<Response> = () => {
    throw new Error('down')
  },
): Harness {
  const h: Harness = { saved: [], rules: [], cleared: 0, urls: [] } as never
  h.deps = {
    getState: async () => ({ loopbackPort: 47615, lastKnownLock: null, ...state }),
    saveLock: async (l) => void h.saved.push(l),
    applyRules: async (d) => void h.rules.push(d),
    clearRules: async () => void h.cleared++,
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = String(input)
      h.urls.push(url)
      if (url.startsWith('http://127.0.0.1')) return loopback()
      return web(url)
    }) as typeof fetch,
    now: () => NOW,
    randomBytes: (n) => new Uint8Array(n).fill(7),
    extensionId: 'test-ext',
  }
  return h
}
const nonceOf = (url: string) => new URL(url).searchParams.get('nonce') as string
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 })
const goodProof = (url: string, over = {}) =>
  signLockProof(TOKEN, {
    nonce: nonceOf(url),
    nowMs: NOW,
    lock: { active: true, endsAt: iso(NOW + H), hardCapAt: null, domains: ['a.example'], ...over },
  })
const cached = (over: Partial<StoredLock> = {}): StoredLock => ({
  active: true,
  endsAt: iso(NOW + 2 * H),
  domains: ['cached.example'],
  source: 'fallback-verified',
  ...over,
})

describe('runSync fallback orchestration', () => {
  it('installs and caches a verified fallback proof with provenance', async () => {
    const h = harness({ pairingToken: TOKEN }, async (u) => json({ proof: await goodProof(u) }))
    expect(await runSync(h.deps)).toBe('fallback-verified')
    expect(h.rules).toEqual([['a.example']])
    expect(h.saved).toEqual([
      { active: true, endsAt: iso(NOW + H), domains: ['a.example'], source: 'fallback-verified' },
    ])
  })

  it('a forged unsigned active:false does not clear an active cached lock', async () => {
    const h = harness({ pairingToken: TOKEN, lastKnownLock: cached() }, () =>
      json({ active: false, lock: { active: false, endsAt: null, domains: [] } }),
    )
    expect(await runSync(h.deps)).toBe('cache')
    expect(h.rules).toEqual([['cached.example']])
    expect(h.cleared).toBe(0)
    expect(h.saved).toEqual([])
  })

  it('a forged unsigned active:true installs nothing and does not poison the cache', async () => {
    const h = harness({ pairingToken: TOKEN }, () =>
      json({ active: true, endsAt: iso(NOW + H), domains: ['evil.example'] }),
    )
    await runSync(h.deps)
    expect(h.rules).toEqual([])
    expect(h.saved).toEqual([])
    expect(h.cleared).toBe(1)
  })

  it('rejects a proof signed with another token, for another nonce, or tampered', async () => {
    const other = await signLockProof('other-token', {
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
      nowMs: NOW,
      lock: { active: true, endsAt: iso(NOW + H), hardCapAt: null, domains: ['x.example'] },
    })
    const bad: Array<(u: string) => Promise<unknown>> = [
      async () => other,
      async () =>
        signLockProof(TOKEN, {
          nonce: 'BBBBBBBBBBBBBBBBBBBBBB',
          nowMs: NOW,
          lock: { active: true, endsAt: iso(NOW + H), hardCapAt: null, domains: ['x.example'] },
        }),
      async (u) => {
        const p = await goodProof(u)
        return { ...p, lock: { ...p.lock, domains: ['evil.example'] } }
      },
    ]
    for (const make of bad) {
      const h = harness({ pairingToken: TOKEN }, async (u) => json({ proof: await make(u) }))
      await runSync(h.deps)
      expect(h.rules).toEqual([])
      expect(h.saved).toEqual([])
    }
  })

  it('a replayed old response fails because every request uses a fresh nonce binding', async () => {
    let first: unknown = null
    const h1 = harness({ pairingToken: TOKEN }, async (u) => {
      first = await goodProof(u)
      return json({ proof: first })
    })
    await runSync(h1.deps)
    // Different nonce on the second request (random source changes) -> replay rejected.
    const h2 = harness({ pairingToken: TOKEN }, () => json({ proof: first }))
    h2.deps.randomBytes = (n) => new Uint8Array(n).fill(9)
    await runSync(h2.deps)
    expect(h2.rules).toEqual([])
    expect(h2.saved).toEqual([])
  })

  it('disables the fallback with no pairing token (no web request at all)', async () => {
    const h = harness({}, () => json({}))
    expect(await runSync(h.deps)).toBe('none')
    expect(h.urls.filter((u) => u.startsWith('http://localhost'))).toEqual([])
    expect(h.cleared).toBe(1)
  })

  it('falls through to the cache on fetch failure, and clears when there is no active cache', async () => {
    const h = harness({ pairingToken: TOKEN, lastKnownLock: cached() }, () => {
      throw new Error('offline')
    })
    expect(await runSync(h.deps)).toBe('cache')
    expect(h.rules).toEqual([['cached.example']])
    const h2 = harness(
      { pairingToken: TOKEN, lastKnownLock: cached({ endsAt: iso(NOW - 1) }) },
      () => {
        throw new Error('offline')
      },
    )
    await runSync(h2.deps)
    expect(h2.rules).toEqual([])
    expect(h2.cleared).toBe(1)
  })

  it('ignores an oversized body and a non-JSON body', async () => {
    const big = harness({ pairingToken: TOKEN }, () => new Response('x'.repeat(70 * 1024)))
    await runSync(big.deps)
    expect(big.rules).toEqual([])
    const junk = harness({ pairingToken: TOKEN }, () => new Response('<html>'))
    await runSync(junk.deps)
    expect(junk.saved).toEqual([])
  })

  it('the stream cap holds without a content-length header', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(16 * 1024))
      },
    })
    expect(await readBoundedJson(new Response(stream))).toBeNull()
  })

  it('a stale pass (a newer one started) applies nothing', async () => {
    const h = harness({ pairingToken: TOKEN }, async (u) => json({ proof: await goodProof(u) }))
    expect(await runSync(h.deps, () => false)).toBe('none')
    expect(h.rules).toEqual([])
    expect(h.saved).toEqual([])
    expect(h.cleared).toBe(0)
  })

  it('the loopback result still applies and is saved as loopback', async () => {
    const h = harness(
      { pairingToken: TOKEN },
      () => json({}),
      () => json({ active: true, endsAt: iso(NOW + H), domains: ['l.example'] }),
    )
    expect(await runSync(h.deps)).toBe('loopback')
    expect(h.saved[0]).toMatchObject({ source: 'loopback', domains: ['l.example'] })
    expect(h.urls.some((u) => u.includes('/api/focus/max'))).toBe(false)
  })

  it('never sends the token in a URL or body of the web fallback', async () => {
    const h = harness({ pairingToken: TOKEN }, async (u) => json({ proof: await goodProof(u) }))
    await runSync(h.deps)
    expect(h.urls.join(' ')).not.toContain(TOKEN)
  })
})

describe('legacy cache migration', () => {
  const legacy = (over: Partial<StoredLock> = {}): StoredLock => ({
    active: true,
    endsAt: iso(NOW + 3 * H),
    domains: ['old.example'],
    source: 'legacy',
    ...over,
  })
  const offline = () => {
    throw new Error('offline')
  }

  it('honors a legacy entry on first sight, stamps migratedAt once, and never relabels it', async () => {
    const h = harness({ lastKnownLock: legacy() }, offline)
    await runSync(h.deps)
    expect(h.rules).toEqual([['old.example']])
    expect(h.saved).toEqual([legacy({ migratedAt: iso(NOW) })])
    expect(h.saved[0].source).toBe('legacy')
  })

  it('caps the honoring window at migratedAt + 4h and never beyond the original end', async () => {
    // original end 10h away, migrated 5h ago -> window already over
    const h = harness(
      { lastKnownLock: legacy({ endsAt: iso(NOW + 10 * H), migratedAt: iso(NOW - 5 * H) }) },
      offline,
    )
    await runSync(h.deps)
    expect(h.rules).toEqual([])
    expect(h.cleared).toBe(1)
    // original end sooner than the cap -> original end wins (never extended)
    const h2 = harness(
      { lastKnownLock: legacy({ endsAt: iso(NOW - 1), migratedAt: iso(NOW - H) }) },
      offline,
    )
    await runSync(h2.deps)
    expect(h2.rules).toEqual([])
    // not restamped on a later pass
    const h3 = harness({ lastKnownLock: legacy({ migratedAt: iso(NOW - H) }) }, offline)
    await runSync(h3.deps)
    expect(h3.saved).toEqual([])
    expect(h3.rules).toEqual([['old.example']])
  })

  it('a verified result replaces the legacy entry', async () => {
    const h = harness({ pairingToken: TOKEN, lastKnownLock: legacy() }, async (u) =>
      json({ proof: await goodProof(u, { domains: ['new.example'] }) }),
    )
    await runSync(h.deps)
    expect(h.saved).toEqual([
      { active: true, endsAt: iso(NOW + H), domains: ['new.example'], source: 'fallback-verified' },
    ])
  })
})

describe('legacy persistence across restarts and failures', () => {
  const offline = () => {
    throw new Error('offline')
  }
  /** A tiny persisted store shared by several "service worker lifetimes". */
  function store(initial: StoredLock) {
    let lock: StoredLock = initial
    const run = async (now: number) => {
      const h = harness({ lastKnownLock: lock }, offline)
      h.deps.now = () => now
      h.deps.saveLock = async (l) => void (lock = l)
      await runSync(h.deps)
      return h
    }
    return { run, get: () => lock }
  }
  const base: StoredLock = {
    active: true,
    endsAt: iso(NOW + 10 * H),
    domains: ['old.example'],
    source: 'legacy',
  }

  it('first-seen survives restarts and failed fetches and expires 4h after the first sight', async () => {
    const s = store(base)
    expect((await s.run(NOW)).rules).toEqual([['old.example']])
    expect(s.get().migratedAt).toBe(iso(NOW))
    // repeated restarts keep the original first-seen
    for (const dt of [H, 2 * H, 3 * H]) {
      const h = await s.run(NOW + dt)
      expect(h.rules).toEqual([['old.example']])
      expect(s.get().migratedAt).toBe(iso(NOW))
    }
    // exactly at the edge and after: cleared, still never re-stamped or relabeled
    for (const dt of [4 * H, 4 * H + 1, 9 * H]) {
      const h = await s.run(NOW + dt)
      expect(h.rules).toEqual([])
      expect(h.cleared).toBe(1)
      expect(s.get().migratedAt).toBe(iso(NOW))
      expect(s.get().source).toBe('legacy')
    }
  })

  it('a first-seen time in the future (clock moved back) cannot extend past now + 4h', async () => {
    const s = store({ ...base, migratedAt: iso(NOW + 100 * H) })
    expect((await s.run(NOW + 5 * H)).rules).toEqual([['old.example']])
    expect((await s.run(NOW + 9 * H + 1)).rules).toEqual([])
  })

  it('never outlives its own original endsAt', async () => {
    const s = store({ ...base, endsAt: iso(NOW + H) })
    expect((await s.run(NOW)).rules).toEqual([['old.example']])
    expect((await s.run(NOW + H)).rules).toEqual([])
  })

  it('an inactive legacy entry clears and is not stamped', async () => {
    const s = store({ ...base, active: false, endsAt: null })
    const h = await s.run(NOW)
    expect(h.rules).toEqual([])
    expect(h.cleared).toBe(1)
    expect(s.get().migratedAt).toBeUndefined()
  })
})

describe('verified results and protocol edge cases', () => {
  it('a verified inactive proof clears the rules and is cached as verified', async () => {
    const h = harness({ pairingToken: TOKEN, lastKnownLock: cached() }, async (u) =>
      json({
        proof: await signLockProof(TOKEN, {
          nonce: nonceOf(u),
          nowMs: NOW,
          lock: { active: false, endsAt: null, hardCapAt: null, domains: ['a.example'] },
        }),
      }),
    )
    expect(await runSync(h.deps)).toBe('fallback-verified')
    expect(h.cleared).toBe(1)
    expect(h.rules).toEqual([])
    expect(h.saved).toEqual([
      { active: false, endsAt: null, domains: ['a.example'], source: 'fallback-verified' },
    ])
  })

  it('after token rotation, proofs signed with the old token are rejected and the cache decides', async () => {
    const h = harness(
      { pairingToken: 'rotated-synthetic-token', lastKnownLock: cached() },
      async (u) => json({ proof: await goodProof(u) }),
    )
    expect(await runSync(h.deps)).toBe('cache')
    expect(h.saved).toEqual([])
    expect(h.rules).toEqual([['cached.example']])
  })

  it('a verified lock whose endsAt is past the signed hardCapAt is installed with the earlier end', async () => {
    const h = harness({ pairingToken: TOKEN }, async (u) =>
      json({
        proof: await goodProof(u, { endsAt: iso(NOW + 3 * H), hardCapAt: iso(NOW + 10 * 60_000) }),
      }),
    )
    await runSync(h.deps)
    expect(h.saved[0].endsAt).toBe(iso(NOW + 10 * 60_000))
  })

  it('overlapping passes: only the latest writes state or rules', async () => {
    let seq = 0
    const release: Array<() => void> = []
    const h = harness(
      { pairingToken: TOKEN },
      (u) =>
        new Promise<Response>((resolve) => {
          release.push(() => void goodProof(u).then((p) => resolve(json({ proof: p }))))
        }),
    )
    const p1 = runSync(h.deps, () => 1 === seq)
    seq = 1
    await vi.waitFor(() => expect(release.length).toBe(1))
    seq = 2
    const p2 = runSync(h.deps, () => 2 === seq)
    await vi.waitFor(() => expect(release.length).toBe(2))
    release[1]()
    expect(await p2).toBe('fallback-verified')
    release[0]()
    expect(await p1).toBe('none')
    expect(h.saved).toHaveLength(1)
    expect(h.rules).toHaveLength(1)
  })

  it('times out a hung request and a stalled body, then uses the cache', async () => {
    vi.useFakeTimers()
    try {
      const hang = harness(
        { pairingToken: TOKEN, lastKnownLock: cached() },
        () => new Promise<Response>(() => {}),
      )
      hang.deps.fetchImpl = ((_u: unknown, init?: RequestInit) =>
        new Promise((_r, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        )) as typeof fetch
      const p = runSync(hang.deps)
      await vi.advanceTimersByTimeAsync(6_000)
      await vi.advanceTimersByTimeAsync(6_000)
      expect(await p).toBe('cache')

      let cancelled = false
      const stalled = harness({ pairingToken: TOKEN, lastKnownLock: cached() }, () => {
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"pro'))
          },
          pull: () => new Promise(() => {}),
          cancel() {
            cancelled = true
          },
        })
        return new Response(body)
      })
      const p2 = runSync(stalled.deps)
      await vi.advanceTimersByTimeAsync(6_000)
      await vi.advanceTimersByTimeAsync(6_000)
      expect(await p2).toBe('cache')
      expect(cancelled).toBe(true)
      expect(stalled.saved).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the stream as soon as the cap is crossed', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(40 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    expect(await readBoundedJson(new Response(body))).toBeNull()
    expect(cancelled).toBe(true)
  })

  it('a declared oversize content-length is refused without reading', async () => {
    const res = new Response('{}', { headers: { 'content-length': String(1024 * 1024) } })
    expect(await readBoundedJson(res)).toBeNull()
  })
})

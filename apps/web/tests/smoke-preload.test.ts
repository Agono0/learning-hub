/**
 * Argument-shape and deny tests for the smoke preload. Uses fake net/dns/fs objects only:
 * no sockets, no DNS, nothing can leave the machine.
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { install, PUBLIC_LOOKING } = require('./smoke/smoke-preload.cjs') as {
  install: (o: Record<string, unknown>) => { restore: () => void }
  PUBLIC_LOOKING: string
}

const MARK = Symbol('normalized')

function fakes() {
  const connected: unknown[][] = []
  const destroyed: Error[] = []
  const appended: string[] = []
  class Socket {
    connect(...args: unknown[]) {
      connected.push(args)
      return this
    }
    destroy(err: Error) {
      destroyed.push(err)
    }
  }
  const net = { Socket }
  const dns = {
    promises: {
      lookup: async (_h: string, _o: unknown): Promise<unknown> => ({
        address: '0.0.0.0',
        family: 4,
      }),
    },
  }
  const fs = { appendFileSync: (_p: string, s: string) => void appended.push(s) }
  const h = install({ net, dns, fs, fixturePort: 4242, markerPath: '/m' })
  return { net, dns, connected, destroyed, appended, h, Socket }
}

const resolveWith = (answer: unknown) => (_h: string, _o: unknown, cb: (...a: unknown[]) => void) =>
  cb(null, answer, 4)

describe('smoke preload', () => {
  it('normalized [options, cb] array: edits options in place, keeps the marker, remaps after lookup', async () => {
    const { Socket, connected, appended } = fakes()
    const opts = { host: 'fixture.test', port: 80, lookup: resolveWith(PUBLIC_LOOKING) }
    const arr = [opts, () => undefined] as unknown[] & { [MARK]?: boolean }
    arr[MARK] = true
    new Socket().connect(arr)
    expect(connected).toHaveLength(1)
    const passed = connected[0]![0] as typeof arr
    expect(passed).toBe(arr) // same array object, marker intact
    expect(passed[MARK]).toBe(true)
    expect(opts.port).toBe(4242)
    const addr = await new Promise((r) => opts.lookup('fixture.test', {}, (_e, a) => r(a)))
    expect(addr).toBe('127.0.0.1')
    expect(appended[0]).toContain('fixture.test')
  })

  it('plain options object works the same, and an all:true answer list is remapped', async () => {
    const { Socket, connected } = fakes()
    const opts = {
      host: 'fixture.test',
      port: 80,
      lookup: resolveWith([{ address: PUBLIC_LOOKING, family: 4 }]),
    }
    new Socket().connect(opts)
    expect(connected[0]![0]).toBe(opts)
    expect(opts.port).toBe(4242)
    const addr = await new Promise((r) =>
      opts.lookup('fixture.test', { all: true }, (_e, a) => r(a)),
    )
    expect(addr).toEqual([{ address: '127.0.0.1', family: 4 }])
  })

  it('refuses every other non-loopback host before connecting (both shapes)', async () => {
    const { Socket, connected, destroyed } = fakes()
    new Socket().connect({ host: 'example.org', port: 80 })
    new Socket().connect([{ host: '93.184.216.34', port: 80 }, undefined])
    await new Promise((r) => setTimeout(r, 5))
    expect(connected).toHaveLength(0)
    expect(destroyed).toHaveLength(2)
    expect(destroyed[0]!.message).toContain('external connect blocked')
  })

  it('priv.test: the app lookup runs; a refusal passes through, an acceptance fails the connect', async () => {
    const { Socket, connected } = fakes()
    // The app lookup refuses: the error reaches the caller unchanged, and the real connect runs
    // only to deliver that error (nothing is dialled by the fake).
    const refused: unknown[] = []
    const opts1: Record<string, unknown> = {
      host: 'priv.test',
      port: 80,
      lookup: (_h: string, _o: unknown, cb: (e: Error | null, a?: string) => void) =>
        cb(new Error('refused by app')),
    }
    new Socket().connect(opts1)
    ;(opts1.lookup as (...a: unknown[]) => void)('priv.test', {}, (e: Error) => refused.push(e))
    expect((refused[0] as Error).message).toBe('refused by app')
    // The app lookup accepts a private address: the wrapper turns it into an error.
    const accepted: unknown[] = []
    const opts2: Record<string, unknown> = {
      host: 'priv.test',
      port: 80,
      lookup: (_h: string, _o: unknown, cb: (e: Error | null, a?: string) => void) =>
        cb(null, '10.0.0.5'),
    }
    new Socket().connect(opts2)
    ;(opts2.lookup as (...a: unknown[]) => void)('priv.test', {}, (e: Error) => accepted.push(e))
    expect((accepted[0] as Error).message).toContain('accepted a private address')
    expect(connected).toHaveLength(2)
  })

  it('lets loopback and IPC connections through untouched', () => {
    const { Socket, connected } = fakes()
    new Socket().connect({ host: '127.0.0.1', port: 3000 })
    new Socket().connect({ path: '/tmp/x.sock' })
    expect(connected).toHaveLength(2)
  })

  it('DNS answers only the two synthetic names', async () => {
    const { dns } = fakes()
    expect(await dns.promises.lookup('fixture.test', { all: true })).toEqual([
      { address: PUBLIC_LOOKING, family: 4 },
    ])
    expect(await dns.promises.lookup('priv.test', {})).toEqual({
      address: '10.0.0.5',
      family: 4,
    })
    await expect(dns.promises.lookup('example.org', {})).rejects.toMatchObject({
      code: 'ENOTFOUND',
    })
  })
})

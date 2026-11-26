/**
 * /api/online/rooms hands out a fresh join assertion on every call.
 *
 * The online page needs a new single-use assertion for each socket connection. These tests pin
 * what the route gives it: a fresh jti, signature and expiry per call, an explicit
 * `joinAssertion: null` for a device without a key, and NO `joinAssertion` key at all when the
 * worker reply was not usable (so a client can tell "anonymous device" from "unverified
 * fallback"). Real route handlers and the real issuer, with a synthetic generated key pair and
 * mocked identity and worker replies. The worker itself is not run here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateIdentityKeyPair,
  joinAssertionPayload,
  verifyIdentityPayload,
} from '@learning-hub/core/identity-crypto'

type Identity = {
  mode: string
  pubKey?: string
  privKey?: string
  alias: string
  userId: string
}
let identity: Identity
type Worker = 'ok' | 'not-ok' | 'throws' | 'garbage'
let worker: Worker = 'ok'

vi.mock('@learning-hub/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@learning-hub/db')>()
  return {
    ...actual,
    getOnlineIdentity: () => identity,
    getDefaultOnlineServer: () => 'https://hub.example',
  }
})

vi.mock('@/server/net', () => ({
  remoteFetch: async (url: string) => {
    if (worker === 'throws') throw new Error('worker unreachable')
    if (worker === 'not-ok') return new Response('{}', { status: 503 })
    if (worker === 'garbage') return new Response(JSON.stringify({ unexpected: true }))
    const room = { code: 'ABC123', title: 'Synthetic room', participants: [] }
    return new Response(
      JSON.stringify(url.endsWith('/info') ? { ok: true, room } : { code: 'ABC123', room }),
    )
  },
}))

const TTL_MS = 2 * 60_000
const T0 = Date.UTC(2030, 0, 1, 12, 0, 0)

type Assertion = { key: string; exp: number; jti: string; sig: string }
type RoomReply = Record<string, unknown> & { joinAssertion?: Assertion | null }

async function withKey(): Promise<string> {
  const pair = await generateIdentityKeyPair()
  identity = {
    mode: 'device_key',
    pubKey: pair.publicKey,
    privKey: pair.privateKey,
    alias: 'Ada',
    userId: 'usr_x',
  }
  return pair.publicKey
}

async function getRoom(code = 'abc123'): Promise<RoomReply> {
  const { GET } = await import('../src/server/handlers/online/rooms/route')
  const res = await GET(new Request(`http://localhost/api/online/rooms?code=${code}`))
  expect(res.status).toBe(200)
  return (await res.json()) as RoomReply
}

async function createRoom(): Promise<RoomReply> {
  const { POST } = await import('../src/server/handlers/online/rooms/route')
  const res = await POST(
    new Request('http://localhost/api/online/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Synthetic room' }),
    }),
  )
  expect(res.status).toBe(200)
  return (await res.json()) as RoomReply
}

beforeEach(() => {
  worker = 'ok'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

describe('GET /api/online/rooms?code reissues per call', () => {
  it('returns a different jti and signature each call, each valid for this room and worker', async () => {
    const pubKey = await withKey()
    const seen: Assertion[] = []
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(T0 + i * 10_000)
      const body = await getRoom()
      const a = body.joinAssertion as Assertion
      expect(a.key).toBe(pubKey)
      expect(a.exp).toBe(T0 + i * 10_000 + TTL_MS) // request time plus the 2 minute TTL
      const payload = joinAssertionPayload({
        host: 'hub.example',
        room: 'ABC123',
        exp: a.exp,
        jti: a.jti,
      })
      expect(await verifyIdentityPayload(a.key, payload, a.sig)).toBe(true)
      seen.push(a)
    }
    expect(new Set(seen.map((a) => a.jti)).size).toBe(3)
    expect(new Set(seen.map((a) => a.sig)).size).toBe(3)
    expect(new Set(seen.map((a) => a.exp)).size).toBe(3)
  })

  it('gives two calls at the same instant different jtis and signatures', async () => {
    await withKey()
    const [x, y] = [
      (await getRoom()).joinAssertion as Assertion,
      (await getRoom()).joinAssertion as Assertion,
    ]
    expect(x.exp).toBe(y.exp)
    expect(x.jti).not.toBe(y.jti)
    expect(x.sig).not.toBe(y.sig)
  })

  it('signs the room code the worker reported, upper-cased, not the raw query', async () => {
    await withKey()
    const a = (await getRoom('abc123')).joinAssertion as Assertion
    const ok = joinAssertionPayload({ host: 'hub.example', room: 'ABC123', exp: a.exp, jti: a.jti })
    const lower = joinAssertionPayload({
      host: 'hub.example',
      room: 'abc123',
      exp: a.exp,
      jti: a.jti,
    })
    expect(await verifyIdentityPayload(a.key, ok, a.sig)).toBe(true)
    expect(await verifyIdentityPayload(a.key, lower, a.sig)).toBe(false)
  })

  it('a device without a key gets joinAssertion present with the value null', async () => {
    identity = { mode: 'local', alias: 'Ada', userId: 'usr_x' }
    const body = await getRoom()
    expect('joinAssertion' in body).toBe(true)
    expect(body.joinAssertion).toBeNull()
  })

  it.each<Worker>(['not-ok', 'throws'])(
    'an unusable worker reply (%s) returns the fallback room with NO joinAssertion key',
    async (mode) => {
      await withKey()
      worker = mode
      const body = await getRoom()
      expect('joinAssertion' in body).toBe(false)
      expect((body.room as { code: string }).code).toBe('ABC123')
    },
  )
})

describe('POST /api/online/rooms create', () => {
  it('returns a signed assertion for the new room on the worker path', async () => {
    await withKey()
    const body = await createRoom()
    expect(body.code).toBe('ABC123')
    const a = body.joinAssertion as Assertion
    expect(a.exp).toBe(T0 + TTL_MS)
    const payload = joinAssertionPayload({
      host: 'hub.example',
      room: 'ABC123',
      exp: a.exp,
      jti: a.jti,
    })
    expect(await verifyIdentityPayload(a.key, payload, a.sig)).toBe(true)
  })

  it('returns joinAssertion null on the worker path for a device without a key', async () => {
    identity = { mode: 'local', alias: 'Ada', userId: 'usr_x' }
    const body = await createRoom()
    expect(body.code).toBe('ABC123')
    expect('joinAssertion' in body).toBe(true)
    expect(body.joinAssertion).toBeNull()
  })

  it.each<Worker>(['throws', 'garbage'])(
    'the local-code fallback (%s) carries no joinAssertion',
    async (mode) => {
      await withKey()
      worker = mode
      const body = await createRoom()
      expect(body.code).toMatch(/^[A-Z0-9]{6}$/)
      expect(body.code).not.toBe('ABC123')
      expect('joinAssertion' in body).toBe(false)
    },
  )
})

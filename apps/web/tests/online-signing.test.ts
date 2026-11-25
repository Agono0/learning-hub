import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  digestHex,
  generateIdentityKeyPair,
  joinAssertionPayload,
  requestSigningPayload,
  verifyIdentityPayload,
} from '@learning-hub/core/identity-crypto'

// Synthetic key pair only. No real identity or key store is read.
let identity: { mode: string; pubKey?: string; privKey?: string; alias: string; userId: string }

vi.mock('@learning-hub/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@learning-hub/db')>()
  return {
    ...actual,
    getOnlineIdentity: () => identity,
    getDefaultOnlineServer: () => 'https://hub.example',
  }
})

const sent: Array<{ url: string; headers: Record<string, string>; body: string }> = []
let statuses: number[] = []

vi.mock('@/server/net', () => ({
  remoteFetch: async (url: string, init: RequestInit) => {
    sent.push({
      url,
      headers: { ...(init.headers as Record<string, string>) },
      body: String(init.body),
    })
    const status = statuses.shift() ?? 200
    return new Response(JSON.stringify({ ok: status < 300, item: { id: 'i' } }), { status })
  },
}))

beforeEach(() => {
  sent.length = 0
  statuses = []
})

describe('online request signing', () => {
  it('signs the exact body for the configured worker and the signature verifies', async () => {
    const pair = await generateIdentityKeyPair()
    identity = {
      mode: 'device_key',
      pubKey: pair.publicKey,
      privKey: pair.privateKey,
      alias: 'Ada',
      userId: 'usr_x',
    }
    const { signWorkerRequest } = await import('../src/server/online-signing')
    const body = '{"a":1}'
    const h = (await signWorkerRequest(
      'https://hub.example',
      '/api/v1/library/publish',
      body,
      1234,
    ))!
    expect(h['x-lh-key']).toBe(pair.publicKey)
    expect(h['x-lh-ts']).toBe('1234')
    const payload = requestSigningPayload({
      method: 'POST',
      host: 'hub.example',
      pathAndQuery: '/api/v1/library/publish',
      timestamp: 1234,
      bodySha256: await digestHex(new TextEncoder().encode(body)),
    })
    expect(await verifyIdentityPayload(pair.publicKey, payload, h['x-lh-sig']!)).toBe(true)
    // A different body or host does not verify against this signature.
    const other = payload.replace('hub.example', 'evil.example')
    expect(await verifyIdentityPayload(pair.publicKey, other, h['x-lh-sig']!)).toBe(false)
  })

  it('returns null (anonymous) without a device key', async () => {
    identity = { mode: 'local', alias: 'Ada', userId: 'usr_x' }
    const { signWorkerRequest, makeJoinAssertion } = await import('../src/server/online-signing')
    expect(await signWorkerRequest('https://hub.example', '/p', '{}')).toBeNull()
    expect(await makeJoinAssertion('https://hub.example', 'ABC123')).toBeNull()
  })

  it('join assertion binds worker host, room, expiry and a fresh id each time', async () => {
    const pair = await generateIdentityKeyPair()
    identity = {
      mode: 'device_key',
      pubKey: pair.publicKey,
      privKey: pair.privateKey,
      alias: 'Ada',
      userId: 'usr_x',
    }
    const { makeJoinAssertion } = await import('../src/server/online-signing')
    const a = (await makeJoinAssertion('https://hub.example', 'ABC123', 1000))!
    const b = (await makeJoinAssertion('https://hub.example', 'ABC123', 1000))!
    expect(a.jti).not.toBe(b.jti)
    expect(a.exp).toBe(1000 + 120_000)
    expect(a.jti).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    const ok = joinAssertionPayload({ host: 'hub.example', room: 'ABC123', exp: a.exp, jti: a.jti })
    expect(await verifyIdentityPayload(pair.publicKey, ok, a.sig)).toBe(true)
    for (const wrong of [
      joinAssertionPayload({ host: 'hub.example', room: 'ABC124', exp: a.exp, jti: a.jti }),
      joinAssertionPayload({ host: 'other.example', room: 'ABC123', exp: a.exp, jti: a.jti }),
      joinAssertionPayload({ host: 'hub.example', room: 'ABC123', exp: a.exp + 1, jti: a.jti }),
    ]) {
      expect(await verifyIdentityPayload(pair.publicKey, wrong, a.sig)).toBe(false)
    }
    // The assertion carries no private material.
    expect(JSON.stringify(a)).not.toContain(pair.privateKey)
  })
})

describe('library publish handler (no silent downgrade)', () => {
  async function publish() {
    const { POST } = await import('../src/server/handlers/online/library/route')
    return POST(
      new Request('http://localhost/api/online/library', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'deck', title: 'T', shareString: 'LH1:x', tags: [] }),
      }),
    )
  }
  async function withKey() {
    const pair = await generateIdentityKeyPair()
    identity = {
      mode: 'device_key',
      pubKey: pair.publicKey,
      privKey: pair.privateKey,
      alias: 'Ada',
      userId: 'usr_x',
    }
  }

  it('sends a signed request with only whitelisted fields (no author)', async () => {
    await withKey()
    const res = await publish()
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers['x-lh-sig']).toBeTruthy()
    expect(JSON.parse(sent[0]!.body)).not.toHaveProperty('author')
    expect(sent[0]!.url).toBe('https://hub.example/api/v1/library/publish')
  })

  it.each([
    [403, 'register_required'],
    [503, 'verification_unavailable'],
    [401, 'signature_rejected'],
  ])('worker %i is reported, never retried anonymously', async (status, code) => {
    await withKey()
    statuses = [status, 200]
    const res = await publish()
    const out = (await res.json()) as { ok: boolean; code: string; error: string }
    expect(res.status).toBe(status)
    expect(out).toMatchObject({ ok: false, code })
    expect(out.error.length).toBeGreaterThan(10)
    expect(sent).toHaveLength(1) // exactly one attempt, with a signature
    expect(sent[0]!.headers['x-lh-sig']).toBeTruthy()
  })

  it('a device without a key publishes anonymously, explicitly and unsigned', async () => {
    identity = { mode: 'local', alias: 'Ada', userId: 'usr_x' }
    const res = await publish()
    expect(res.status).toBe(200)
    expect(sent[0]!.headers['x-lh-sig']).toBeUndefined()
  })
})

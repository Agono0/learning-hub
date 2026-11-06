import { describe, expect, it } from 'vitest'
import worker from '../src/index'

describe('Cloudflare Worker endpoints', () => {
  const fakeEnv = {
    DB: {
      prepare: (sql: string) => ({
        bind: (..._args: any[]) => ({
          run: async () => ({ success: true }),
          all: async () => ({ results: [] }),
          first: async () => null,
        }),
      }),
    } as any,
    STUDY_ROOM: {
      idFromName: (_name: string) => 'do_id_123',
      get: (_id: any) => ({
        fetch: async (_req: any, init?: any) => {
          if (init?.body) {
            const body = JSON.parse(init.body)
            return new Response(JSON.stringify({ room: body }))
          }
          return new Response(JSON.stringify({ ok: true }))
        },
      }),
    } as any,
    BOSS_RAID: {
      idFromName: (_name: string) => 'raid_id_123',
      get: (_id: any) => ({
        fetch: async (_req: any, init?: any) => {
          if (init?.body) {
            const body = JSON.parse(init.body)
            return new Response(JSON.stringify({ raid: body }))
          }
          return new Response(JSON.stringify({ ok: true }))
        },
      }),
    } as any,
  }

  it('serves health endpoint', async () => {
    const res = await worker.fetch(new Request('http://worker.local/health'), fakeEnv)
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.ok).toBe(true)
    expect(data.worker).toBe('learning-hub-engagement')
  })

  it('registers device key (signed challenge required)', async () => {
    // M18: the worker verifies an ECDSA P-256 signature over the challenge.
    const {
      generateIdentityKeyPair,
      identityChallenge,
      identitySigningPayload,
      signIdentityPayload,
    } = await import('@learning-hub/core')
    const pair = await generateIdentityKeyPair()
    const challenge = identityChallenge('usr_curie', 1730000000000)
    const signature = await signIdentityPayload(
      pair.privateKey,
      identitySigningPayload(challenge, 'Curie'),
    )

    const res = await worker.fetch(
      new Request('http://worker.local/api/v1/auth/register-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: pair.publicKey,
          alias: 'Curie',
          challenge,
          signature,
        }),
      }),
      fakeEnv,
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.ok).toBe(true)
    expect(data.alias).toBe('Curie')

    // A tampered signature must be rejected with 401.
    const bad = await worker.fetch(
      new Request('http://worker.local/api/v1/auth/register-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: pair.publicKey,
          alias: 'Impostor',
          challenge,
          signature,
        }),
      }),
      fakeEnv,
    )
    expect(bad.status).toBe(401)
    expect(data.userId.startsWith('usr_')).toBe(true)
  })

  it('creates study rooms and returns room code', async () => {
    const res = await worker.fetch(
      new Request('http://worker.local/api/v1/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Morning Flow',
          pomodoroWorkMinutes: 25,
        }),
      }),
      fakeEnv,
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.ok).toBe(true)
    expect(data.code).toHaveLength(6)
  })

  it('creates party raids', async () => {
    const res = await worker.fetch(
      new Request('http://worker.local/api/v1/raids/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bossKey: 'hydra' }),
      }),
      fakeEnv,
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.ok).toBe(true)
    expect(data.raidId.startsWith('raid_')).toBe(true)
  })
})

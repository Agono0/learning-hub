import { describe, expect, it } from 'vitest'
import {
  createLeague,
  generateLeagueSigner,
  signLeagueMutation,
  signerIdFromPubKey,
} from '@learning-hub/core/leagues'
import { LeagueRoom } from '../src/index'

const LEAGUE_ID = 'lg-spectate'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')

function fakeState() {
  const store = new Map<string, unknown>()
  return {
    id: { toString: () => 'do_spectate' },
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => void store.set(key, structuredClone(value)),
      delete: async (key: string) => store.delete(key),
    },
    blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
    acceptWebSocket: () => undefined,
    getWebSockets: () => [],
  } as unknown as DurableObjectState
}

async function join(room: LeagueRoom, alias: string, n: number) {
  const signer = await generateLeagueSigner()
  const envelope = await signLeagueMutation({
    signer,
    leagueId: LEAGUE_ID,
    seq: 1,
    mutation: { type: 'join', alias },
    timestamp: T0,
    nonce: `spectate-nonce-${String(n).padStart(8, '0')}`,
  })
  const res = await room.fetch(
    new Request('http://do/mutate', { method: 'POST', body: JSON.stringify({ envelope }) }),
  )
  return { res, handle: await signerIdFromPubKey(signer.pubKey), pubKey: signer.pubKey }
}

async function setup() {
  const room = new LeagueRoom(fakeState(), { now: () => T0 })
  const league = createLeague({ id: LEAGUE_ID, title: 'Spectate', seasonStart: '2026-03-02' })
  await room.fetch(
    new Request('http://do/init', { method: 'POST', body: JSON.stringify({ league }) }),
  )
  return room
}

const spectate = (room: LeagueRoom, headers?: Record<string, string>) =>
  room.fetch(new Request('http://do/spectate', { headers }))

describe('LeagueRoom /spectate', () => {
  it('is 404 before init', async () => {
    const room = new LeagueRoom(fakeState(), { now: () => T0 })
    expect((await spectate(room)).status).toBe(404)
  })

  it('lists members alphabetically by alias and marks the view practice-only', async () => {
    const room = await setup()
    await join(room, 'Zed', 1)
    await join(room, 'Amy', 2)
    const body = (await (await spectate(room)).json()) as {
      practiceOnly: boolean
      members: { alias: string }[]
      acceptedMutations: number
    }
    expect(body.practiceOnly).toBe(true)
    expect(body.members.map((m) => m.alias)).toEqual(['Amy', 'Zed'])
    expect(body.acceptedMutations).toBe(2)
  })

  it('never leaks handles, public keys or timing flags', async () => {
    const room = await setup()
    const a = await join(room, 'Amy', 3)
    const text = await (await spectate(room)).text()
    expect(text).not.toContain(a.handle)
    expect(text).not.toContain(a.pubKey)
    expect(text).not.toContain('advisoryFlags')
  })

  it('supports conditional requests and never caches', async () => {
    const room = await setup()
    await join(room, 'Amy', 4)
    const first = await spectate(room)
    expect(first.headers.get('Cache-Control')).toBe('no-store')
    const etag = first.headers.get('ETag') as string
    expect((await spectate(room, { 'If-None-Match': etag })).status).toBe(304)
    await join(room, 'Bo', 5)
    const next = await spectate(room, { 'If-None-Match': etag })
    expect(next.status).toBe(200)
    expect(next.headers.get('ETag')).not.toBe(etag)
  })

  it('rejects non-GET methods', async () => {
    const room = await setup()
    const res = await room.fetch(new Request('http://do/spectate', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(404)
  })
})

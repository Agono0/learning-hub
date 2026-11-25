import { describe, expect, it } from 'vitest'
import {
  createLeague,
  digestInviteCode,
  generateInviteCode,
  generateLeagueSigner,
  signLeagueMutation,
  signerIdFromPubKey,
  type LeagueMutation,
  type LeagueSigner,
} from '@learning-hub/core/leagues'
import { LeagueRoom } from '../src/index'

const LEAGUE_ID = 'lg-invites'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')
const HOUR = 60 * 60_000

function fakeState() {
  const store = new Map<string, unknown>()
  const state = {
    id: { toString: () => 'do_inv' },
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => void store.set(key, structuredClone(value)),
      delete: async (key: string) => store.delete(key),
    },
    blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
    acceptWebSocket: () => undefined,
    getWebSockets: () => [],
  } as unknown as DurableObjectState
  return { state, store }
}

interface Actor {
  signer: LeagueSigner
  handle: string
  seq: number
}
const actor = async (): Promise<Actor> => {
  const signer = await generateLeagueSigner()
  return { signer, handle: await signerIdFromPubKey(signer.pubKey), seq: 0 }
}

let n = 0
async function send(room: LeagueRoom, who: Actor, mutation: LeagueMutation, now: number) {
  const envelope = await signLeagueMutation({
    signer: who.signer,
    leagueId: LEAGUE_ID,
    seq: ++who.seq,
    mutation,
    timestamp: now,
    nonce: `inv-room-nonce-${String(++n).padStart(9, '0')}`,
  })
  const res = await room.fetch(
    new Request('http://do/mutate', { method: 'POST', body: JSON.stringify({ envelope }) }),
  )
  return { status: res.status, body: (await res.json()) as { ok: boolean; code?: string } }
}

async function setup() {
  const clock = { t: T0 }
  const fs = fakeState()
  const room = new LeagueRoom(fs.state, { now: () => clock.t })
  const league = createLeague({ id: LEAGUE_ID, title: 'Invites', seasonStart: '2026-03-02' })
  await room.fetch(
    new Request('http://do/init', { method: 'POST', body: JSON.stringify({ league }) }),
  )
  const founder = await actor()
  await send(room, founder, { type: 'join', alias: 'Fay' }, clock.t)
  await send(room, founder, { type: 'invite-policy', required: true }, clock.t)
  return { room, clock, founder, fs }
}

async function mint(room: LeagueRoom, by: Actor, at: number, maxUses = 1, ttlMs = HOUR) {
  const code = generateInviteCode()
  const digest = await digestInviteCode(code)
  const r = await send(room, by, { type: 'invite-create', digest, maxUses, ttlMs }, at)
  expect(r.body.ok).toBe(true)
  return { code, digest }
}

const view = async (room: LeagueRoom, path = '/state') =>
  (await room.fetch(new Request(`http://do${path}`))).text()

describe('LeagueRoom invites', () => {
  it('an invite-only room refuses a join with no code (409 invite_required)', async () => {
    const { room, clock } = await setup()
    const bo = await actor()
    const plain = await send(room, bo, { type: 'join', alias: 'Bo' }, clock.t)
    expect(plain.status).toBe(409)
    expect(plain.body.code).toBe('invite_required')
  })

  it('digests the code in the room: storage and views never hold the plaintext', async () => {
    const { room, clock, founder, fs } = await setup()
    const inv = await mint(room, founder, clock.t + 1)
    const bo = await actor()
    clock.t += 2
    const joined = await send(room, bo, { type: 'join', alias: 'Bo', invite: inv.code }, clock.t)
    expect(joined.body.ok).toBe(true)
    const stored = JSON.stringify([...fs.store.values()])
    expect(stored).not.toContain(inv.code)
    expect(stored).toContain(inv.digest)
    expect(await view(room)).not.toContain(inv.code)
    expect(await view(room)).not.toContain(inv.digest)
    expect(await view(room, '/spectate')).not.toContain(inv.digest)
  })

  it('a spent code answers 409 invite_invalid, same as an unknown one', async () => {
    const { room, clock, founder } = await setup()
    const inv = await mint(room, founder, clock.t + 1)
    clock.t += 2
    await send(room, await actor(), { type: 'join', alias: 'A', invite: inv.code }, clock.t)
    const spent = await send(
      room,
      await actor(),
      { type: 'join', alias: 'B', invite: inv.code },
      clock.t,
    )
    const unknown = await send(
      room,
      await actor(),
      { type: 'join', alias: 'C', invite: generateInviteCode() },
      clock.t,
    )
    expect(spent.status).toBe(409)
    expect(spent.body).toEqual(unknown.body)
    expect(spent.body.code).toBe('invite_invalid')
  })

  it('expires codes on the authority clock, not the sender clock', async () => {
    const { room, clock, founder } = await setup()
    const inv = await mint(room, founder, clock.t + 1, 1, HOUR)
    clock.t += HOUR + 5_000
    const bo = await actor()
    // The envelope timestamp is fresh, so only the invite is stale.
    const late = await send(room, bo, { type: 'join', alias: 'Bo', invite: inv.code }, clock.t)
    expect(late.body.code).toBe('invite_invalid')
  })

  it('revocation takes effect immediately', async () => {
    const { room, clock, founder } = await setup()
    const inv = await mint(room, founder, clock.t + 1)
    clock.t += 2
    const revoked = await send(
      room,
      founder,
      { type: 'invite-revoke', digest: inv.digest },
      clock.t,
    )
    expect(revoked.body.ok).toBe(true)
    const bo = await actor()
    const r = await send(room, bo, { type: 'join', alias: 'Bo', invite: inv.code }, clock.t)
    expect(r.body.code).toBe('invite_invalid')
  })

  it('public views show the policy and a live count, nothing else about invites', async () => {
    const { room, clock, founder } = await setup()
    await mint(room, founder, clock.t + 1)
    await mint(room, founder, clock.t + 2)
    const state = JSON.parse(await view(room)) as { inviteOnly: boolean; liveInvites: number }
    expect(state.inviteOnly).toBe(true)
    expect(state.liveInvites).toBe(2)
    const spec = JSON.parse(await view(room, '/spectate')) as { inviteOnly: boolean }
    expect(spec.inviteOnly).toBe(true)
    expect(await view(room)).not.toContain('"invites"')
  })

  it('rename shows in views and leave removes the member from the spectator list', async () => {
    const { room, clock, founder } = await setup()
    const inv = await mint(room, founder, clock.t + 1)
    const bo = await actor()
    clock.t += 2
    await send(room, bo, { type: 'join', alias: 'Bo', invite: inv.code }, clock.t)
    await send(room, bo, { type: 'rename', alias: 'Bobby' }, clock.t)
    let spec = JSON.parse(await view(room, '/spectate')) as { members: { alias: string }[] }
    expect(spec.members.map((m) => m.alias)).toEqual(['Bobby', 'Fay'])
    await send(room, bo, { type: 'leave' }, clock.t)
    spec = JSON.parse(await view(room, '/spectate')) as { members: { alias: string }[] }
    expect(spec.members.map((m) => m.alias)).toEqual(['Fay'])
  })

  it('survives a restart with invites intact', async () => {
    const { room, clock, founder, fs } = await setup()
    const inv = await mint(room, founder, clock.t + 1)
    const reborn = new LeagueRoom(
      {
        id: { toString: () => 'do_inv' },
        storage: {
          get: async <T>(k: string) => fs.store.get(k) as T | undefined,
          put: async (k: string, v: unknown) => void fs.store.set(k, structuredClone(v)),
          delete: async (k: string) => fs.store.delete(k),
        },
        blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
        acceptWebSocket: () => undefined,
        getWebSockets: () => [],
      } as unknown as DurableObjectState,
      { now: () => clock.t },
    )
    clock.t += 2
    const joined = await send(
      reborn,
      await actor(),
      { type: 'join', alias: 'Bo', invite: inv.code },
      clock.t,
    )
    expect(joined.body.ok).toBe(true)
  })
})

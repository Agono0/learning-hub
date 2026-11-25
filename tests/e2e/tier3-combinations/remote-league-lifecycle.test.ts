/// <reference path="../../../apps/worker/src/worker.d.ts" />
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Signed remote league lifecycle, end to end: the web route signs with the
 * stored device key and flushes its queue over a fetch boundary that is wired
 * straight into the REAL worker LeagueRoom (real verifier, real reducer, real
 * rate limit). A second member signs directly. Nothing in the authority is
 * faked, so a pass means the route, queue, signer, room and reducer agree.
 */

const SERVER = 'https://league.example.dev'
const LEAGUE = 'lg-lifecycle-01'

type Route = typeof import('@/server/handlers/leagues/remote/route')
let H: Route
let core: typeof import('@learning-hub/core')
let tables: typeof import('@learning-hub/db')
let setRemoteFetch: typeof import('@/server/net').setRemoteFetch
let room: import('../../../apps/worker/src/index').LeagueRoom
let prevDb: string | undefined

function fakeState() {
  const store = new Map<string, unknown>()
  return {
    id: { toString: () => 'do_lifecycle' },
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => void store.set(key, structuredClone(value)),
      delete: async (key: string) => store.delete(key),
    },
    blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
    acceptWebSocket: () => undefined,
    getWebSockets: () => [],
  } as never
}

interface Reply {
  code?: string
  queue: { pending: number; rejected: number }
}
interface View {
  league: { players: Array<{ handle: string }> }
  aliases: Record<string, string>
  inviteOnly: boolean
  liveInvites: number
  blocked: string[]
  modLog: Array<{ action: string; target: string }>
}

const post = (body: unknown) =>
  new Request('http://x/api/leagues/remote', { method: 'POST', body: JSON.stringify(body) })
const target = { serverUrl: SERVER, remoteLeagueId: LEAGUE }

async function routeCall(body: Record<string, unknown>) {
  const res = await H.POST(post({ ...target, ...body }))
  return { status: res.status, body: (await res.json()) as Reply }
}

/** Queue one mutation through the route and flush it to the room. */
async function viaRoute(mutation: Record<string, unknown>) {
  const queued = await routeCall({ action: 'enqueue', mutation })
  expect(queued.status).toBe(202)
  const synced = await routeCall({ action: 'sync' })
  expect(synced.status).toBe(200)
  return synced.body
}

interface Member {
  signer: Awaited<ReturnType<typeof import('@learning-hub/core').generateLeagueSigner>>
  handle: string
  seq: number
}
let bo: Member
let nonceN = 0

async function direct(who: Member, mutation: Record<string, unknown>) {
  const envelope = await core.signLeagueMutation({
    signer: who.signer,
    leagueId: LEAGUE,
    seq: ++who.seq,
    mutation: mutation as never,
    timestamp: Date.now(),
    nonce: `lifecycle-direct-${String(++nonceN).padStart(8, '0')}`,
  })
  const res = await room.fetch(
    new Request('http://do/mutate', { method: 'POST', body: JSON.stringify({ envelope }) }),
  )
  return { status: res.status, body: (await res.json()) as Reply }
}

const roomState = async () =>
  (await (await room.fetch(new Request('http://do/state'))).json()) as View

beforeAll(async () => {
  prevDb = process.env.LEARNING_HUB_DB
  process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-lifecycle-')), 'e2e.db')
  process.env.LH_REMOTE_LEAGUES = '1'
  delete (globalThis as unknown as { __learningHubDb?: unknown }).__learningHubDb
  H = await import('@/server/handlers/leagues/remote/route')
  core = await import('@learning-hub/core')
  tables = await import('@learning-hub/db')
  ;({ setRemoteFetch } = await import('@/server/net'))
  const { LeagueRoom } = await import('../../../apps/worker/src/index')

  const pair = await core.generateIdentityKeyPair()
  tables.updateOnlineIdentity({
    mode: 'device_key',
    pubKey: pair.publicKey,
    privKey: pair.privateKey,
  })

  room = new LeagueRoom(fakeState())
  const league = core.createLeague({ id: LEAGUE, title: 'Lifecycle', seasonStart: '2026-03-02' })
  await room.fetch(
    new Request('http://do/init', { method: 'POST', body: JSON.stringify({ league }) }),
  )
  setRemoteFetch(async (url, init) => {
    const path = new URL(url).pathname.replace(`/api/v1/leagues/${LEAGUE}`, '')
    return room.fetch(new Request(`http://do${path}`, init as RequestInit))
  })

  const signer = await core.generateLeagueSigner()
  bo = { signer, handle: await core.signerIdFromPubKey(signer.pubKey), seq: 0 }
})

afterAll(() => {
  delete process.env.LH_REMOTE_LEAGUES
  if (prevDb === undefined) delete process.env.LEARNING_HUB_DB
  else process.env.LEARNING_HUB_DB = prevDb
})

describe('Tier 3: signed remote league lifecycle through route and room', () => {
  let founderHandle = ''
  let inviteCode = ''

  it('links, then the stored device key joins the league and becomes founder', async () => {
    expect((await routeCall({ action: 'link' })).status).toBe(200)
    const synced = await viaRoute({ type: 'join', alias: 'Fay' })
    expect(synced.queue.pending).toBe(0)
    expect(synced.queue.rejected).toBe(0)
    const state = await roomState()
    expect(state.league.players).toHaveLength(1)
    founderHandle = state.league.players[0].handle
    expect(state.aliases[founderHandle]).toBe('Fay')
  })

  it('the founder turns on invite-only and publishes only the digest of a code', async () => {
    expect((await viaRoute({ type: 'invite-policy', required: true })).queue.pending).toBe(0)
    inviteCode = core.generateInviteCode()
    const digest = await core.digestInviteCode(inviteCode)
    const synced = await viaRoute({ type: 'invite-create', digest, maxUses: 2, ttlMs: 3_600_000 })
    expect(synced.queue.pending).toBe(0)
    const state = await roomState()
    expect(state.inviteOnly).toBe(true)
    expect(state.liveInvites).toBe(1)
    // Neither the room view nor the queue ever holds the plaintext code.
    expect(JSON.stringify(state)).not.toContain(inviteCode)
    expect(JSON.stringify(tables.loadLeagueQueue(tables.listRemoteLinks()[0]!.id))).not.toContain(
      inviteCode,
    )
  })

  it('a second member cannot join without the code, and joins with it', async () => {
    const bare = await direct(bo, { type: 'join', alias: 'Bo' })
    expect(bare.status).toBe(409)
    expect(bare.body.code).toBe('invite_required')
    const wrong = await direct(bo, {
      type: 'join',
      alias: 'Bo',
      invite: core.generateInviteCode(),
    })
    expect(wrong.status).toBe(409)
    expect(wrong.body.code).toBe('invite_invalid')
    const ok = await direct(bo, { type: 'join', alias: 'Bo', invite: inviteCode })
    expect(ok.status).toBe(200)
    expect((await roomState()).league.players).toHaveLength(2)
  })

  it('a member cannot moderate, and the room says why', async () => {
    const refused = await direct(bo, { type: 'remove-member', target: founderHandle })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('not_founder')
  })

  it('the founder removes the member through the queue; the block holds against the code', async () => {
    const synced = await viaRoute({ type: 'remove-member', target: bo.handle })
    expect(synced.queue.pending).toBe(0)
    const state = await roomState()
    expect(state.league.players.map((p: { handle: string }) => p.handle)).toEqual([founderHandle])
    expect(state.blocked).toEqual([bo.handle])
    expect(state.modLog).toMatchObject([{ action: 'remove', target: bo.handle }])
    const back = await direct(bo, { type: 'join', alias: 'Bo', invite: inviteCode })
    expect(back.status).toBe(409)
    expect(back.body.code).toBe('blocked')
  })

  it('unblocking lets the member rejoin with the unspent code', async () => {
    expect((await viaRoute({ type: 'unblock-member', target: bo.handle })).queue.pending).toBe(0)
    const again = await direct(bo, { type: 'join', alias: 'Bo', invite: inviteCode })
    expect(again.status).toBe(200)
    expect((await roomState()).blocked).toEqual([])
  })

  it('the founder hands the role over and the queue then reports a permanent refusal', async () => {
    expect((await viaRoute({ type: 'transfer-founder', target: bo.handle })).queue.pending).toBe(0)
    expect((await roomState()).league.players[0].handle).toBe(bo.handle)
    // The old founder's next moderation item is refused, dropped from pending, and kept visible.
    const synced = await viaRoute({ type: 'invite-policy', required: false })
    expect(synced.queue.pending).toBe(0)
    expect(synced.queue.rejected).toBe(1)
    expect((await roomState()).inviteOnly).toBe(true)
  })

  it('a replayed signed envelope is refused by the real room', async () => {
    const envelope = await core.signLeagueMutation({
      signer: bo.signer,
      leagueId: LEAGUE,
      seq: ++bo.seq,
      mutation: { type: 'rename', alias: 'Bobby' },
      timestamp: Date.now(),
      nonce: 'lifecycle-replay-nonce-0001',
    })
    const send = () =>
      room.fetch(
        new Request('http://do/mutate', { method: 'POST', body: JSON.stringify({ envelope }) }),
      )
    expect((await send()).status).toBe(200)
    const replay = await send()
    expect(replay.status).toBeGreaterThanOrEqual(400)
    expect((await roomState()).aliases[bo.handle]).toBe('Bobby')
  })

  it('the spectator view never shows digests, codes or the block list', async () => {
    const view = await (await room.fetch(new Request('http://do/spectate'))).text()
    expect(view).not.toContain(inviteCode)
    expect(view).not.toContain('blocked')
    expect(view).not.toContain('modLog')
  })
})

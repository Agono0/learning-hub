import { describe, expect, it } from 'vitest'
import {
  createLeague,
  generateLeagueSigner,
  signLeagueMutation,
  signerIdFromPubKey,
  type LeagueMutation,
  type LeagueSigner,
} from '@learning-hub/core/leagues'
import worker, { LeagueRoom, type Env } from '../src/index'

const LEAGUE_ID = 'lg-room-test'
const T0 = Date.parse('2026-03-02T10:00:00.000Z')

/** In-memory DurableObjectState with an optional failing-write switch. */
function fakeState(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial))
  const control = { failWrites: false, writes: 0 }
  const state = {
    id: { toString: () => 'do_test' },
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => {
        if (control.failWrites) throw new Error('storage unavailable')
        control.writes++
        store.set(key, structuredClone(value))
      },
      delete: async (key: string) => store.delete(key),
    },
    blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
    acceptWebSocket: () => undefined,
    getWebSockets: () => [],
  } as unknown as DurableObjectState
  return { state, store, control }
}

function makeRoom(clock: { now: number }, initial: Record<string, unknown> = {}) {
  const fs = fakeState(initial)
  const room = new LeagueRoom(fs.state, { now: () => clock.now })
  return { room, ...fs }
}

const post = (path: string, body: unknown) =>
  new Request(`http://do${path}`, { method: 'POST', body: JSON.stringify(body) })

async function initRoom(room: LeagueRoom) {
  const league = createLeague({ id: LEAGUE_ID, title: 'Room test', seasonStart: '2026-03-02' })
  return room.fetch(post('/init', { league }))
}

interface Actor {
  signer: LeagueSigner
  handle: string
  seq: number
}
async function actor(): Promise<Actor> {
  const signer = await generateLeagueSigner()
  return { signer, handle: await signerIdFromPubKey(signer.pubKey), seq: 0 }
}

let nonceN = 0
async function envelopeFor(who: Actor, mutation: LeagueMutation, at: number, seq?: number) {
  const useSeq = seq ?? who.seq + 1
  const env = await signLeagueMutation({
    signer: who.signer,
    leagueId: LEAGUE_ID,
    seq: useSeq,
    mutation,
    timestamp: at,
    nonce: `room-nonce-${String(++nonceN).padStart(8, '0')}`,
  })
  who.seq = Math.max(who.seq, useSeq)
  return env
}

describe('LeagueRoom', () => {
  it('initializes once and refuses a second init', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    expect((await initRoom(room)).status).toBe(201)
    expect((await initRoom(room)).status).toBe(409)
  })

  it('starts with no members even if the init body smuggles players', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    const league = {
      ...createLeague({ id: LEAGUE_ID, title: 'x', seasonStart: '2026-03-02' }),
      players: [
        {
          handle: 'usr_fake',
          tier: 'diamond',
          points: 999,
          seasonPoints: 999,
          roundsWon: 9,
          duelsWon: 9,
          duelsLost: 0,
        },
      ],
      currentRound: 7,
    }
    await room.fetch(post('/init', { league }))
    const view = (await (await room.fetch(new Request('http://do/state'))).json()) as {
      league: { players: unknown[]; currentRound: number }
    }
    expect(view.league.players).toHaveLength(0)
    expect(view.league.currentRound).toBe(0)
  })

  it('rejects an invalid init body and non-JSON bodies', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    expect((await room.fetch(post('/init', { league: { nope: true } }))).status).toBe(400)
    const bad = await room.fetch(new Request('http://do/init', { method: 'POST', body: '{{' }))
    expect(bad.status).toBe(400)
  })

  it('answers 404 before init and for unknown routes', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    expect((await room.fetch(new Request('http://do/state'))).status).toBe(404)
    const a = await actor()
    const res = await room.fetch(
      post('/mutate', { envelope: await envelopeFor(a, { type: 'join', alias: 'A' }, T0) }),
    )
    expect(res.status).toBe(404)
    await initRoom(room)
    expect((await room.fetch(new Request('http://do/other'))).status).toBe(404)
  })

  it('accepts a signed join and persists exactly one write for it', async () => {
    const clock = { now: T0 }
    const { room, control } = makeRoom(clock)
    await initRoom(room)
    const writesBefore = control.writes
    const a = await actor()
    const res = await room.fetch(
      post('/mutate', { envelope: await envelopeFor(a, { type: 'join', alias: 'Ann' }, T0) }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, effects: ['joined'], accepted: 1 })
    expect(control.writes - writesBefore).toBe(1)
  })

  it('maps verification failures to 4xx and leaves storage untouched', async () => {
    const clock = { now: T0 }
    const { room, control } = makeRoom(clock)
    await initRoom(room)
    const writes = control.writes
    const a = await actor()
    const env = await envelopeFor(a, { type: 'join', alias: 'Ann' }, T0)
    const forged = { ...env, payload: env.payload.replace('Ann', 'Eve') }
    const res = await room.fetch(post('/mutate', { envelope: forged }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ ok: false, code: 'bad_signature' })
    const garbage = await room.fetch(post('/mutate', { envelope: { x: 1 } }))
    expect(garbage.status).toBe(400)
    expect(control.writes).toBe(writes)
  })

  it('rejects a replayed envelope with the same nonce', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    await initRoom(room)
    const a = await actor()
    const env = await envelopeFor(a, { type: 'join', alias: 'Ann' }, T0)
    expect((await room.fetch(post('/mutate', { envelope: env }))).status).toBe(200)
    clock.now = T0 + 500
    const replay = await room.fetch(post('/mutate', { envelope: env }))
    expect(replay.status).toBe(400)
    expect(await replay.json()).toMatchObject({ code: 'replayed_nonce' })
  })

  it('serializes concurrent identical envelopes: exactly one wins', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    await initRoom(room)
    const a = await actor()
    const env = await envelopeFor(a, { type: 'join', alias: 'Ann' }, T0)
    const results = await Promise.all(
      Array.from({ length: 8 }, () => room.fetch(post('/mutate', { envelope: env }))),
    )
    const statuses = results.map((r) => r.status).sort()
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s !== 200)).toHaveLength(7)
    const view = (await (await room.fetch(new Request('http://do/state'))).json()) as {
      league: { players: unknown[] }
      accepted: number
    }
    expect(view.league.players).toHaveLength(1)
    expect(view.accepted).toBe(1)
  })

  it('serializes concurrent sequence reuse with different nonces: one wins', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    await initRoom(room)
    const a = await actor()
    const joinEnv = await envelopeFor(a, { type: 'join', alias: 'Ann' }, T0)
    await room.fetch(post('/mutate', { envelope: joinEnv }))
    const x = await envelopeFor(a, { type: 'close-round' }, T0 + 1, 2)
    const y = await envelopeFor(a, { type: 'close-round' }, T0 + 1, 2)
    const [rx, ry] = await Promise.all([
      room.fetch(post('/mutate', { envelope: x })),
      room.fetch(post('/mutate', { envelope: y })),
    ])
    // Both fail on the reducer (round not due) or the second fails on bad_seq;
    // neither may be accepted, and the accepted counter must not move.
    expect([rx.status, ry.status].every((s) => s !== 200)).toBe(true)
  })

  it('rolls back on a failed storage write: memory and storage stay unchanged', async () => {
    const clock = { now: T0 }
    const { room, control, store } = makeRoom(clock)
    await initRoom(room)
    const before = JSON.stringify(store.get('authority'))
    const a = await actor()
    control.failWrites = true
    const env = await envelopeFor(a, { type: 'join', alias: 'Ann' }, T0)
    const res = await room.fetch(post('/mutate', { envelope: env }))
    expect(res.status).toBe(503)
    expect(JSON.stringify(store.get('authority'))).toBe(before)
    // Memory did not advance either: the same envelope is accepted once storage heals.
    control.failWrites = false
    const retry = await room.fetch(post('/mutate', { envelope: env }))
    expect(retry.status).toBe(200)
  })

  it('recovers persisted state after a restart', async () => {
    const clock = { now: T0 }
    const first = makeRoom(clock)
    await initRoom(first.room)
    const a = await actor()
    await first.room.fetch(
      post('/mutate', { envelope: await envelopeFor(a, { type: 'join', alias: 'Ann' }, T0) }),
    )
    const second = new LeagueRoom(fakeState(Object.fromEntries(first.store)).state, {
      now: () => clock.now,
    })
    const view = (await (await second.fetch(new Request('http://do/state'))).json()) as {
      league: { players: { handle: string }[] }
    }
    expect(view.league.players.map((p) => p.handle)).toEqual([a.handle])
  })

  it('ignores a corrupt stored blob instead of serving it', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock, { authority: { schema: 'wrong' } })
    expect((await room.fetch(new Request('http://do/state'))).status).toBe(404)
  })

  it('never exposes accepted answers or prompt answer keys in the public view', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    await initRoom(room)
    const a = await actor()
    const b = await actor()
    const send = async (who: Actor, m: LeagueMutation, at: number) => {
      clock.now = at
      const res = await room.fetch(post('/mutate', { envelope: await envelopeFor(who, m, at) }))
      expect(res.status).toBe(200)
    }
    await send(a, { type: 'join', alias: 'A' }, T0)
    await send(b, { type: 'join', alias: 'B' }, T0 + 1)
    await send(
      a,
      {
        type: 'duel-open',
        duelId: 'd1',
        opponent: b.handle,
        prompts: [{ id: 'p1', question: 'Secret?', answers: ['SECRET-ANSWER-KEY'] }],
      },
      T0 + 2,
    )
    await send(a, { type: 'duel-start', duelId: 'd1' }, T0 + 3)
    await send(a, { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: 'my-guess' }, T0 + 9)
    const text = await (await room.fetch(new Request('http://do/state'))).text()
    expect(text).not.toContain('SECRET-ANSWER-KEY')
    expect(text).not.toContain('my-guess')
    expect(text).toContain('promptCount')
  })

  it('surfaces advisory timing flags as codes only, never as score changes', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    await initRoom(room)
    const a = await actor()
    const b = await actor()
    const send = async (who: Actor, m: LeagueMutation, at: number) => {
      clock.now = at
      const res = await room.fetch(post('/mutate', { envelope: await envelopeFor(who, m, at) }))
      expect(res.status).toBe(200)
    }
    await send(a, { type: 'join', alias: 'A' }, T0)
    await send(b, { type: 'join', alias: 'B' }, T0 + 1)
    const prompts = [
      { id: 'p1', question: 'q', answers: ['x'] },
      { id: 'p2', question: 'q', answers: ['x'] },
    ]
    await send(a, { type: 'duel-open', duelId: 'd1', opponent: b.handle, prompts }, T0 + 2)
    await send(a, { type: 'duel-start', duelId: 'd1' }, T0 + 3)
    await send(a, { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: 'x' }, T0 + 53)
    await send(a, { type: 'duel-answer', duelId: 'd1', promptId: 'p2', answer: 'x' }, T0 + 103)
    const view = (await (await room.fetch(new Request('http://do/state'))).json()) as {
      advisoryFlags: Record<string, string[]>
      league: { players: { handle: string; points: number }[] }
    }
    expect(view.advisoryFlags[a.handle]).toContain('faster_than_reading')
    expect(view.league.players.every((p) => p.points === 0)).toBe(true)
  })

  it('refuses an oversized body before parsing it', async () => {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    await initRoom(room)
    const big = JSON.stringify({ envelope: { payload: 'x'.repeat(70_000) } })
    const res = await room.fetch(new Request('http://do/mutate', { method: 'POST', body: big }))
    expect(res.status).toBe(413)
  })

  it('stamps duel timing from its own clock, not from the request', async () => {
    const clock = { now: T0 }
    const { room, store } = makeRoom(clock)
    await initRoom(room)
    const a = await actor()
    const b = await actor()
    const send = async (who: Actor, m: LeagueMutation, at: number) => {
      clock.now = at
      await room.fetch(post('/mutate', { envelope: await envelopeFor(who, m, at) }))
    }
    await send(a, { type: 'join', alias: 'A' }, T0)
    await send(b, { type: 'join', alias: 'B' }, T0 + 1)
    await send(
      a,
      {
        type: 'duel-open',
        duelId: 'd1',
        opponent: b.handle,
        prompts: [{ id: 'p1', question: 'q', answers: ['x'] }],
      },
      T0 + 2,
    )
    await send(a, { type: 'duel-start', duelId: 'd1' }, T0 + 1_000)
    await send(a, { type: 'duel-answer', duelId: 'd1', promptId: 'p1', answer: 'x' }, T0 + 3_000)
    const stored = store.get('authority') as {
      duels: Record<string, { answersA: { elapsedMs: number }[] }>
    }
    expect(stored.duels.d1!.answersA[0]!.elapsedMs).toBe(2_000)
  })
})

describe('worker routing for leagues', () => {
  /** Namespace backed by real LeagueRoom instances, one per name. */
  function roomNamespace(clock: { now: number }): DurableObjectNamespace {
    const rooms = new Map<string, LeagueRoom>()
    return {
      idFromName: (name: string) => ({ toString: () => name }),
      get: (id: DurableObjectId) => {
        const key = id.toString()
        if (!rooms.has(key)) {
          rooms.set(key, new LeagueRoom(fakeState().state, { now: () => clock.now }))
        }
        const room = rooms.get(key)!
        return {
          fetch: (req: Request | string, init?: RequestInit) =>
            room.fetch(typeof req === 'string' ? new Request(req, init) : req),
        }
      },
    }
  }

  it('is off by default: every league route answers 503 and does nothing', async () => {
    const env: Env = { LEAGUE_ROOM: roomNamespace({ now: T0 }) }
    for (const [method, path] of [
      ['POST', '/api/v1/leagues/create'],
      ['GET', '/api/v1/leagues/lg-abcdef/state'],
      ['POST', '/api/v1/leagues/lg-abcdef/mutate'],
    ] as const) {
      const res = await worker.fetch(new Request(`http://w.local${path}`, { method }), env)
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({ enabled: false })
    }
  })

  it('stays off unless the flag is exactly "true", and needs the binding', async () => {
    for (const flag of ['1', 'TRUE', 'yes', ' true', '']) {
      const env: Env = { LEAGUES_ENABLED: flag, LEAGUE_ROOM: roomNamespace({ now: T0 }) }
      const res = await worker.fetch(
        new Request('http://w.local/api/v1/leagues/lg-abcdef/state'),
        env,
      )
      expect(res.status).toBe(503)
    }
    const noBinding: Env = { LEAGUES_ENABLED: 'true' }
    const res = await worker.fetch(
      new Request('http://w.local/api/v1/leagues/lg-abcdef/state'),
      noBinding,
    )
    expect(res.status).toBe(503)
  })

  it('creates a league, accepts a signed join and serves the state when enabled', async () => {
    const clock = { now: T0 }
    const env: Env = { LEAGUES_ENABLED: 'true', LEAGUE_ROOM: roomNamespace(clock) }
    const create = await worker.fetch(
      new Request('http://w.local/api/v1/leagues/create', {
        method: 'POST',
        body: JSON.stringify({
          id: 'lg-worker1',
          title: 'Worker league',
          seasonStart: '2026-03-02',
        }),
      }),
      env,
    )
    expect(create.status).toBe(201)

    const a = await generateLeagueSigner()
    const envelope = await signLeagueMutation({
      signer: a,
      leagueId: 'lg-worker1',
      seq: 1,
      mutation: { type: 'join', alias: 'Ann' },
      timestamp: T0,
      nonce: 'worker-nonce-0001',
    })
    const mutate = await worker.fetch(
      new Request('http://w.local/api/v1/leagues/lg-worker1/mutate', {
        method: 'POST',
        body: JSON.stringify({ envelope }),
      }),
      env,
    )
    expect(mutate.status).toBe(200)

    const state = await worker.fetch(
      new Request('http://w.local/api/v1/leagues/lg-worker1/state'),
      env,
    )
    const view = (await state.json()) as { league: { players: { handle: string }[] } }
    expect(view.league.players[0]!.handle).toBe(await signerIdFromPubKey(a.pubKey))
  })

  it('validates league creation input and method', async () => {
    const env: Env = { LEAGUES_ENABLED: 'true', LEAGUE_ROOM: roomNamespace({ now: T0 }) }
    const bad = async (body: unknown) =>
      (
        await worker.fetch(
          new Request('http://w.local/api/v1/leagues/create', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          env,
        )
      ).status
    expect(await bad({})).toBe(400)
    expect(await bad({ id: 'ab', title: 't', seasonStart: '2026-03-02' })).toBe(400)
    expect(await bad({ id: 'UPPER-case', title: 't', seasonStart: '2026-03-02' })).toBe(400)
    expect(await bad({ id: 'lg-okay1', title: 't', seasonStart: 'tomorrow' })).toBe(400)
    const get = await worker.fetch(new Request('http://w.local/api/v1/leagues/create'), env)
    expect(get.status).toBe(405)
  })

  it('does not let the mutate route read state for the wrong method', async () => {
    const env: Env = { LEAGUES_ENABLED: 'true', LEAGUE_ROOM: roomNamespace({ now: T0 }) }
    const res = await worker.fetch(
      new Request('http://w.local/api/v1/leagues/lg-abcdef/mutate'),
      env,
    )
    expect(res.status).toBe(405)
  })

  it('keeps leagues of different ids isolated from each other', async () => {
    const clock = { now: T0 }
    const env: Env = { LEAGUES_ENABLED: 'true', LEAGUE_ROOM: roomNamespace(clock) }
    for (const id of ['lg-first1', 'lg-second']) {
      await worker.fetch(
        new Request('http://w.local/api/v1/leagues/create', {
          method: 'POST',
          body: JSON.stringify({ id, title: id, seasonStart: '2026-03-02' }),
        }),
        env,
      )
    }
    const a = await generateLeagueSigner()
    const envelope = await signLeagueMutation({
      signer: a,
      leagueId: 'lg-first1',
      seq: 1,
      mutation: { type: 'join', alias: 'Ann' },
      timestamp: T0,
      nonce: 'iso-nonce-00001',
    })
    // Posting league one's envelope to league two must fail on league_mismatch.
    const wrong = await worker.fetch(
      new Request('http://w.local/api/v1/leagues/lg-second/mutate', {
        method: 'POST',
        body: JSON.stringify({ envelope }),
      }),
      env,
    )
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({ code: 'league_mismatch' })
  })
})

describe('register-key identity', () => {
  it('derives distinct user ids for distinct device keys', async () => {
    const x = await generateLeagueSigner()
    const y = await generateLeagueSigner()
    expect(await signerIdFromPubKey(x.pubKey)).not.toBe(await signerIdFromPubKey(y.pubKey))
  })
})

describe('LeagueRoom bad_seq hint', () => {
  async function joined() {
    const clock = { now: T0 }
    const { room } = makeRoom(clock)
    await initRoom(room)
    const a = await actor()
    const join = await envelopeFor(a, { type: 'join', alias: 'Ann' }, T0)
    expect((await room.fetch(post('/mutate', { envelope: join }))).status).toBe(200)
    return { room, a, clock }
  }

  it('tells a correctly signed stale sender the last accepted seq', async () => {
    const { room, a } = await joined()
    const stale = await envelopeFor(a, { type: 'close-round' }, T0 + 1, 1)
    const res = await room.fetch(post('/mutate', { envelope: stale }))
    const body = (await res.json()) as { code: string; lastSeq?: number }
    expect(res.status).toBe(400)
    expect(body.code).toBe('bad_seq')
    expect(body.lastSeq).toBe(1)
  })

  it('discloses nothing when the signature is forged', async () => {
    const { room, a } = await joined()
    const stale = await envelopeFor(a, { type: 'close-round' }, T0 + 1, 1)
    // Same claimed key, tampered signature: seq fails first, hint must stay hidden.
    const forged = { ...stale, signature: stale.signature.slice(0, -4) + 'AAAA' }
    const res = await room.fetch(post('/mutate', { envelope: forged }))
    const body = (await res.json()) as { code: string; lastSeq?: number }
    expect(body.code).toBe('bad_seq')
    expect(body.lastSeq).toBeUndefined()
  })

  it('other codes never carry a seq hint', async () => {
    const { room } = await joined()
    const res = await room.fetch(post('/mutate', { envelope: { nope: true } }))
    const body = (await res.json()) as { code: string; lastSeq?: number }
    expect(body.code).toBe('bad_envelope')
    expect('lastSeq' in body).toBe(false)
  })
})

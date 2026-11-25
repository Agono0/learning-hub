import { describe, expect, it, vi } from 'vitest'
import worker, { isVerifiedItemId, type Env } from '../src/index'
import { StudyRoom } from '../src/study-room'
import {
  digestHex,
  generateIdentityKeyPair,
  joinAssertionPayload,
  requestSigningPayload,
  signIdentityPayload,
} from '@learning-hub/core/identity-crypto'

const HOST = 'w.example'

interface Row {
  id: string
  alias: string
}

/** Fake D1: users by pubkey, library keyed by id (ON CONFLICT DO NOTHING semantics). */
function fakeDb(users: Record<string, Row>) {
  const library = new Map<string, Record<string, unknown>>()
  const inserts: string[] = []
  const db = {
    prepare(sql: string): D1PreparedStatement {
      let vals: D1Value[] = []
      const stmt: D1PreparedStatement = {
        bind(...v: D1Value[]) {
          vals = v
          return stmt
        },
        run: async () => {
          if (sql.includes('INSERT INTO community_library')) {
            inserts.push(String(vals[0]))
            if (!library.has(String(vals[0]))) {
              library.set(String(vals[0]), {
                id: vals[0],
                type: vals[1],
                title: vals[2],
                description: vals[3],
                author: vals[4],
                downloads: vals[5],
                rating: vals[6],
                tags: vals[7],
                share_string: vals[8],
                published_at: vals[9],
              })
            }
          }
          return { success: true }
        },
        all: async <T>() => ({ results: [] as T[] }),
        first: async <T>() => {
          if (sql.includes('FROM users')) return (users[String(vals[0])] as T | undefined) ?? null
          if (sql.includes('FROM community_library')) {
            return (library.get(String(vals[0])) as T | undefined) ?? null
          }
          return null
        },
      }
      return stmt
    },
  } as D1Database
  return { db, library, inserts }
}

async function signedPublish(opts: {
  priv: string
  pub: string
  body: string
  ts?: number
  host?: string
  signBody?: string
}) {
  const ts = opts.ts ?? Date.now()
  const payload = requestSigningPayload({
    method: 'POST',
    host: opts.host ?? HOST,
    pathAndQuery: '/api/v1/library/publish',
    timestamp: ts,
    bodySha256: await digestHex(new TextEncoder().encode(opts.signBody ?? opts.body)),
  })
  const sig = await signIdentityPayload(opts.priv, payload)
  return new Request(`http://${HOST}/api/v1/library/publish`, {
    method: 'POST',
    body: opts.body,
    headers: { 'x-lh-key': opts.pub, 'x-lh-ts': String(ts), 'x-lh-sig': sig },
  })
}

const item = {
  type: 'deck',
  title: 'Cells',
  description: 'd',
  tags: ['bio'],
  shareString: 'LH1:abc',
}

describe('publish authentication', () => {
  it('anonymous publish is labelled Anonymous and ignores caller-set fields', async () => {
    const { db, library } = fakeDb({})
    const body = JSON.stringify({
      ...item,
      id: 'item_evil',
      author: 'Admin',
      rating: 0,
      downloads: 999,
    })
    const res = await worker.fetch(
      new Request(`http://${HOST}/api/v1/library/publish`, { method: 'POST', body }),
      { DB: db, EXPECTED_HOST: HOST } as Env,
    )
    expect(res.status).toBe(200)
    const out = (await res.json()) as {
      item: { id: string; author: string; downloads: number; rating: number }
    }
    expect(out.item.author).toBe('Anonymous')
    expect((out.item as { authorVerified?: boolean }).authorVerified).toBe(false)
    expect(out.item.id).not.toBe('item_evil')
    expect(out.item.downloads).toBe(0)
    expect(out.item.rating).toBe(5)
    expect(library.size).toBe(1)
  })

  it('registered key publishes under the registered alias, and a replay is idempotent', async () => {
    const pair = await generateIdentityKeyPair()
    const { db, library, inserts } = fakeDb({ [pair.publicKey]: { id: 'usr_1', alias: 'Ada' } })
    const body = JSON.stringify({ ...item, author: 'Impostor' })
    const ts = Date.now()
    const make = () => signedPublish({ priv: pair.privateKey, pub: pair.publicKey, body, ts })
    const r1 = await worker.fetch(await make(), { DB: db, EXPECTED_HOST: HOST } as Env)
    const r2 = await worker.fetch(await make(), { DB: db, EXPECTED_HOST: HOST } as Env) // new signature bytes, same payload
    const a = (await r1.json()) as { item: { id: string; author: string } }
    const b = (await r2.json()) as { item: { id: string; author: string } }
    expect(a.item.author).toBe('Ada')
    expect((a.item as { authorVerified?: boolean }).authorVerified).toBe(true)
    expect(b.item.id).toBe(a.item.id)
    expect(new Set(inserts).size).toBe(1)
    expect(library.size).toBe(1)
    // The existing row is returned, never overwritten (downloads counter preserved).
    library.get(a.item.id)!.downloads = 7
    const r3 = await worker.fetch(await make(), { DB: db, EXPECTED_HOST: HOST } as Env)
    expect(((await r3.json()) as { item: { downloads: number } }).item.downloads).toBe(7)
  })

  it('refuses invalid credentials instead of downgrading to anonymous', async () => {
    const pair = await generateIdentityKeyPair()
    const other = await generateIdentityKeyPair()
    const { db, library } = fakeDb({ [pair.publicKey]: { id: 'usr_1', alias: 'Ada' } })
    const body = JSON.stringify(item)
    const cases: Array<[string, Request]> = [
      [
        'tampered body',
        await signedPublish({
          priv: pair.privateKey,
          pub: pair.publicKey,
          body,
          signBody: body + ' ',
        }),
      ],
      ['wrong key', await signedPublish({ priv: other.privateKey, pub: pair.publicKey, body })],
      [
        'stale',
        await signedPublish({
          priv: pair.privateKey,
          pub: pair.publicKey,
          body,
          ts: Date.now() - 3_600_000,
        }),
      ],
      [
        'other audience',
        await signedPublish({
          priv: pair.privateKey,
          pub: pair.publicKey,
          body,
          host: 'evil.example',
        }),
      ],
      [
        'partial headers',
        new Request(`http://${HOST}/api/v1/library/publish`, {
          method: 'POST',
          body,
          headers: { 'x-lh-key': pair.publicKey },
        }),
      ],
    ]
    for (const [name, req] of cases) {
      const res = await worker.fetch(req, { DB: db, EXPECTED_HOST: HOST } as Env)
      expect(res.status, name).toBe(401)
    }
    expect(library.size).toBe(0)
  })

  it('valid signature from an unregistered key is refused (register required)', async () => {
    const pair = await generateIdentityKeyPair()
    const { db, library } = fakeDb({})
    const res = await worker.fetch(
      await signedPublish({
        priv: pair.privateKey,
        pub: pair.publicKey,
        body: JSON.stringify(item),
      }),
      { DB: db, EXPECTED_HOST: HOST } as Env,
    )
    expect(res.status).toBe(403)
    expect(library.size).toBe(0)
  })

  it('a credential cannot be verified without an identity store (503, not anonymous)', async () => {
    const pair = await generateIdentityKeyPair()
    const res = await worker.fetch(
      await signedPublish({
        priv: pair.privateKey,
        pub: pair.publicKey,
        body: JSON.stringify(item),
      }),
      { EXPECTED_HOST: HOST } as Env,
    )
    expect(res.status).toBe(503)
  })

  it('fails closed (503) for credentialed requests when no trusted host is configured', async () => {
    const pair = await generateIdentityKeyPair()
    const { db, library } = fakeDb({ [pair.publicKey]: { id: 'usr_1', alias: 'Ada' } })
    const res = await worker.fetch(
      await signedPublish({
        priv: pair.privateKey,
        pub: pair.publicKey,
        body: JSON.stringify(item),
      }),
      { DB: db } as Env,
    )
    expect(res.status).toBe(503)
    expect(library.size).toBe(0)
    // Anonymous publishing still works without it.
    const anon = await worker.fetch(
      new Request(`http://${HOST}/api/v1/library/publish`, {
        method: 'POST',
        body: JSON.stringify(item),
      }),
      { DB: db } as Env,
    )
    expect(anon.status).toBe(200)
  })

  it('EXPECTED_HOST pins the audience, not the request Host', async () => {
    const pair = await generateIdentityKeyPair()
    const { db } = fakeDb({ [pair.publicKey]: { id: 'usr_1', alias: 'Ada' } })
    const body = JSON.stringify(item)
    const req = await signedPublish({
      priv: pair.privateKey,
      pub: pair.publicKey,
      body,
      host: HOST,
    })
    const res = await worker.fetch(req, { DB: db, EXPECTED_HOST: 'real.example' } as Env)
    expect(res.status).toBe(401)
  })

  it('rejects oversize bodies and invalid items with 4xx', async () => {
    const { db } = fakeDb({})
    const big = await worker.fetch(
      new Request(`http://${HOST}/api/v1/library/publish`, {
        method: 'POST',
        body: 'a'.repeat(600_000),
      }),
      { DB: db, EXPECTED_HOST: HOST } as Env,
    )
    expect(big.status).toBe(413)
    const bad = await worker.fetch(
      new Request(`http://${HOST}/api/v1/library/publish`, {
        method: 'POST',
        body: '{"type":"x"}',
      }),
      { DB: db, EXPECTED_HOST: HOST } as Env,
    )
    expect(bad.status).toBe(400)
  })
})

// ─── Study room join ─────────────────────────────────────────────────────────

function fakeWs(host = HOST) {
  let attachment: unknown = { host }
  const sent: string[] = []
  const ws = {
    sent,
    closed: undefined as string | undefined,
    serializeAttachment: (a: unknown) => {
      attachment = a
    },
    deserializeAttachment: () => attachment,
    send: (m: string) => void sent.push(m),
    close(_c?: number, r?: string) {
      ws.closed = r ?? 'closed'
    },
  }
  return ws as unknown as WebSocket & { sent: string[]; closed?: string }
}

function makeRoom(users: Record<string, Row>, extraEnv: Partial<Env> = {}) {
  const store = new Map<string, unknown>([['room', { code: 'ABC123', participants: [] }]])
  const sockets: WebSocket[] = []
  const state = {
    id: { toString: () => 'r' },
    storage: {
      get: async <T>(k: string) => store.get(k) as T | undefined,
      put: async (k: string, v: unknown) => void store.set(k, v),
      delete: async (k: string) => store.delete(k),
    },
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
    acceptWebSocket: (w: WebSocket) => void sockets.push(w),
    getWebSockets: () => sockets,
  } as unknown as DurableObjectState
  const room = new StudyRoom(state, { DB: fakeDb(users).db, EXPECTED_HOST: HOST, ...extraEnv })
  const connect = () => {
    const ws = fakeWs()
    sockets.push(ws)
    return ws
  }
  const roomState = () =>
    (store.get('room') as { participants: Array<{ id: string; alias: string }> }).participants
  return { room, connect, roomState, store }
}

async function assertion(
  pair: { privateKey: string; publicKey: string },
  over: Partial<{ room: string; exp: number; jti: string; host: string }> = {},
) {
  const exp = over.exp ?? Date.now() + 60_000
  const jti = over.jti ?? `jti-${Math.random().toString(36).slice(2, 12)}`
  const sig = await signIdentityPayload(
    pair.privateKey,
    joinAssertionPayload({ host: over.host ?? HOST, room: over.room ?? 'ABC123', exp, jti }),
  )
  return { key: pair.publicKey, exp, jti, sig }
}

const join = (a?: unknown, participant: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'join',
    participant: { alias: 'Guest', ...participant },
    ...(a ? { assertion: a } : {}),
  })

describe('study room join identity', () => {
  it('anonymous join gets a server-chosen id and cannot pick or replace one', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, roomState } = makeRoom({
      [pair.publicKey]: { id: 'usr_ada', alias: 'Ada' },
    })
    const victim = connect()
    await room.webSocketMessage(victim, join(await assertion(pair)))
    const attacker = connect()
    await room.webSocketMessage(attacker, join(undefined, { id: 'usr_ada', alias: 'Ada' }))
    const ids = roomState().map((p) => p.id)
    expect(ids).toContain('usr_ada')
    expect(ids.filter((i) => i === 'usr_ada')).toHaveLength(1)
    expect(ids.some((i) => /^anon_[0-9a-f]{16}$/.test(i))).toBe(true)
    // The guest is marked unverified even though it copied the registered alias.
    expect(roomState().find((p) => p.id.startsWith('anon_'))).toMatchObject({
      alias: 'Ada',
      verified: false,
    })
  })

  it('a valid assertion for a registered key binds the stored id and alias', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, roomState } = makeRoom({
      [pair.publicKey]: { id: 'usr_ada', alias: 'Ada' },
    })
    await room.webSocketMessage(
      connect(),
      join(await assertion(pair), { id: 'usr_other', alias: 'Mallory' }),
    )
    expect(roomState()).toMatchObject([{ id: 'usr_ada', alias: 'Ada', verified: true }])
  })

  it('refuses replay of the same assertion and keeps the existing participant', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, roomState } = makeRoom({
      [pair.publicKey]: { id: 'usr_ada', alias: 'Ada' },
    })
    const a = await assertion(pair)
    const first = connect()
    await room.webSocketMessage(first, join(a))
    await room.webSocketClose(first) // original disconnects
    const replay = connect()
    await room.webSocketMessage(replay, join(a))
    expect(roomState()).toHaveLength(0)
    expect(replay.closed).toBe('replayed')
  })

  it('a second socket with a fresh assertion cannot take over a live participant', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, roomState } = makeRoom({
      [pair.publicKey]: { id: 'usr_ada', alias: 'Ada' },
    })
    const live = connect()
    await room.webSocketMessage(live, join(await assertion(pair)))
    const thief = connect()
    await room.webSocketMessage(thief, join(await assertion(pair)))
    expect(thief.closed).toBe('already_joined')
    expect(roomState()).toHaveLength(1)
    // Closing the refused socket must not remove the real participant.
    await room.webSocketClose(thief)
    expect(roomState()).toHaveLength(1)
    // A reconnect after the live socket is gone works.
    await room.webSocketClose(live)
    // (live socket still listed by the fake; remove it like the runtime does)
  })

  it('refuses wrong room, wrong audience, expired, too-long and bad signatures (no downgrade)', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, roomState } = makeRoom({
      [pair.publicKey]: { id: 'usr_ada', alias: 'Ada' },
    })
    const bad = [
      await assertion(pair, { room: 'ZZZ999' }),
      await assertion(pair, { host: 'evil.example' }),
      await assertion(pair, { exp: Date.now() - 1000 }),
      await assertion(pair, { exp: Date.now() + 3_600_000 }),
      { ...(await assertion(pair)), sig: (await assertion(pair, { jti: 'other-jti-1' })).sig },
    ]
    for (const a of bad) {
      const ws = connect()
      await room.webSocketMessage(ws, join(a))
      expect(ws.closed).toBe('invalid_assertion')
    }
    expect(roomState()).toHaveLength(0)
  })

  it('refuses a valid assertion from an unregistered key', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, roomState } = makeRoom({})
    const ws = connect()
    await room.webSocketMessage(ws, join(await assertion(pair)))
    expect(ws.closed).toBe('register_required')
    expect(roomState()).toHaveLength(0)
  })

  it('a joined socket cannot switch identity with a second join', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, roomState } = makeRoom({
      [pair.publicKey]: { id: 'usr_ada', alias: 'Ada' },
    })
    const ws = connect()
    await room.webSocketMessage(ws, join(undefined, { alias: 'Guest' }))
    const first = roomState()[0]!.id
    await room.webSocketMessage(ws, join(await assertion(pair)))
    expect(roomState().map((p) => p.id)).toEqual([first])
  })

  it('refuses assertions when no trusted host is configured', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, roomState } = makeRoom(
      { [pair.publicKey]: { id: 'usr_ada', alias: 'Ada' } },
      { EXPECTED_HOST: undefined },
    )
    const ws = connect()
    await room.webSocketMessage(ws, join(await assertion(pair)))
    expect(ws.closed).toBe('audience_unconfigured')
    expect(roomState()).toHaveLength(0)
  })

  it('bounds remembered assertion ids and prunes expired ones', async () => {
    const pair = await generateIdentityKeyPair()
    const { room, connect, store } = makeRoom({ [pair.publicKey]: { id: 'usr_ada', alias: 'Ada' } })
    store.set('jtis', {
      old: Date.now() - 1,
      ...Object.fromEntries(Array.from({ length: 999 }, (_, i) => [`k${i}`, Date.now() + 100_000])),
    })
    const ws = connect()
    await room.webSocketMessage(ws, join(await assertion(pair)))
    const jtis = store.get('jtis') as Record<string, number>
    expect(jtis.old).toBeUndefined()
    expect(Object.keys(jtis).length).toBe(1000)
    const ws2 = connect()
    await room.webSocketMessage(ws2, join(await assertion(pair, { jti: 'one-more-jti' })))
    expect(ws2.closed).toBe('busy')
    // Live (unexpired) ids were not evicted to make room: all 1000 are still remembered.
    expect(Object.keys(store.get('jtis') as Record<string, number>).length).toBe(1000)
    expect((store.get('jtis') as Record<string, number>)['one-more-jti']).toBeUndefined()
    vi.restoreAllMocks()
  })
})

describe('isVerifiedItemId', () => {
  it('is true only for ids derived from a signed request digest', () => {
    expect(isVerifiedItemId(`item_${'a'.repeat(32)}`)).toBe(true)
    expect(isVerifiedItemId('item_1764110000000_ab12')).toBe(false) // anonymous and legacy shape
    expect(isVerifiedItemId('item_evil')).toBe(false)
    expect(isVerifiedItemId(undefined)).toBe(false)
  })
})

describe('library attribution invariant', () => {
  const env = (db: D1Database) => ({ DB: db, EXPECTED_HOST: HOST }) as Env
  type Row = { id: string; author: string; title: string; downloads: number }

  it('an unsigned client cannot choose a digest-shaped id or overwrite a verified row', async () => {
    const pair = await generateIdentityKeyPair()
    const { db, library } = fakeDb({ [pair.publicKey]: { id: 'usr_1', alias: 'Ada' } })
    const r1 = await worker.fetch(
      await signedPublish({
        priv: pair.privateKey,
        pub: pair.publicKey,
        body: JSON.stringify(item),
      }),
      env(db),
    )
    const verified = ((await r1.json()) as { item: Row }).item
    expect(isVerifiedItemId(verified.id)).toBe(true)

    // Unsigned: tries to publish with the verified row's exact id and a spoofed author.
    const evil = JSON.stringify({ ...item, title: 'Hijack', id: verified.id, author: 'Ada' })
    const r2 = await worker.fetch(
      new Request(`http://${HOST}/api/v1/library/publish`, { method: 'POST', body: evil }),
      env(db),
    )
    const anon = ((await r2.json()) as { item: Row & { authorVerified?: boolean } }).item
    expect(anon.id).not.toBe(verified.id)
    expect(isVerifiedItemId(anon.id)).toBe(false)
    expect(anon.authorVerified).toBe(false)
    expect(anon.author).toBe('Anonymous')
    // The verified row is untouched.
    expect(library.get(verified.id)).toMatchObject({ title: 'Cells', author: 'Ada' })
  })

  it('every anonymous id (many samples) is non-digest-shaped', async () => {
    const { db, library } = fakeDb({})
    for (let i = 0; i < 25; i++) {
      await worker.fetch(
        new Request(`http://${HOST}/api/v1/library/publish`, {
          method: 'POST',
          body: JSON.stringify({ ...item, title: `t${i}` }),
        }),
        env(db),
      )
    }
    expect(library.size).toBe(25)
    for (const id of library.keys()) expect(isVerifiedItemId(id)).toBe(false)
  })

  it('a signed replay returns the stored author and content, not a changed alias', async () => {
    const pair = await generateIdentityKeyPair()
    const users: Record<string, { id: string; alias: string }> = {
      [pair.publicKey]: { id: 'usr_1', alias: 'Ada' },
    }
    const { db } = fakeDb(users)
    const body = JSON.stringify(item)
    const ts = Date.now()
    const a = (
      (await (
        await worker.fetch(
          await signedPublish({ priv: pair.privateKey, pub: pair.publicKey, body, ts }),
          env(db),
        )
      ).json()) as { item: Row }
    ).item
    users[pair.publicKey]!.alias = 'Renamed'
    const b = (
      (await (
        await worker.fetch(
          await signedPublish({ priv: pair.privateKey, pub: pair.publicKey, body, ts }),
          env(db),
        )
      ).json()) as { item: Row }
    ).item
    expect(b.id).toBe(a.id)
    expect(b.author).toBe('Ada')
    expect(b.title).toBe(a.title)
  })
})

/**
 * /api/leagues/remote against an isolated temp database. The remote authority
 * is faked at the fetch boundary, but it verifies every envelope with the
 * real core verifier, so a passing test proves the stored device key signs in
 * exactly the format the worker's LeagueRoom checks.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-leagues-remote-')), 'api.db')

const SERVER = 'https://league.example.dev'
const LEAGUE = 'lg-remote-01'

type Mod = typeof import('@/server/handlers/leagues/remote/route')
let H: Mod
let setRemoteFetch: typeof import('@/server/net').setRemoteFetch
let db: (typeof import('@learning-hub/db'))['db']
let tables: typeof import('@learning-hub/db')
let core: typeof import('@learning-hub/core')

beforeAll(async () => {
  H = await import('@/server/handlers/leagues/remote/route')
  ;({ setRemoteFetch } = await import('@/server/net'))
  tables = await import('@learning-hub/db')
  db = tables.db
  core = await import('@learning-hub/core')
})

beforeEach(() => {
  db.delete(tables.leagueRemoteQueues).run()
  db.delete(tables.leagueRemoteLinks).run()
  delete process.env.LH_REMOTE_LEAGUES
})

afterEach(() => {
  delete process.env.LH_REMOTE_LEAGUES
  setRemoteFetch((url, init) => fetch(url, init))
})

const post = (body: unknown) =>
  new Request('http://x/api/leagues/remote', { method: 'POST', body: JSON.stringify(body) })

async function enableWithDeviceKey() {
  process.env.LH_REMOTE_LEAGUES = '1'
  const pair = await core.generateIdentityKeyPair()
  tables.updateOnlineIdentity({
    mode: 'device_key',
    pubKey: pair.publicKey,
    privKey: pair.privateKey,
  })
  return pair
}

/** Fake authority: verifies envelopes with the real verifier, tracks the ledger. */
function fakeAuthority(opts: { failWith?: number } = {}) {
  const seen = { nonces: new Set<string>(), lastSeq: new Map<string, number>(), calls: 0 }
  const seenUrls: string[] = []
  setRemoteFetch(async (url, init) => {
    seen.calls++
    seenUrls.push(url)
    if (opts.failWith) return new Response('{"error":"boom"}', { status: opts.failWith })
    if (url.endsWith('/state')) return Response.json({ ok: true, league: { id: LEAGUE } })
    const { envelope } = JSON.parse(String(init?.body)) as { envelope: unknown }
    const verified = await core.verifyLeagueEnvelope({
      envelope,
      expectedLeagueId: LEAGUE,
      now: Date.now(),
      ledger: {
        hasNonce: (n) => seen.nonces.has(n),
        lastSeq: (s) => seen.lastSeq.get(s) ?? 0,
      },
      verify: core.webCryptoVerifier,
    })
    if (!verified.ok) return Response.json({ ok: false, code: verified.code }, { status: 400 })
    seen.nonces.add(verified.nonce)
    seen.lastSeq.set(verified.signer, verified.seq)
    return Response.json({ ok: true, effects: ['joined'], accepted: seen.lastSeq.size })
  })
  return { seen, seenUrls }
}

describe('gate', () => {
  it('answers 503 and sends nothing unless LH_REMOTE_LEAGUES is exactly "1"', async () => {
    const { seen } = fakeAuthority()
    for (const flag of [undefined, '', '0', 'true', 'yes', ' 1']) {
      if (flag === undefined) delete process.env.LH_REMOTE_LEAGUES
      else process.env.LH_REMOTE_LEAGUES = flag
      const res = await H.POST(post({ action: 'link', serverUrl: SERVER, remoteLeagueId: LEAGUE }))
      expect(res.status, String(flag)).toBe(503)
      expect(await res.json()).toMatchObject({ enabled: false })
    }
    expect(seen.calls).toBe(0)
    expect(tables.listRemoteLinks()).toHaveLength(0)
  })

  it('GET reports disabled with no links by default', async () => {
    const res = await H.GET(new Request('http://x/api/leagues/remote'))
    expect(await res.json()).toMatchObject({ ok: true, enabled: false, links: [] })
  })
})

describe('link', () => {
  it('links once and validates the server URL and league id', async () => {
    process.env.LH_REMOTE_LEAGUES = '1'
    const ok = await H.POST(
      post({ action: 'link', serverUrl: `${SERVER}/`, remoteLeagueId: LEAGUE }),
    )
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ serverUrl: SERVER, remoteLeagueId: LEAGUE })
    await H.POST(post({ action: 'link', serverUrl: SERVER, remoteLeagueId: LEAGUE }))
    expect(tables.listRemoteLinks()).toHaveLength(1)
    const badUrl = await H.POST(
      post({ action: 'link', serverUrl: 'http://evil.example', remoteLeagueId: LEAGUE }),
    )
    expect(badUrl.status).toBe(400)
    const badId = await H.POST(post({ action: 'link', serverUrl: SERVER, remoteLeagueId: 'NOPE' }))
    expect(badId.status).toBe(400)
  })

  it('rejects an unknown action and an unknown mutation type', async () => {
    process.env.LH_REMOTE_LEAGUES = '1'
    expect((await H.POST(post({ action: 'drop-table' }))).status).toBe(400)
    const res = await H.POST(
      post({
        action: 'mutate',
        serverUrl: SERVER,
        remoteLeagueId: LEAGUE,
        mutation: { type: 'set-points', points: 9999 },
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('mutate', () => {
  it('requires a device key identity before signing anything', async () => {
    process.env.LH_REMOTE_LEAGUES = '1'
    tables.updateOnlineIdentity({ mode: 'offline', pubKey: null, privKey: null })
    const { seen } = fakeAuthority()
    const res = await H.POST(
      post({
        action: 'mutate',
        serverUrl: SERVER,
        remoteLeagueId: LEAGUE,
        mutation: { type: 'join', alias: 'Ann' },
      }),
    )
    expect(res.status).toBe(409)
    expect(seen.calls).toBe(0)
  })

  it('signs with the stored device key in the format the authority verifies', async () => {
    await enableWithDeviceKey()
    const { seen, seenUrls } = fakeAuthority()
    const res = await H.POST(
      post({
        action: 'mutate',
        serverUrl: SERVER,
        remoteLeagueId: LEAGUE,
        mutation: { type: 'join', alias: 'Ann' },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, code: 'ok', seq: 1, nextSeq: 2 })
    expect(seenUrls[0]).toBe(`${SERVER}/api/v1/leagues/${LEAGUE}/mutate`)
    expect(seen.lastSeq.size).toBe(1)
  })

  it('uses strictly increasing sequence numbers across calls', async () => {
    await enableWithDeviceKey()
    const { seen } = fakeAuthority()
    const send = () =>
      H.POST(
        post({
          action: 'mutate',
          serverUrl: SERVER,
          remoteLeagueId: LEAGUE,
          mutation: { type: 'close-round' },
        }),
      )
    const seqs: number[] = []
    for (let i = 0; i < 3; i++) seqs.push(((await (await send()).json()) as { seq: number }).seq)
    expect(seqs).toEqual([1, 2, 3])
    expect([...seen.lastSeq.values()]).toEqual([3])
  })

  it('records the authority rejection code and returns 409', async () => {
    await enableWithDeviceKey()
    setRemoteFetch(async () => Response.json({ ok: false, code: 'round_not_due' }, { status: 409 }))
    const res = await H.POST(
      post({
        action: 'mutate',
        serverUrl: SERVER,
        remoteLeagueId: LEAGUE,
        mutation: { type: 'close-round' },
      }),
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ ok: false, code: 'round_not_due' })
    expect(tables.getRemoteLink(SERVER, LEAGUE)?.lastStatus).toBe('round_not_due')
  })

  it('reports an unreachable authority as 502 and still burns the sequence number', async () => {
    await enableWithDeviceKey()
    setRemoteFetch(async () => {
      throw new Error('network down')
    })
    const res = await H.POST(
      post({
        action: 'mutate',
        serverUrl: SERVER,
        remoteLeagueId: LEAGUE,
        mutation: { type: 'join', alias: 'Ann' },
      }),
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ code: 'unreachable', seq: 1 })
    expect(tables.getRemoteLink(SERVER, LEAGUE)?.nextSeq).toBe(2)
  })

  it('never follows an authority redirect: manual mode, one call, 502 redirected message', async () => {
    await enableWithDeviceKey()
    const calls: (RequestInit | undefined)[] = []
    setRemoteFetch(async (_url, init) => {
      calls.push(init)
      return new Response(null, { status: 307, headers: { location: 'http://10.0.0.5/mutate' } })
    })
    const res = await H.POST(
      post({
        action: 'mutate',
        serverUrl: SERVER,
        remoteLeagueId: LEAGUE,
        mutation: { type: 'join', alias: 'Ann' },
      }),
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.redirect).toBe('manual')
    expect(res.status).toBe(502)
    expect(await res.clone().json()).toMatchObject({
      code: 'authority_redirected',
      remote: { error: expect.stringMatching(/redirected.*update the server URL/) },
    })
  })

  it('maps authority 5xx to 502 and survives a non-JSON reply', async () => {
    await enableWithDeviceKey()
    setRemoteFetch(async () => new Response('<html>oops</html>', { status: 500 }))
    const res = await H.POST(
      post({
        action: 'mutate',
        serverUrl: SERVER,
        remoteLeagueId: LEAGUE,
        mutation: { type: 'join', alias: 'Ann' },
      }),
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ ok: false, code: 'http_500' })
  })

  it('never returns key material', async () => {
    const pair = await enableWithDeviceKey()
    fakeAuthority()
    const res = await H.POST(
      post({
        action: 'mutate',
        serverUrl: SERVER,
        remoteLeagueId: LEAGUE,
        mutation: { type: 'join', alias: 'Ann' },
      }),
    )
    const text = await res.text()
    expect(text).not.toContain(pair.privateKey)
    const list = await (await H.GET(new Request('http://x/api/leagues/remote'))).text()
    expect(list).not.toContain(pair.privateKey)
  })
})

describe('state', () => {
  it('proxies the authority state read without signing', async () => {
    process.env.LH_REMOTE_LEAGUES = '1'
    const { seenUrls } = fakeAuthority()
    const res = await H.POST(post({ action: 'state', serverUrl: SERVER, remoteLeagueId: LEAGUE }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, remote: { league: { id: LEAGUE } } })
    expect(seenUrls[0]).toBe(`${SERVER}/api/v1/leagues/${LEAGUE}/state`)
  })
})

describe('offline queue: enqueue, queue, sync', () => {
  const T = { serverUrl: SERVER, remoteLeagueId: LEAGUE }
  const join = (alias: string) => ({ type: 'join', alias })

  it('enqueue is gated, validated, and stores without sending or signing', async () => {
    const { seen } = fakeAuthority()
    // gate
    const off = await H.POST(post({ action: 'enqueue', ...T, mutation: join('Ann') }))
    expect(off.status).toBe(503)
    process.env.LH_REMOTE_LEAGUES = '1'
    // unknown mutation type never reaches storage
    const bad = await H.POST(
      post({ action: 'enqueue', ...T, mutation: { type: 'set-points', points: 1 } }),
    )
    expect(bad.status).toBe(400)
    const ok = await H.POST(post({ action: 'enqueue', ...T, mutation: join('Ann') }))
    expect(ok.status).toBe(202)
    expect(await ok.json()).toMatchObject({ ok: true, queue: { pending: 1 } })
    expect(seen.calls).toBe(0)
    const q = await (await H.POST(post({ action: 'queue', ...T }))).json()
    expect(q).toMatchObject({ ok: true, recovered: false, queue: { pending: 1 } })
  })

  it('sync needs a device key and sends nothing without one', async () => {
    process.env.LH_REMOTE_LEAGUES = '1'
    tables.updateOnlineIdentity({ mode: 'offline', pubKey: null, privKey: null })
    const { seen } = fakeAuthority()
    await H.POST(post({ action: 'enqueue', ...T, mutation: join('Ann') }))
    const res = await H.POST(post({ action: 'sync', ...T }))
    expect(res.status).toBe(409)
    expect(seen.calls).toBe(0)
  })

  it('sync signs queued work with the device key and clears it on acceptance', async () => {
    await enableWithDeviceKey()
    const { seen } = fakeAuthority()
    await H.POST(post({ action: 'enqueue', ...T, mutation: join('Ann') }))
    const res = await H.POST(post({ action: 'sync', ...T }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, attempted: 1, queue: { pending: 0 } })
    expect(seen.lastSeq.size).toBe(1)
    const link = tables.listRemoteLinks()[0]!
    expect(link.nextSeq).toBe(2)
    expect(link.lastStatus).toBe('ok')
    // Nothing is due now: a second sync sends nothing.
    const again = await (await H.POST(post({ action: 'sync', ...T }))).json()
    expect(again.attempted).toBe(0)
  })

  it('an unreachable authority keeps the item and schedules a retry', async () => {
    await enableWithDeviceKey()
    setRemoteFetch(async () => {
      throw new Error('offline')
    })
    await H.POST(post({ action: 'enqueue', ...T, mutation: join('Ann') }))
    const res = await H.POST(post({ action: 'sync', ...T }))
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, attempted: 1, queue: { pending: 1 } })
    expect(body.nextWakeAt).toBeGreaterThan(Date.now())
    expect(tables.listRemoteLinks()[0]!.lastStatus).toBe('transport-error')
    // The reserved sequence is spent even though the send failed: gaps are safe.
    expect(tables.listRemoteLinks()[0]!.nextSeq).toBe(2)
  })

  it('a corrupt stored queue is reset, reported, and does not block the route', async () => {
    process.env.LH_REMOTE_LEAGUES = '1'
    const link = tables.linkRemoteLeague({ serverUrl: SERVER, remoteLeagueId: LEAGUE })
    db.insert(tables.leagueRemoteQueues).values({ linkId: link.id, queueJson: 'garbage' }).run()
    const q = await (await H.POST(post({ action: 'queue', ...T }))).json()
    expect(q).toMatchObject({ ok: true, recovered: true, queue: { pending: 0 } })
  })
})

describe('membership mutations through the route', () => {
  const T = { serverUrl: SERVER, remoteLeagueId: LEAGUE }
  const CODE = 'z'.repeat(32)
  const storedQueueJson = () =>
    tables
      .listRemoteLinks()
      .map((l) => tables.loadLeagueQueue(l.id).queue)
      .map((q) => JSON.stringify(q))
      .join('\n')

  it('accepts leave, rename and invite mutations and rejects malformed ones', async () => {
    process.env.LH_REMOTE_LEAGUES = '1'
    const digest = 'ef'.repeat(32)
    for (const mutation of [
      { type: 'leave' },
      { type: 'rename', alias: 'Ann B' },
      { type: 'invite-create', digest, maxUses: 2, ttlMs: 3_600_000 },
      { type: 'invite-revoke', digest },
      { type: 'invite-policy', required: true },
    ]) {
      const res = await H.POST(post({ action: 'enqueue', ...T, mutation }))
      expect(res.status).toBe(202)
    }
    for (const mutation of [
      { type: 'invite-create', digest: 'short', maxUses: 2, ttlMs: 3_600_000 },
      { type: 'invite-create', digest, maxUses: 500, ttlMs: 3_600_000 },
      { type: 'rename', alias: '' },
      { type: 'join', alias: 'A', invite: 'short' },
    ]) {
      const res = await H.POST(post({ action: 'enqueue', ...T, mutation }))
      expect(res.status).toBe(400)
    }
    const q = await (await H.POST(post({ action: 'queue', ...T }))).json()
    expect(q.queue.pending).toBe(5)
  })

  it('never echoes an invite code in an enqueue or queue response', async () => {
    process.env.LH_REMOTE_LEAGUES = '1'
    const enq = await H.POST(
      post({ action: 'enqueue', ...T, mutation: { type: 'join', alias: 'Bo', invite: CODE } }),
    )
    expect(await enq.text()).not.toContain(CODE)
    const q = await H.POST(post({ action: 'queue', ...T }))
    expect(await q.text()).not.toContain(CODE)
    const get = await H.GET(new Request('http://x/api/leagues/remote'))
    expect(await get.text()).not.toContain(CODE)
  })

  it('keeps the code while the join waits and scrubs it once the authority accepts', async () => {
    await enableWithDeviceKey()
    fakeAuthority()
    await H.POST(
      post({ action: 'enqueue', ...T, mutation: { type: 'join', alias: 'Bo', invite: CODE } }),
    )
    expect(storedQueueJson()).toContain(CODE)
    const res = await H.POST(post({ action: 'sync', ...T }))
    expect(res.status).toBe(200)
    expect(storedQueueJson()).not.toContain(CODE)
  })

  it('keeps the code when the authority is unreachable so a retry can still join', async () => {
    await enableWithDeviceKey()
    setRemoteFetch(async () => {
      throw new Error('offline')
    })
    await H.POST(
      post({ action: 'enqueue', ...T, mutation: { type: 'join', alias: 'Bo', invite: CODE } }),
    )
    await H.POST(post({ action: 'sync', ...T }))
    expect(storedQueueJson()).toContain(CODE)
  })

  it('scrubs the code after a refused join and blocks the rename queued behind it', async () => {
    await enableWithDeviceKey()
    setRemoteFetch(async () =>
      Response.json({ ok: false, code: 'invite_invalid' }, { status: 409 }),
    )
    await H.POST(
      post({ action: 'enqueue', ...T, mutation: { type: 'join', alias: 'Bo', invite: CODE } }),
    )
    await H.POST(post({ action: 'enqueue', ...T, mutation: { type: 'rename', alias: 'Bobby' } }))
    await H.POST(post({ action: 'sync', ...T }))
    const queue = tables.loadLeagueQueue(tables.listRemoteLinks()[0]!.id).queue
    expect(queue.items[0]!.status).toBe('rejected')
    expect(queue.items[0]!.lastCode).toBe('invite_invalid')
    expect(queue.items[1]!.lastCode).toBe('blocked_by:invite_invalid')
    expect(storedQueueJson()).not.toContain(CODE)
  })

  it('signs an invite-create with the device key without ever sending a code', async () => {
    await enableWithDeviceKey()
    const sent: string[] = []
    setRemoteFetch(async (_url, init) => {
      sent.push(String(init?.body))
      return Response.json({ ok: true, effects: ['invite-created'], accepted: 1 })
    })
    const digest = '12'.repeat(32)
    const res = await H.POST(
      post({
        action: 'mutate',
        ...T,
        mutation: { type: 'invite-create', digest, maxUses: 1, ttlMs: 3_600_000 },
      }),
    )
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain(digest)
  })
})

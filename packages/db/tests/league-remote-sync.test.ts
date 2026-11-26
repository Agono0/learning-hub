import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { generateIdentityKeyPair } from '@learning-hub/core'
import {
  enqueueLeagueMutation,
  fetchRemoteState,
  getRemoteLink,
  initDb,
  leagueRemoteLinks,
  leagueRemoteQueues,
  linkRemoteLeague,
  loadLeagueQueue,
  readBoundedReply,
  remoteBase,
  setDb,
  syncRemoteLeague,
  updateOnlineIdentity,
  MAX_REMOTE_REPLY_BYTES,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
const SERVER = 'https://league.example.dev'
const LEAGUE = 'lg-sync-unit'

beforeAll(async () => {
  db = await initDb({ path: join(mkdtempSync(join(tmpdir(), 'lh-sync-')), 'sync.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(leagueRemoteQueues).run()
  db.delete(leagueRemoteLinks).run()
  updateOnlineIdentity({ mode: 'offline', pubKey: null, privKey: null })
})

async function withKey() {
  const pair = await generateIdentityKeyPair()
  updateOnlineIdentity({ mode: 'device_key', pubKey: pair.publicKey, privKey: pair.privateKey })
}

const link = () => linkRemoteLeague({ serverUrl: SERVER, remoteLeagueId: LEAGUE })

describe('remoteBase', () => {
  it('builds the league path from a normalized link', () => {
    expect(remoteBase({ serverUrl: SERVER, remoteLeagueId: LEAGUE })).toBe(
      `${SERVER}/api/v1/leagues/${LEAGUE}`,
    )
  })
})

describe('readBoundedReply', () => {
  it('parses JSON, and turns junk or oversize into an error object', async () => {
    expect(await readBoundedReply(new Response('{"ok":true}'))).toEqual({ ok: true })
    expect(await readBoundedReply(new Response('<html>'))).toEqual({
      error: 'authority reply was not JSON',
    })
    const big = JSON.stringify({ pad: 'x'.repeat(MAX_REMOTE_REPLY_BYTES) })
    expect(await readBoundedReply(new Response(big))).toEqual({
      error: 'authority reply too large',
    })
  })
})

describe('syncRemoteLeague', () => {
  it('refuses without a device key and sends nothing', async () => {
    const l = link()
    let calls = 0
    const out = await syncRemoteLeague(l, {
      fetch: async () => {
        calls++
        return Response.json({})
      },
    })
    expect(out).toMatchObject({ ok: false, code: 'no_device_key' })
    expect(calls).toBe(0)
  })

  it('sends a queued item with a signed envelope and records ok', async () => {
    await withKey()
    const l = link()
    enqueueLeagueMutation(l.id, { type: 'join', alias: 'Ada' })
    const seen: Array<{ url: string; body: { envelope: Record<string, unknown> } }> = []
    const out = await syncRemoteLeague(l, {
      fetch: async (url, init) => {
        seen.push({ url, body: JSON.parse(String(init?.body)) })
        return Response.json({ ok: true })
      },
    })
    expect(out).toMatchObject({ ok: true, attempted: 1, queue: { pending: 0, rejected: 0 } })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.url).toBe(`${remoteBase(l)}/mutate`)
    expect(JSON.stringify(seen[0]!.body.envelope)).toContain('"signature"')
    expect(getRemoteLink(SERVER, LEAGUE)).toMatchObject({ lastStatus: 'ok', nextSeq: 2 })
  })

  it('keeps the item pending when the network fails, and never lowers the sequence', async () => {
    await withKey()
    const l = link()
    enqueueLeagueMutation(l.id, { type: 'rename', alias: 'Ada' })
    const down = await syncRemoteLeague(l, {
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(down).toMatchObject({ ok: true, attempted: 1, queue: { pending: 1 } })
    const afterDown = getRemoteLink(SERVER, LEAGUE)!
    expect(afterDown.nextSeq).toBeGreaterThanOrEqual(2)
    expect(afterDown.lastStatus).not.toBe('ok')
    expect(loadLeagueQueue(l.id).queue.items).toHaveLength(1)
  })

  it('records a permanent refusal as rejected and stops retrying it', async () => {
    await withKey()
    const l = link()
    enqueueLeagueMutation(l.id, { type: 'invite-policy', required: true })
    const out = await syncRemoteLeague(getRemoteLink(SERVER, LEAGUE)!, {
      fetch: async () => Response.json({ ok: false, code: 'not_founder' }, { status: 409 }),
    })
    expect(out).toMatchObject({ ok: true, queue: { pending: 0, rejected: 1 } })
    const again = await syncRemoteLeague(getRemoteLink(SERVER, LEAGUE)!, {
      fetch: async () => {
        throw new Error('must not be called')
      },
    })
    expect(again).toMatchObject({ ok: true, attempted: 0 })
  })

  it('adopts the authority sequence on bad_seq so the next sync can go through', async () => {
    await withKey()
    const l = link()
    enqueueLeagueMutation(l.id, { type: 'rename', alias: 'Ada' })
    const refused = await syncRemoteLeague(l, {
      fetch: async () => Response.json({ ok: false, code: 'bad_seq', lastSeq: 9 }, { status: 409 }),
    })
    expect(refused.ok).toBe(true)
    expect(getRemoteLink(SERVER, LEAGUE)!.nextSeq).toBeGreaterThanOrEqual(10)
  })
})

describe('fetchRemoteState', () => {
  it('returns the authority view with its status, unsigned', async () => {
    const l = link()
    let init: RequestInit | undefined
    const res = await fetchRemoteState(l, {
      fetch: async (_url, i) => {
        init = i
        return Response.json({ league: { title: 'T' } })
      },
    })
    expect(res).toEqual({ ok: true, status: 200, remote: { league: { title: 'T' } } })
    expect(init?.method).toBeUndefined()
    expect(init?.body).toBeUndefined()
  })

  it('passes a non-OK status through', async () => {
    const res = await fetchRemoteState(link(), {
      fetch: async () => new Response('{"error":"nope"}', { status: 503 }),
    })
    expect(res).toMatchObject({ ok: false, status: 503 })
  })
})

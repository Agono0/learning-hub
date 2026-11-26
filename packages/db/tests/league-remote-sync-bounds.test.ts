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
  AUTHORITY_REDIRECT_MESSAGE,
  isRedirectReply,
  leagueRemoteLinks,
  leagueRemoteQueues,
  linkRemoteLeague,
  loadLeagueQueue,
  readBoundedReply,
  setDb,
  syncRemoteLeague,
  updateOnlineIdentity,
  MAX_REMOTE_REPLY_BYTES,
  type LearningHubDB,
} from '../src/index'

/** Outbound bounds for league authority replies: no followed redirects, streamed byte cap. */
let db: LearningHubDB
const SERVER = 'https://league.example.dev'
const LEAGUE = 'lg-bounds-unit'

beforeAll(async () => {
  db = await initDb({ path: join(mkdtempSync(join(tmpdir(), 'lh-bounds-')), 'b.db') })
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

/** A body that offers `chunks` chunks of `size` bytes and counts how many were pulled. */
function counted(chunks: number, size: number) {
  const state = { pulled: 0, cancelled: false }
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= chunks) return controller.close()
      state.pulled++
      controller.enqueue(new Uint8Array(size).fill(0x20))
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { state, stream }
}

describe('readBoundedReply is a streamed byte cap', () => {
  it('cancels a huge body after about the cap instead of buffering it', async () => {
    const chunk = 8 * 1024
    const total = 100_000 // about 800 MB offered
    const { state, stream } = counted(total, chunk)
    expect(await readBoundedReply(new Response(stream))).toEqual({
      error: 'authority reply too large',
    })
    expect(state.cancelled).toBe(true)
    expect(state.pulled).toBeGreaterThan(MAX_REMOTE_REPLY_BYTES / chunk)
    expect(state.pulled).toBeLessThan(MAX_REMOTE_REPLY_BYTES / chunk + 8)
  })

  it('counts bytes, not characters', async () => {
    const body = JSON.stringify({ v: '€'.repeat(30_000) }) // 90 KB of bytes, 30 K characters
    expect(Buffer.byteLength(body)).toBeGreaterThan(MAX_REMOTE_REPLY_BYTES)
    expect(body.length).toBeLessThan(MAX_REMOTE_REPLY_BYTES)
    expect(await readBoundedReply(new Response(body))).toEqual({
      error: 'authority reply too large',
    })
  })

  it('accepts exactly the cap and keeps the JSON contract', async () => {
    const pad = (n: number) => JSON.stringify({ p: 'a'.repeat(n) })
    const atCap = pad(MAX_REMOTE_REPLY_BYTES - pad(0).length)
    expect(atCap.length).toBe(MAX_REMOTE_REPLY_BYTES)
    expect(await readBoundedReply(new Response(atCap))).toMatchObject({ p: expect.any(String) })
    expect(await readBoundedReply(new Response(atCap + ' '))).toEqual({
      error: 'authority reply too large',
    })
    expect(await readBoundedReply(new Response('<html>'))).toEqual({
      error: 'authority reply was not JSON',
    })
    expect(await readBoundedReply(new Response(null))).toEqual({
      error: 'authority reply was not JSON',
    })
  })
})

describe('redirects from an authority are never followed', () => {
  it('classifies redirect replies', () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(isRedirectReply(new Response(null, { status })), String(status)).toBe(true)
    }
    for (const status of [200, 204, 400, 404, 409, 503]) {
      expect(isRedirectReply(new Response(null, { status })), String(status)).toBe(false)
    }
  })

  it('syncRemoteLeague asks for manual redirects and keeps the item pending on a 307', async () => {
    await withKey()
    const l = link()
    enqueueLeagueMutation(l.id, { type: 'join', alias: 'Ada' })
    const inits: (RequestInit | undefined)[] = []
    const out = await syncRemoteLeague(l, {
      fetch: async (_url, init) => {
        inits.push(init)
        return new Response(null, { status: 307, headers: { location: 'http://10.0.0.5/x' } })
      },
    })
    expect(inits[0]?.redirect).toBe('manual')
    expect(inits).toHaveLength(1) // never re-issued toward the Location
    expect(out).toMatchObject({ ok: true, attempted: 1, queue: { pending: 1, rejected: 0 } })
    // the user is told the authority redirected, not just that it was unreachable
    expect(out).toMatchObject({ notice: AUTHORITY_REDIRECT_MESSAGE })
    expect(AUTHORITY_REDIRECT_MESSAGE).toMatch(/redirected/)
    expect(AUTHORITY_REDIRECT_MESSAGE).toMatch(/update the server URL/)
    expect(loadLeagueQueue(l.id).queue.items).toHaveLength(1)
    // a redirect is a transport failure, not an authority verdict
    expect(getRemoteLink(SERVER, LEAGUE)?.lastStatus).toBe('transport-error')
  })

  it('fetchRemoteState asks for manual redirects and reports a redirect as a failure', async () => {
    let init: RequestInit | undefined
    const res = await fetchRemoteState(link(), {
      fetch: async (_url, i) => {
        init = i
        return new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })
      },
    })
    expect(init?.redirect).toBe('manual')
    expect(res).toEqual({
      ok: false,
      status: 302,
      remote: { error: AUTHORITY_REDIRECT_MESSAGE },
    })
  })
})

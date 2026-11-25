/* eslint-disable @typescript-eslint/no-explicit-any -- test helpers pass JSON payloads around */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dispatch } from '../../../apps/server/src/routes'
import { createChannel, type ChannelManifest } from '../../../packages/core/src/share-channels'
import { createIsolatedTestDb, type TestDbContext } from '../helpers/test-db'

/**
 * Share-channels HOST + PROPOSALS parity suite: exercises local channel
 * hosting (host → get → publish → unhost) and the subscription pull-request
 * flow (propose → list → accept publishes the next version) end to end
 * through the HTTP routes and the SQLite tables.
 */

let server: Server
let baseUrl: string
let testDb: TestDbContext
let manifest: ChannelManifest

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

beforeAll(async () => {
  testDb = createIsolatedTestDb('share-channels-host')
  server = createServer((req, res) => {
    dispatch(req, res).catch((err) => {
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: String(err) }))
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  manifest = createChannel({
    channelId: 'ch-hosted-e2e',
    type: 'deck',
    title: 'Hosted E2E Deck',
    authorHandle: 'owner-e2e',
    visibility: 'link',
    items: [
      { id: 'h1', content: { front: 'Q1?', back: 'A1' } },
      { id: 'h2', content: { front: 'Q2?', back: 'A2' } },
    ],
    now: '2026-01-01T00:00:00Z',
  })
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  testDb?.cleanup()
})

describe('local channel hosting routes', () => {
  it('hosts a channel and serves its manifest', async () => {
    const hosted = await post('/share/host', { manifest })
    expect(hosted.status).toBe(200)
    expect(hosted.json.ok).toBe(true)

    const dup = await post('/share/host', { manifest })
    expect(dup.status).toBe(409)

    const got = await post('/share/host/get', { channelId: manifest.channelId })
    expect(got.status).toBe(200)
    expect(got.json.manifest.currentVersion).toBe(1)
    expect(got.json.manifest.versions[0].items).toHaveLength(2)

    const missing = await post('/share/host/get', { channelId: 'ch-nope' })
    expect(missing.status).toBe(404)
  })

  it('lists hosted channels with version info', async () => {
    const listed = await post('/share/host/list', {})
    expect(listed.status).toBe(200)
    const found = listed.json.channels.find((c: any) => c.channelId === manifest.channelId)
    expect(found).toBeTruthy()
    expect(found.currentVersion).toBe(1)
    expect(found.title).toBe('Hosted E2E Deck')
  })

  it('publishes the next version of a hosted channel', async () => {
    const published = await post('/share/host/publish', {
      channelId: manifest.channelId,
      items: [
        { id: 'h1', content: { front: 'Q1?', back: 'A1' } },
        { id: 'h2', content: { front: 'Q2 edited?', back: 'A2' } },
        { id: 'h3', content: { front: 'Q3?', back: 'A3' } },
      ],
      changelog: 'v2: edit + add',
    })
    expect(published.status).toBe(200)
    expect(published.json.manifest.currentVersion).toBe(2)
    expect(published.json.manifest.versions).toHaveLength(2)

    const got = await post('/share/host/get', { channelId: manifest.channelId })
    expect(got.json.manifest.versions[1].items).toHaveLength(3)
  })
})

describe('subscription pull requests over HTTP', () => {
  let proposalId: string

  it('creates a proposal against the hosted channel', async () => {
    const created = await post('/share/proposals/create', {
      channelId: manifest.channelId,
      authorHandle: 'learner-e2e',
      title: 'Fix h2 wording',
      note: 'typo in the back',
      operations: [
        { kind: 'upsert', item: { id: 'h2', content: { front: 'Q2 fixed?', back: 'A2' } } },
      ],
    })
    expect(created.status).toBe(200)
    expect(created.json.ok).toBe(true)
    proposalId = created.json.proposal.id
    expect(created.json.proposal.baseVersion).toBe(2)
    expect(created.json.proposal.status).toBe('open')
  })

  it('rejects no-op proposals and proposals for unhosted channels', async () => {
    const noop = await post('/share/proposals/create', {
      channelId: manifest.channelId,
      authorHandle: 'learner-e2e',
      title: 'nothing',
      operations: [
        { kind: 'upsert', item: { id: 'h2', content: { front: 'Q2 edited?', back: 'A2' } } },
      ],
    })
    expect(noop.status).toBe(422)

    const ghost = await post('/share/proposals/create', {
      channelId: 'ch-ghost',
      authorHandle: 'learner-e2e',
      title: 'ghost',
      operations: [{ kind: 'remove', itemId: 'h1' }],
    })
    expect(ghost.status).toBe(422)
  })

  it('lists open proposals and accepts one, publishing a new version', async () => {
    const open = await post('/share/proposals/list', {
      channelId: manifest.channelId,
      status: 'open',
    })
    expect(open.status).toBe(200)
    expect(open.json.proposals).toHaveLength(1)
    expect(open.json.proposals[0].id).toBe(proposalId)

    const decided = await post('/share/proposals/decide', { proposalId, decision: 'accept' })
    expect(decided.status).toBe(200)
    expect(decided.json.version).toBe(3)
    expect(decided.json.proposal.status).toBe('accepted')
    expect(decided.json.proposal.acceptedVersion).toBe(3)

    const got = await post('/share/host/get', { channelId: manifest.channelId })
    expect(got.json.manifest.currentVersion).toBe(3)
    const h2 = got.json.manifest.versions[2].items.find((i: any) => i.id === 'h2')
    expect(h2.content.front).toBe('Q2 fixed?')

    // deciding twice is rejected
    const again = await post('/share/proposals/decide', { proposalId, decision: 'accept' })
    expect(again.status).toBe(422)
  })

  it('declines a second proposal without touching the channel', async () => {
    const created = await post('/share/proposals/create', {
      channelId: manifest.channelId,
      authorHandle: 'learner-e2e',
      title: 'remove h1',
      operations: [{ kind: 'remove', itemId: 'h1' }],
    })
    const declined = await post('/share/proposals/decide', {
      proposalId: created.json.proposal.id,
      decision: 'decline',
    })
    expect(declined.status).toBe(200)
    const got = await post('/share/host/get', { channelId: manifest.channelId })
    expect(got.json.manifest.currentVersion).toBe(3)
    expect(got.json.manifest.versions[2].items.map((i: any) => i.id)).toContain('h1')
  })
})

describe('unhost', () => {
  it('unhosts the channel and rejects further proposals', async () => {
    const unhosted = await post('/share/host/unhost', { channelId: manifest.channelId })
    expect(unhosted.status).toBe(200)
    const got = await post('/share/host/get', { channelId: manifest.channelId })
    expect(got.status).toBe(404)
    const propose = await post('/share/proposals/create', {
      channelId: manifest.channelId,
      authorHandle: 'learner-e2e',
      title: 'too late',
      operations: [{ kind: 'remove', itemId: 'h1' }],
    })
    expect(propose.status).toBe(422)
  })
})

describe('channel analytics routes', () => {
  const analyticsChannel = 'ch-analytics-e2e'

  it('reports version activity and proposal stats for a hosted channel', async () => {
    const hosted = await post('/share/host', {
      manifest: createChannel({
        channelId: analyticsChannel,
        type: 'deck',
        title: 'Analytics E2E',
        authorHandle: 'owner-e2e',
        visibility: 'link',
        items: [{ id: 'x1', content: { front: 'X1?', back: 'A' } }],
        now: '2026-01-01T00:00:00Z',
      }),
    })
    expect(hosted.status).toBe(200)

    const published = await post('/share/host/publish', {
      channelId: analyticsChannel,
      items: [
        { id: 'x1', content: { front: 'X1 edited?', back: 'A' } },
        { id: 'x2', content: { front: 'X2?', back: 'B' } },
      ],
      changelog: 'v2',
    })
    expect(published.status).toBe(200)

    const proposal = await post('/share/proposals/create', {
      channelId: analyticsChannel,
      authorHandle: 'fox-e2e',
      title: 'improve x2',
      operations: [
        { kind: 'upsert', item: { id: 'x2', content: { front: 'X2 better?', back: 'B' } } },
      ],
    })
    await post('/share/proposals/decide', {
      proposalId: proposal.json.proposal.id,
      decision: 'accept',
    })

    const res = await post('/share/host/analytics', { channelId: analyticsChannel })
    expect(res.status).toBe(200)
    const a = res.json.analytics
    expect(a.currentVersion).toBe(3)
    expect(a.itemCount).toBe(2)
    expect(a.lifetime.added).toBe(2) // x1 at v1, x2 at v2
    expect(a.lifetime.changed).toBe(2) // x1 at v2, x2 at v3
    expect(a.versions).toHaveLength(3)
    expect(a.proposals.total).toBe(1)
    expect(a.proposals.accepted).toBe(1)
    expect(a.proposals.topContributors[0]).toEqual({ authorHandle: 'fox-e2e', accepted: 1 })
  })

  it('404s analytics for unhosted channels and reports empty sync stats', async () => {
    const missing = await post('/share/host/analytics', { channelId: 'ch-ghost' })
    expect(missing.status).toBe(404)
    const stats = await post('/share/channels/sync-stats', { channelId: 'ch-ghost' })
    expect(stats.status).toBe(200)
    expect(stats.json.stats.totalSyncs).toBe(0)
  })
})

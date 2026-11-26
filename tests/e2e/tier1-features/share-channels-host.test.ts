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

describe('channel collections routes', () => {
  it('saves, lists, fetches and deletes a collection', async () => {
    const collection = {
      schema: 'lh-share-collection/v1',
      id: 'col-e2e',
      title: 'E2E pack',
      description: '',
      ownerHandle: 'owner-e2e',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      channels: [
        createChannel({
          channelId: 'ch-col-a',
          type: 'deck',
          title: 'Col A',
          authorHandle: 'owner-e2e',
          visibility: 'link',
          items: [{ id: 'ca1', content: { front: 'Q?', back: 'A' } }],
          now: '2026-01-01T00:00:00Z',
        }),
      ],
    }
    const saved = await post('/share/collections/save', { collection })
    expect(saved.status).toBe(200)
    expect(saved.json.ok).toBe(true)

    const listed = await post('/share/collections/list', {})
    expect(listed.status).toBe(200)
    const found = listed.json.collections.find((c: any) => c.id === 'col-e2e')
    expect(found).toBeTruthy()
    expect(found.channelCount).toBe(1)

    const got = await post('/share/collections/get', { id: 'col-e2e' })
    expect(got.status).toBe(200)
    expect(got.json.collection.channels[0].channelId).toBe('ch-col-a')

    // save again with an extra channel (upsert)
    const bigger = {
      ...collection,
      updatedAt: '2026-01-02T00:00:00Z',
      channels: [
        ...collection.channels,
        createChannel({
          channelId: 'ch-col-b',
          type: 'deck',
          title: 'Col B',
          authorHandle: 'owner-e2e',
          visibility: 'link',
          items: [{ id: 'cb1', content: { front: 'Q?', back: 'B' } }],
          now: '2026-01-01T00:00:00Z',
        }),
      ],
    }
    await post('/share/collections/save', { collection: bigger })
    const got2 = await post('/share/collections/get', { id: 'col-e2e' })
    expect(got2.json.collection.channels).toHaveLength(2)

    const missing = await post('/share/collections/get', { id: 'col-ghost' })
    expect(missing.status).toBe(404)

    const deleted = await post('/share/collections/delete', { id: 'col-e2e' })
    expect(deleted.status).toBe(200)
    expect((await post('/share/collections/get', { id: 'col-e2e' })).status).toBe(404)
    expect((await post('/share/collections/delete', { id: 'col-e2e' })).status).toBe(404)
  })
})

describe('publish-from-library route', () => {
  it('publishes a library deck as a channel and rejects empty requests', async () => {
    const { findOrCreateDeck, createBasicCards } =
      await import('../../../packages/db/src/repos/cards')
    const deck = findOrCreateDeck('Publishable E2E Deck')
    createBasicCards(deck.id, 'Capital of France? :: Paris\nCapital of Egypt? :: Cairo')

    const published = await post('/share/channels/publish-from-library', {
      channelId: 'ch-lib-e2e',
      authorHandle: 'owner-e2e',
      visibility: 'link',
      deckId: deck.id,
      title: 'Library Deck Channel',
      changelog: 'initial from library',
    })
    expect(published.status).toBe(200)
    expect(published.json.ok).toBe(true)
    expect(published.json.manifest.channelId).toBe('ch-lib-e2e')
    expect(published.json.manifest.currentVersion).toBe(1)
    expect(published.json.manifest.versions[0].items).toHaveLength(2)

    // the published channel can be hosted and served like any other
    const hosted = await post('/share/host', { manifest: published.json.manifest })
    expect(hosted.status).toBe(200)
    const got = await post('/share/host/get', { channelId: 'ch-lib-e2e' })
    expect(got.status).toBe(200)

    // update path: republish against the existing manifest
    const updated = await post('/share/channels/publish-from-library', {
      channelId: 'ch-lib-e2e',
      authorHandle: 'owner-e2e',
      visibility: 'link',
      deckId: deck.id,
      manifest: published.json.manifest,
      changelog: 'v2 from library',
    })
    expect(updated.status).toBe(200)
    expect(updated.json.manifest.currentVersion).toBe(2)

    // neither deckId nor courseId -> 400
    const bad = await post('/share/channels/publish-from-library', {
      channelId: 'ch-bad',
      authorHandle: 'owner-e2e',
      visibility: 'link',
    })
    expect(bad.status).toBe(400)
  })
})

describe('hosting route error paths', () => {
  it('rejects publishes to unhosted channels and malformed bodies', async () => {
    const publishGhost = await post('/share/host/publish', {
      channelId: 'ch-never-hosted',
      items: [{ id: 'x', content: { front: 'Q?', back: 'A' } }],
      changelog: 'nope',
    })
    expect(publishGhost.status).toBe(422)
    expect(publishGhost.json.ok).toBe(false)

    const unhostGhost = await post('/share/host/unhost', { channelId: 'ch-never-hosted' })
    expect(unhostGhost.status).toBe(404)

    const decideGhost = await post('/share/proposals/decide', {
      proposalId: 'no-such-proposal',
      decision: 'accept',
    })
    expect(decideGhost.status).toBe(422)

    // malformed: operations array empty (schema min 1)
    const badProposal = await post('/share/proposals/create', {
      channelId: 'ch-never-hosted',
      authorHandle: 'x',
      title: 't',
      operations: [],
    })
    expect([400, 422]).toContain(badProposal.status)

    // malformed: items not an array of {id, content}
    const badPublish = await post('/share/host/publish', {
      channelId: 'ch-never-hosted',
      items: [{ nope: true }],
      changelog: 'x',
    })
    expect([400, 422]).toContain(badPublish.status)
  })

  it('host/list and proposals/list stay consistent after churn', async () => {
    await post('/share/host', {
      manifest: createChannel({
        channelId: 'ch-consistency',
        type: 'deck',
        title: 'Consistency',
        authorHandle: 'owner-e2e',
        visibility: 'link',
        items: [{ id: 'c1', content: { front: 'Q?', back: 'A' } }],
        now: '2026-01-01T00:00:00Z',
      }),
    })
    for (let i = 0; i < 3; i++) {
      const proposal = await post('/share/proposals/create', {
        channelId: 'ch-consistency',
        authorHandle: `learner-${i}`,
        title: `proposal ${i}`,
        operations: [
          { kind: 'upsert', item: { id: `p${i}`, content: { front: `PQ${i}?`, back: 'A' } } },
        ],
      })
      expect(proposal.status).toBe(200)
      if (i % 2 === 0) {
        await post('/share/proposals/decide', {
          proposalId: proposal.json.proposal.id,
          decision: 'accept',
        })
      }
    }
    const all = await post('/share/proposals/list', { channelId: 'ch-consistency' })
    expect(all.json.proposals).toHaveLength(3)
    const open = await post('/share/proposals/list', {
      channelId: 'ch-consistency',
      status: 'open',
    })
    expect(open.json.proposals).toHaveLength(1)
    const accepted = await post('/share/proposals/list', {
      channelId: 'ch-consistency',
      status: 'accepted',
    })
    expect(accepted.json.proposals).toHaveLength(2)

    const got = await post('/share/host/get', { channelId: 'ch-consistency' })
    expect(got.json.manifest.currentVersion).toBe(3) // initial + 2 accepts
    expect(got.json.manifest.versions[2].items).toHaveLength(3) // c1 + p0 + p2
    await post('/share/host/unhost', { channelId: 'ch-consistency' })
  })
})

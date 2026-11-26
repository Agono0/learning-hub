import { describe, expect, it } from 'vitest'

import {
  createChannel,
  publishUpdate,
  subscribeToChannel,
  type ChannelManifest,
  type LocalItem,
} from '../src/share-channels'
import {
  codeForStatus,
  HttpChannelTransport,
  InMemoryChannelSyncStore,
  InMemoryChannelTransport,
  SyncCoordinator,
  TransportError,
} from '../src/share-channels/transport'

function manifestWithTwo(): ChannelManifest {
  return createChannel({
    channelId: 'ch-phys',
    type: 'deck',
    title: 'Physics',
    authorHandle: 'falcon',
    visibility: 'link',
    items: [
      { id: 'p1', content: { front: 'Speed of light?', back: 'c' } },
      { id: 'p2', content: { front: 'Unit of force?', back: 'newton' } },
    ],
    now: '2026-01-01T00:00:00Z',
  })
}

function localFrom(manifest: ChannelManifest): LocalItem[] {
  const v = manifest.versions[0]
  return v.items.map((i) => ({
    channelItemId: i.id,
    channelContent: i.content,
    channelRevision: i.revision,
    localContent: i.content,
    learnerState: { fsrs: { stability: 4.2 } },
  }))
}

describe('InMemoryChannelTransport', () => {
  it('round-trips publish and fetch', async () => {
    const t = new InMemoryChannelTransport()
    await t.publishManifest(manifestWithTwo())
    const fetched = await t.fetchManifest('ch-phys')
    expect(fetched?.channelId).toBe('ch-phys')
    expect(t.publishCount).toBe(1)
  })

  it('rejects unknown channels as not-found', async () => {
    const t = new InMemoryChannelTransport()
    await expect(t.fetchManifest('nope')).rejects.toMatchObject({ code: 'not-found' })
  })

  it('enforces invite tokens when configured', async () => {
    const t = new InMemoryChannelTransport([manifestWithTwo()], {
      inviteTokens: { 'ch-phys': 'tok-123' },
    })
    await expect(t.fetchManifest('ch-phys')).rejects.toMatchObject({ code: 'unauthorized' })
    await expect(t.fetchManifest('ch-phys', { inviteToken: 'wrong' })).rejects.toMatchObject({
      code: 'unauthorized',
    })
    const ok = await t.fetchManifest('ch-phys', { inviteToken: 'tok-123' })
    expect(ok?.channelId).toBe('ch-phys')
  })

  it('honors conditional fetches against the current version checksum', async () => {
    const m = manifestWithTwo()
    const t = new InMemoryChannelTransport([m])
    const currentChecksum = m.versions[0].checksum
    await expect(t.fetchManifest('ch-phys', { ifNoneMatch: currentChecksum })).resolves.toBeNull()
    await expect(t.fetchManifest('ch-phys', { ifNoneMatch: 'stale' })).resolves.not.toBeNull()
  })

  it('rejects manifests whose checksums do not verify', async () => {
    const t = new InMemoryChannelTransport()
    const bad = manifestWithTwo()
    bad.versions[0].checksum = 'deadbeef'
    await expect(t.publishManifest(bad)).rejects.toMatchObject({ code: 'checksum-mismatch' })
  })
})

describe('HttpChannelTransport', () => {
  function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  }

  it('fetches and validates a manifest over HTTP', async () => {
    const m = manifestWithTwo()
    const transport = new HttpChannelTransport({
      baseUrl: 'https://host.example/',
      fetchFn: async (input) => {
        expect(String(input)).toBe('https://host.example/share/channels/ch-phys/manifest')
        return jsonResponse(200, m)
      },
    })
    const got = await transport.fetchManifest('ch-phys')
    expect(got?.title).toBe('Physics')
  })

  it('maps 404 to not-found without retrying', async () => {
    let calls = 0
    const transport = new HttpChannelTransport({
      baseUrl: 'https://host.example',
      fetchFn: async () => {
        calls += 1
        return jsonResponse(404, { error: 'nope' })
      },
      sleepFn: async () => {},
    })
    await expect(transport.fetchManifest('ch-phys')).rejects.toMatchObject({
      code: 'not-found',
      status: 404,
    })
    expect(calls).toBe(1)
  })

  it('retries transient 5xx with backoff then succeeds', async () => {
    const m = manifestWithTwo()
    let calls = 0
    const waits: number[] = []
    const transport = new HttpChannelTransport({
      baseUrl: 'https://host.example',
      fetchFn: async () => {
        calls += 1
        return calls < 3 ? jsonResponse(503, {}) : jsonResponse(200, m)
      },
      sleepFn: async (ms) => {
        waits.push(ms)
      },
      backoffBaseMs: 100,
    })
    const got = await transport.fetchManifest('ch-phys')
    expect(got?.channelId).toBe('ch-phys')
    expect(calls).toBe(3)
    expect(waits).toEqual([100, 200])
  })

  it('treats a 304 as already-current (null)', async () => {
    const transport = new HttpChannelTransport({
      baseUrl: 'https://host.example',
      fetchFn: async (_input, init) => {
        expect((init?.headers as Record<string, string>)['if-none-match']).toBe('abc123')
        return new Response(null, { status: 304 })
      },
    })
    await expect(transport.fetchManifest('ch-phys', { ifNoneMatch: 'abc123' })).resolves.toBeNull()
  })

  it('sends the invite token header for gated channels', async () => {
    const m = manifestWithTwo()
    const transport = new HttpChannelTransport({
      baseUrl: 'https://host.example',
      fetchFn: async (_input, init) => {
        const headers = init?.headers as Record<string, string>
        return headers['x-lh-invite-token'] === 'tok-1'
          ? jsonResponse(200, m)
          : jsonResponse(403, {})
      },
    })
    await expect(transport.fetchManifest('ch-phys')).rejects.toMatchObject({ code: 'unauthorized' })
    await expect(
      transport.fetchManifest('ch-phys', { inviteToken: 'tok-1' }),
    ).resolves.toMatchObject({ channelId: 'ch-phys' })
  })

  it('rejects invalid JSON payloads as invalid-manifest', async () => {
    const transport = new HttpChannelTransport({
      baseUrl: 'https://host.example',
      fetchFn: async () => jsonResponse(200, { hello: 'world' }),
    })
    await expect(transport.fetchManifest('ch-phys')).rejects.toMatchObject({
      code: 'invalid-manifest',
    })
  })

  it('publishes with a PUT and the invite secret header', async () => {
    const m = manifestWithTwo()
    const transport = new HttpChannelTransport({
      baseUrl: 'https://host.example',
      fetchFn: async (input, init) => {
        expect(init?.method).toBe('PUT')
        expect(String(input)).toContain('/share/channels/ch-phys/manifest')
        expect((init?.headers as Record<string, string>)['x-lh-invite-secret']).toBe('s3cret')
        const body = JSON.parse(String(init?.body))
        expect(body.channelId).toBe('ch-phys')
        return jsonResponse(200, { ok: true })
      },
    })
    await expect(transport.publishManifest(m, { inviteSecret: 's3cret' })).resolves.toEqual({
      accepted: true,
    })
  })

  it('refuses to publish a manifest with a broken checksum locally', async () => {
    const m = manifestWithTwo()
    m.versions[0].checksum = 'tampered'
    let calls = 0
    const transport = new HttpChannelTransport({
      baseUrl: 'https://host.example',
      fetchFn: async () => {
        calls += 1
        return jsonResponse(200, {})
      },
    })
    await expect(transport.publishManifest(m)).rejects.toMatchObject({ code: 'checksum-mismatch' })
    expect(calls).toBe(0)
  })
})

describe('codeForStatus', () => {
  it('classifies statuses', () => {
    expect(codeForStatus(401)).toBe('unauthorized')
    expect(codeForStatus(403)).toBe('unauthorized')
    expect(codeForStatus(404)).toBe('not-found')
    expect(codeForStatus(500)).toBe('http')
  })
})

describe('SyncCoordinator', () => {
  function seedHost() {
    const manifest = manifestWithTwo()
    const transport = new InMemoryChannelTransport([manifest])
    const subscription = {
      ...subscribeToChannel('ch-phys', '2026-01-01T01:00:00Z'),
      localVersion: 1,
    }
    const store = new InMemoryChannelSyncStore({
      subscriptions: [subscription],
      items: { 'ch-phys': localFrom(manifest) },
    })
    return { manifest, transport, store, subscription }
  }

  it('reports already-current when nothing changed', async () => {
    const { transport, store } = seedHost()
    const coord = new SyncCoordinator({ transport, store, now: () => '2026-01-02T00:00:00Z' })
    const record = await coord.syncChannel('ch-phys')
    expect(record.outcome).toBe('already-current')
    expect(store.records).toHaveLength(1)
  })

  it('applies pending versions and preserves learner state', async () => {
    const { manifest, transport, store } = seedHost()
    const v2 = publishUpdate(
      manifest,
      [
        { id: 'p1', content: { front: 'Speed of light in vacuum?', back: 'c' } },
        { id: 'p2', content: { front: 'Unit of force?', back: 'newton' } },
        { id: 'p3', content: { front: 'Unit of energy?', back: 'joule' } },
      ],
      'Added energy card',
      '2026-01-02T00:00:00Z',
    )
    await transport.publishManifest(v2)
    const coord = new SyncCoordinator({ transport, store, now: () => '2026-01-02T01:00:00Z' })
    const record = await coord.syncChannel('ch-phys')
    expect(record.outcome).toBe('updated')
    expect(record.fromVersion).toBe(1)
    expect(record.toVersion).toBe(2)
    expect(record.appliedVersions).toEqual([2])
    const items = store.getLocalItems('ch-phys')
    expect(items).toHaveLength(3)
    const p1 = items.find((i) => i.channelItemId === 'p1')
    expect(p1?.localContent.front).toBe('Speed of light in vacuum?')
    expect(p1?.learnerState).toEqual({ fsrs: { stability: 4.2 } })
    expect(store.getSubscription('ch-phys')?.localVersion).toBe(2)
  })

  it('records failures without touching local state', async () => {
    const { store } = seedHost()
    const failing = new InMemoryChannelTransport([manifestWithTwo()], { failNextFetches: 1 })
    const coord = new SyncCoordinator({
      transport: failing,
      store,
      now: () => '2026-01-02T00:00:00Z',
    })
    // First fetch fails (simulated network), subscription must stay at v1.
    const record = await coord.syncChannel('ch-phys')
    expect(record.outcome).toBe('failed')
    expect(record.errorCode).toBe('network')
    expect(store.getSubscription('ch-phys')?.localVersion).toBe(1)
  })

  it('syncAll walks every subscription under the concurrency limit', async () => {
    const a = manifestWithTwo()
    const b = createChannel({
      channelId: 'ch-chem',
      type: 'deck',
      title: 'Chemistry',
      authorHandle: 'falcon',
      visibility: 'link',
      items: [{ id: 'c1', content: { front: 'H2O?', back: 'water' } }],
      now: '2026-01-01T00:00:00Z',
    })
    const transport = new InMemoryChannelTransport([a, b])
    const store = new InMemoryChannelSyncStore({
      subscriptions: [
        { ...subscribeToChannel('ch-phys', '2026-01-01T01:00:00Z'), localVersion: 1 },
        { ...subscribeToChannel('ch-chem', '2026-01-01T01:00:00Z'), localVersion: 1 },
      ],
      items: { 'ch-phys': localFrom(a), 'ch-chem': localFrom(b) },
    })
    const coord = new SyncCoordinator({ transport, store, concurrency: 2 })
    const summary = await coord.syncAll()
    expect(summary.checked).toBe(2)
    expect(summary.alreadyCurrent).toBe(2)
    expect(summary.failed).toBe(0)
  })

  it('fails cleanly for a channel with no local subscription', async () => {
    const store = new InMemoryChannelSyncStore()
    const coord = new SyncCoordinator({ transport: new InMemoryChannelTransport(), store })
    const record = await coord.syncChannel('ghost')
    expect(record.outcome).toBe('failed')
    expect(record.errorCode).toBe('not-found')
  })
})

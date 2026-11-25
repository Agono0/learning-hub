import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  InMemoryChannelTransport,
  SyncCoordinator,
  subscribeToChannel,
  createChannel,
  publishUpdate,
  type ChannelManifest,
  type LocalItem,
} from '@learning-hub/core'
import type { RawSqliteHandle } from '../src/index'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import {
  DbChannelSyncStore,
  latestSyncOutcomePerChannel,
  listChannelSubscriptions,
  listSyncRecords,
  refreshSubscriptionManifestView,
} from '../src/repos/share-channels'

function createInMemoryDb(): RawSqliteHandle {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  return raw
}

function manifestWithTwo(): ChannelManifest {
  return createChannel({
    channelId: 'ch-bio',
    type: 'deck',
    title: 'Biology',
    authorHandle: 'heron',
    visibility: 'link',
    items: [
      { id: 'b1', content: { front: 'DNA shape?', back: 'double helix' } },
      { id: 'b2', content: { front: 'RNA sugar?', back: 'ribose' } },
    ],
    now: '2026-01-01T00:00:00Z',
  })
}

function localFrom(manifest: ChannelManifest): LocalItem[] {
  return manifest.versions[0].items.map((i) => ({
    channelItemId: i.id,
    channelContent: i.content,
    channelRevision: i.revision,
    localContent: i.content,
    learnerState: { note: 'keep me' },
  }))
}

describe('DbChannelSyncStore', () => {
  let raw: RawSqliteHandle
  let store: DbChannelSyncStore

  beforeEach(() => {
    raw = createInMemoryDb()
    store = new DbChannelSyncStore(raw)
  })

  it('round-trips subscriptions', () => {
    expect(store.getSubscription('ch-bio')).toBeNull()
    store.saveSubscription({
      ...subscribeToChannel('ch-bio', '2026-01-01T01:00:00Z'),
      localVersion: 1,
    })
    const got = store.getSubscription('ch-bio')
    expect(got?.localVersion).toBe(1)
    expect(store.listSubscriptions()).toHaveLength(1)
    // Upsert advances the version without duplicating the row.
    store.saveSubscription({
      channelId: 'ch-bio',
      localVersion: 2,
      subscribedAt: '2026-01-01T01:00:00Z',
      lastSyncAt: '2026-01-02T00:00:00Z',
    })
    expect(store.listSubscriptions()).toHaveLength(1)
    expect(store.getSubscription('ch-bio')?.localVersion).toBe(2)
    expect(store.getSubscription('ch-bio')?.lastSyncAt).toBe('2026-01-02T00:00:00Z')
  })

  it('round-trips local items with learner state intact', () => {
    const items = localFrom(manifestWithTwo())
    store.saveLocalItems('ch-bio', items)
    const got = store.getLocalItems('ch-bio')
    expect(got).toHaveLength(2)
    expect(got.find((i) => i.channelItemId === 'b1')?.learnerState).toEqual({ note: 'keep me' })
    // Re-saving the same roster is idempotent (stable keys for local items).
    store.saveLocalItems('ch-bio', got)
    expect(store.getLocalItems('ch-bio')).toHaveLength(2)
  })

  it('keeps learner-created items with stable local keys', () => {
    const items = [
      ...localFrom(manifestWithTwo()),
      {
        channelItemId: null,
        channelContent: null,
        channelRevision: null,
        localContent: { front: 'My own card', back: 'mine' },
        learnerState: {},
      },
    ]
    store.saveLocalItems('ch-bio', items)
    const first = store.getLocalItems('ch-bio')
    expect(first).toHaveLength(3)
    expect(first.filter((i) => i.channelItemId === null)).toHaveLength(1)
    // Save what we read back: nothing duplicates.
    store.saveLocalItems('ch-bio', first)
    expect(store.getLocalItems('ch-bio')).toHaveLength(3)
  })

  it('appends and reads back sync records newest-first', () => {
    store.appendSyncRecord({
      channelId: 'ch-bio',
      at: '2026-01-02T00:00:00Z',
      fromVersion: 1,
      toVersion: 2,
      outcome: 'updated',
      appliedVersions: [2],
    })
    store.appendSyncRecord({
      channelId: 'ch-bio',
      at: '2026-01-03T00:00:00Z',
      fromVersion: 2,
      toVersion: 2,
      outcome: 'already-current',
    })
    const records = listSyncRecords('ch-bio', { database: raw })
    expect(records).toHaveLength(2)
    expect(records[0].outcome).toBe('already-current')
    expect(records[1].appliedVersions).toEqual([2])
    const latest = latestSyncOutcomePerChannel({ database: raw })
    expect(latest['ch-bio'].outcome).toBe('already-current')
  })

  it('drives a full coordinator sync against SQLite', () => {
    const manifest = manifestWithTwo()
    const transport = new InMemoryChannelTransport([manifest])
    store.saveSubscription({
      ...subscribeToChannel('ch-bio', '2026-01-01T01:00:00Z'),
      localVersion: 1,
    })
    store.saveLocalItems('ch-bio', localFrom(manifest))
    const v2 = publishUpdate(
      manifest,
      [
        { id: 'b1', content: { front: 'DNA shape?', back: 'double helix' } },
        { id: 'b2', content: { front: 'RNA sugar?', back: 'ribose' } },
        { id: 'b3', content: { front: 'mRNA role?', back: 'transcript' } },
      ],
      'Added mRNA card',
      '2026-01-02T00:00:00Z',
    )
    void transport.publishManifest(v2)
    const coord = new SyncCoordinator({ transport, store, now: () => '2026-01-02T01:00:00Z' })
    return coord.syncChannel('ch-bio').then((record) => {
      expect(record.outcome).toBe('updated')
      const items = store.getLocalItems('ch-bio')
      expect(items).toHaveLength(3)
      // Learner state on synced items survived the update.
      expect(items.find((i) => i.channelItemId === 'b1')?.learnerState).toEqual({ note: 'keep me' })
      expect(store.getSubscription('ch-bio')?.localVersion).toBe(2)
    })
  })
})

describe('dashboard queries', () => {
  it('flags subscriptions with pending updates', () => {
    const raw = createInMemoryDb()
    const store = new DbChannelSyncStore(raw)
    store.saveSubscription({
      ...subscribeToChannel('ch-bio', '2026-01-01T01:00:00Z'),
      localVersion: 1,
    })
    refreshSubscriptionManifestView({
      channelId: 'ch-bio',
      title: 'Biology',
      authorHandle: 'heron',
      contentType: 'deck',
      visibility: 'link',
      seenVersion: 3,
      database: raw,
    })
    const rows = listChannelSubscriptions({ database: raw })
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Biology')
    expect(rows[0].seenVersion).toBe(3)
    expect(rows[0].hasPending).toBe(true)
  })
})

/**
 * Composition tests for shared channels: DbChannelSyncStore + SyncCoordinator +
 * importChannelDeck on one in-memory SQLite database, with an in-process
 * transport (no HTTP, no network). Conflict, publisher-removal and failure
 * paths are covered elsewhere only by the pure engine tests in
 * packages/core/tests/share-channels.test.ts; these check what the database
 * and the deck import do with the same inputs.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { asc, eq } from 'drizzle-orm'
import {
  InMemoryChannelTransport,
  SyncCoordinator,
  TransportError,
  applyAllPendingVersions,
  createChannel,
  publishUpdate,
  subscribeToChannel,
  type ChannelManifest,
  type ChannelTransport,
} from '@learning-hub/core'
import * as schema from '../src/schema'
import { cards } from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import { setDb, type LearningHubDB, type RawSqliteHandle } from '../src/index'
import {
  DbChannelSyncStore,
  listSyncRecords,
  refreshSubscriptionManifestView,
} from '../src/repos/share-channels'
import { importChannelDeck } from '../src/repos/share-channel-import'

const CH = 'ch-comp'
const card = (front: string, back: string) => ({ front, back })
const basic = (row: { content: unknown }) =>
  (row.content as { basic: { front: string; back: string } }).basic

let raw: RawSqliteHandle
let db: LearningHubDB
let store: DbChannelSyncStore
let v1: ChannelManifest

function seed() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  db = drizzle(sqlite, { schema }) as unknown as LearningHubDB
  setDb(db)
  store = new DbChannelSyncStore()
  v1 = createChannel({
    channelId: CH,
    type: 'deck',
    title: 'Composition Deck',
    authorHandle: 'heron',
    visibility: 'link',
    items: [
      { id: 'i1', content: card('Q1?', 'A1') },
      { id: 'i2', content: card('Q2?', 'A2') },
      { id: 'i3', content: card('Q3?', 'A3') },
    ],
    now: '2026-01-01T00:00:00Z',
  })
  const fresh = subscribeToChannel(CH, '2026-01-01T01:00:00Z')
  const seeded = applyAllPendingVersions([], fresh, v1)
  store.saveLocalItems(CH, seeded.items)
  store.saveSubscription({ ...fresh, localVersion: seeded.result.newVersion })
  refreshSubscriptionManifestView({
    channelId: CH,
    title: v1.title,
    authorHandle: v1.authorHandle,
    contentType: 'deck',
    visibility: 'link',
    seenVersion: v1.currentVersion,
    database: raw,
  })
}

function coordinator(transport: ChannelTransport, at: string) {
  return new SyncCoordinator({ transport, store, now: () => at })
}

function editLocal(itemId: string, content: { front: string; back: string }) {
  store.saveLocalItems(
    CH,
    store
      .getLocalItems(CH)
      .map((i) => (i.channelItemId === itemId ? { ...i, localContent: content } : i)),
  )
}

function item(id: string) {
  const found = store.getLocalItems(CH).find((i) => i.channelItemId === id)
  if (!found) throw new Error(`no local item ${id}`)
  return found
}

function cardRow(id: string) {
  return db
    .select()
    .from(cards)
    .where(eq(cards.sourceKey, `channel:${CH}/${id}`))
    .all()[0]
}

describe('share channel composition (db + coordinator + deck import)', () => {
  beforeEach(seed)

  it('keeps a learner edit through a conflicting update and does not re-report it', async () => {
    expect(importChannelDeck(CH, { database: db }).created).toBe(3)
    editLocal('i1', card('Q1 mine?', 'A1'))
    const v2 = publishUpdate(
      v1,
      [
        { id: 'i1', content: card('Q1 pub?', 'A1') },
        { id: 'i2', content: card('Q2?', 'A2') },
        { id: 'i3', content: card('Q3?', 'A3') },
      ],
      'revise i1',
      '2026-01-02T00:00:00Z',
    )
    const transport = new InMemoryChannelTransport([v2])

    const first = await coordinator(transport, '2026-01-02T01:00:00Z').syncChannel(CH)
    expect(first).toMatchObject({ outcome: 'updated', fromVersion: 1, toVersion: 2 })
    expect(first.merge).toMatchObject({
      addedCount: 0,
      updatedCount: 0,
      removedCount: 0,
      conflicts: ['i1'],
    })
    // Learner text wins; the publisher text is recorded as the new base.
    expect(item('i1').localContent).toEqual(card('Q1 mine?', 'A1'))
    expect(item('i1').channelContent).toEqual(card('Q1 pub?', 'A1'))
    expect(item('i1').channelRevision).toBe(2)
    expect(store.getSubscription(CH)?.localVersion).toBe(2)

    // A second sync at the same version changes nothing and reports no conflict.
    const before = JSON.stringify(store.getLocalItems(CH))
    const second = await coordinator(transport, '2026-01-02T02:00:00Z').syncChannel(CH)
    expect(second).toMatchObject({ outcome: 'already-current', fromVersion: 2, toVersion: 2 })
    expect(second.merge).toBeUndefined()
    expect(JSON.stringify(store.getLocalItems(CH))).toBe(before)
    expect(listSyncRecords(CH, { database: raw }).map((r) => r.outcome)).toEqual([
      'already-current',
      'updated',
    ])

    // A later publisher revision of the same item is a new conflict, not a silent overwrite.
    const v3 = publishUpdate(
      v2,
      [
        { id: 'i1', content: card('Q1 pub again?', 'A1') },
        { id: 'i2', content: card('Q2?', 'A2') },
        { id: 'i3', content: card('Q3?', 'A3') },
      ],
      'revise i1 again',
      '2026-01-03T00:00:00Z',
    )
    await transport.publishManifest(v3)
    const third = await coordinator(transport, '2026-01-03T01:00:00Z').syncChannel(CH)
    expect(third.merge?.conflicts).toEqual(['i1'])
    expect(item('i1').localContent).toEqual(card('Q1 mine?', 'A1'))
    expect(item('i1').channelContent).toEqual(card('Q1 pub again?', 'A1'))
    expect(item('i1').channelRevision).toBe(3)
  })

  it('keeps a publisher-removed item, its learner state and its card', async () => {
    expect(importChannelDeck(CH, { database: db }).created).toBe(3)
    db.update(cards)
      .set({ reps: 4, stability: 6.25, state: 2 })
      .where(eq(cards.sourceKey, `channel:${CH}/i3`))
      .run()
    store.saveLocalItems(
      CH,
      store
        .getLocalItems(CH)
        .map((i) => (i.channelItemId === 'i3' ? { ...i, learnerState: { note: 'mine' } } : i)),
    )
    const v2 = publishUpdate(
      v1,
      [
        { id: 'i1', content: card('Q1?', 'A1') },
        { id: 'i2', content: card('Q2?', 'A2') },
      ],
      'drop i3',
      '2026-01-02T00:00:00Z',
    )
    const record = await coordinator(
      new InMemoryChannelTransport([v2]),
      '2026-01-02T01:00:00Z',
    ).syncChannel(CH)
    expect(record.outcome).toBe('updated')
    expect(record.merge).toMatchObject({ removedCount: 1, conflictCount: 0, addedCount: 0 })

    expect(item('i3').learnerState).toEqual({ note: 'mine' })
    expect(item('i3').localContent).toEqual(card('Q3?', 'A3'))
    expect(store.getLocalItems(CH)).toHaveLength(3)

    const again = importChannelDeck(CH, { database: db })
    expect(again).toMatchObject({ ok: true, created: 0, updated: 0, itemCount: 3 })
    const row = cardRow('i3')
    expect(basic(row)).toEqual(card('Q3?', 'A3'))
    expect([row.reps, row.stability, row.state]).toEqual([4, 6.25, 2])
  })

  it('re-imports after a conflict with learner text kept and review state untouched', async () => {
    importChannelDeck(CH, { database: db })
    db.update(cards)
      .set({ reps: 9, stability: 12.5, state: 2 })
      .where(eq(cards.sourceKey, `channel:${CH}/i1`))
      .run()
    const originalId = cardRow('i1').id
    editLocal('i1', card('Q1 mine?', 'A1 mine'))
    const v2 = publishUpdate(
      v1,
      [
        { id: 'i1', content: card('Q1 pub?', 'A1 pub') },
        { id: 'i2', content: card('Q2 pub?', 'A2') },
        { id: 'i3', content: card('Q3?', 'A3') },
      ],
      'revise i1 and i2',
      '2026-01-02T00:00:00Z',
    )
    const record = await coordinator(
      new InMemoryChannelTransport([v2]),
      '2026-01-02T01:00:00Z',
    ).syncChannel(CH)
    expect(record.merge).toMatchObject({ updatedCount: 1, conflicts: ['i1'] })

    const result = importChannelDeck(CH, { database: db })
    // Only the learner-edited i1 differs from the card, and i2 takes the publisher text.
    expect(result).toMatchObject({ ok: true, created: 0, updated: 2, itemCount: 3 })
    const i1 = cardRow('i1')
    expect(i1.id).toBe(originalId)
    expect(basic(i1)).toEqual(card('Q1 mine?', 'A1 mine'))
    expect([i1.reps, i1.stability, i1.state]).toEqual([9, 12.5, 2])
    expect(basic(cardRow('i2'))).toEqual(card('Q2 pub?', 'A2'))
  })

  it('imports the same state twice without changing any card', async () => {
    const v2 = publishUpdate(
      v1,
      [
        { id: 'i1', content: card('Q1?', 'A1') },
        { id: 'i2', content: card('Q2 pub?', 'A2') },
        { id: 'i3', content: card('Q3?', 'A3') },
        { id: 'i4', content: card('Q4?', 'A4') },
      ],
      'revise i2, add i4',
      '2026-01-02T00:00:00Z',
    )
    const record = await coordinator(
      new InMemoryChannelTransport([v2]),
      '2026-01-02T01:00:00Z',
    ).syncChannel(CH)
    expect(record.merge).toMatchObject({ addedCount: 1, updatedCount: 1, conflictCount: 0 })

    const first = importChannelDeck(CH, { database: db, now: new Date('2026-01-03T00:00:00Z') })
    expect(first).toMatchObject({ ok: true, created: 4, updated: 0, itemCount: 4 })
    const snapshot = db.select().from(cards).orderBy(asc(cards.id)).all()
    const second = importChannelDeck(CH, { database: db, now: new Date('2026-02-01T00:00:00Z') })
    expect(second).toMatchObject({ ok: true, created: 0, updated: 0, itemCount: 4 })
    expect(second.deckId).toBe(first.deckId)
    expect(db.select().from(cards).orderBy(asc(cards.id)).all()).toEqual(snapshot)
    expect(basic(cardRow('i2'))).toEqual(card('Q2 pub?', 'A2'))
    expect(basic(cardRow('i4'))).toEqual(card('Q4?', 'A4'))
  })

  it('leaves items and version untouched when the transport fails, then recovers', async () => {
    importChannelDeck(CH, { database: db })
    editLocal('i2', card('Q2 mine?', 'A2'))
    const itemsBefore = JSON.stringify(store.getLocalItems(CH))
    const v2 = publishUpdate(
      v1,
      [
        { id: 'i1', content: card('Q1 pub?', 'A1') },
        { id: 'i2', content: card('Q2 pub?', 'A2') },
        { id: 'i3', content: card('Q3?', 'A3') },
      ],
      'revise i1 and i2',
      '2026-01-02T00:00:00Z',
    )
    const inner = new InMemoryChannelTransport([v2])
    let failing = true
    const flaky: ChannelTransport = {
      fetchManifest: (id, opts) => {
        if (failing) {
          return Promise.reject(new TransportError('network', 'host down', { channelId: id }))
        }
        return inner.fetchManifest(id, opts)
      },
      publishManifest: (m) => inner.publishManifest(m),
    }

    const failed = await coordinator(flaky, '2026-01-02T01:00:00Z').syncChannel(CH)
    expect(failed).toMatchObject({
      outcome: 'failed',
      errorCode: 'network',
      fromVersion: 1,
      toVersion: 1,
    })
    expect(JSON.stringify(store.getLocalItems(CH))).toBe(itemsBefore)
    expect(store.getSubscription(CH)?.localVersion).toBe(1)
    expect(basic(cardRow('i1'))).toEqual(card('Q1?', 'A1'))

    failing = false
    const ok = await coordinator(flaky, '2026-01-02T02:00:00Z').syncChannel(CH)
    expect(ok).toMatchObject({ outcome: 'updated', fromVersion: 1, toVersion: 2 })
    expect(ok.merge).toMatchObject({ updatedCount: 1, conflicts: ['i2'] })
    expect(item('i1').localContent).toEqual(card('Q1 pub?', 'A1'))
    expect(item('i2').localContent).toEqual(card('Q2 mine?', 'A2'))
    expect(store.getSubscription(CH)?.localVersion).toBe(2)
    expect(listSyncRecords(CH, { database: raw }).map((r) => r.outcome)).toEqual([
      'updated',
      'failed',
    ])
  })
})

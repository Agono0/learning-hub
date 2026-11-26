import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { createChannel, subscribeToChannel, applyAllPendingVersions } from '@learning-hub/core'
import * as schema from '../src/schema'
import { cards as cardsTable } from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import { setDb, type LearningHubDB, type RawSqliteHandle } from '../src/index'
import { DbChannelSyncStore, refreshSubscriptionManifestView } from '../src/repos/share-channels'
import { importChannelDeck, importChannelCourse } from '../src/repos/share-channel-import'

function createInMemoryDb(): { raw: RawSqliteHandle; db: LearningHubDB } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema }) as unknown as LearningHubDB
  setDb(db)
  return { raw, db }
}

function seedChannel(channelId: string, type: 'deck' | 'course') {
  const manifest = createChannel({
    channelId,
    type,
    title: type === 'deck' ? 'Shared Physics Deck' : 'Shared Biology Course',
    authorHandle: 'heron',
    visibility: 'link',
    items:
      type === 'deck'
        ? [
            { id: 'i1', content: { front: 'Q1?', back: 'A1', tags: ['physics'] } },
            { id: 'i2', content: { front: 'Q2?', back: 'A2' } },
          ]
        : [
            {
              id: 'lesson-one',
              content: { title: 'Cells', body: 'All about cells.', objectives: ['Explain cells'] },
            },
            {
              id: 'lesson-two',
              content: { title: 'DNA', body: 'All about DNA.', estimatedMinutes: 15 },
            },
          ],
    now: '2026-01-01T00:00:00Z',
  })
  const store = new DbChannelSyncStore()
  const fresh = subscribeToChannel(channelId, '2026-01-01T01:00:00Z')
  const seeded = applyAllPendingVersions([], fresh, manifest)
  store.saveLocalItems(channelId, seeded.items)
  store.saveSubscription({ ...fresh, localVersion: seeded.result.newVersion })
  refreshSubscriptionManifestView({
    channelId,
    title: manifest.title,
    authorHandle: manifest.authorHandle,
    contentType: type,
    visibility: 'link',
    seenVersion: manifest.currentVersion,
  })
  return manifest
}

describe('importChannelDeck', () => {
  let db: LearningHubDB

  beforeEach(() => {
    ;({ db } = createInMemoryDb())
  })

  it('imports channel items as reviewable cards in a named deck', () => {
    seedChannel('ch-phys', 'deck')
    const result = importChannelDeck('ch-phys', { database: db })
    expect(result.ok).toBe(true)
    expect(result.created).toBe(2)
    expect(result.deckName).toBe('Shared Physics Deck')
    const rows = db.select().from(cardsTable).where(eq(cardsTable.deckId, result.deckId!)).all()
    expect(rows).toHaveLength(2)
    expect(rows[0].sourceKey).toMatch(/^channel:ch-phys\//)
  })

  it('re-imports update card content in place, keeping FSRS state', () => {
    const manifest = seedChannel('ch-phys', 'deck')
    const first = importChannelDeck('ch-phys', { database: db })
    expect(first.created).toBe(2)
    // Simulate learner progress on the imported card.
    db.update(cardsTable)
      .set({ reps: 7, stability: 9.5, state: 2 })
      .where(eq(cardsTable.sourceKey, 'channel:ch-phys/i1'))
      .run()
    // Publisher updates the card; subscriber syncs; re-import.
    const store = new DbChannelSyncStore()
    const items = store
      .getLocalItems('ch-phys')
      .map((i) =>
        i.channelItemId === 'i1' ? { ...i, localContent: { front: 'Q1 revised?', back: 'A1' } } : i,
      )
    store.saveLocalItems('ch-phys', items)
    void manifest
    const second = importChannelDeck('ch-phys', { database: db })
    expect(second.ok).toBe(true)
    expect(second.updated).toBe(1)
    expect(second.created).toBe(0)
    const row = db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.sourceKey, 'channel:ch-phys/i1'))
      .all()[0]
    expect((row.content as { basic: { front: string } }).basic.front).toBe('Q1 revised?')
    expect(row.reps).toBe(7)
    expect(row.stability).toBe(9.5)
    expect(row.state).toBe(2)
  })

  it('refuses channels with no subscription and wrong content type', () => {
    seedChannel('ch-phys', 'deck')
    expect(importChannelDeck('ghost', { database: db }).ok).toBe(false)
    seedChannel('ch-bio', 'course')
    const wrong = importChannelDeck('ch-bio', { database: db })
    expect(wrong.ok).toBe(false)
    expect(wrong.error).toContain('course')
  })
})

describe('importChannelCourse', () => {
  it('imports lesson items as a curriculum course and re-imports idempotently', () => {
    const { db } = createInMemoryDb()
    seedChannel('ch-bio', 'course')
    const result = importChannelCourse('ch-bio', { database: db })
    expect(result.ok).toBe(true)
    expect(result.courseSlug).toBe('channel-ch-bio')
    expect(result.report?.courseId).toBeGreaterThan(0)
    const again = importChannelCourse('ch-bio', { database: db })
    expect(again.ok).toBe(true)
    expect(again.report?.courseId).toBe(result.report?.courseId)
  })
})

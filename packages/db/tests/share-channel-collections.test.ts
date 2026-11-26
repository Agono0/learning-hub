import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createChannel, createCollection, upsertCollectionChannel } from '@learning-hub/core'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { LearningHubDB, RawSqliteHandle } from '../src/index'
import { deleteCollection, getCollection, listCollections, saveCollection } from '../src/repos'

function freshDb(): LearningHubDB {
  const sqlite = new Database(':memory:')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  return drizzle(sqlite, { schema }) as unknown as LearningHubDB
}

const manifest = (channelId: string) =>
  createChannel({
    channelId,
    type: 'deck',
    title: `Deck ${channelId}`,
    authorHandle: 'owner',
    visibility: 'link',
    items: [{ id: 'i1', content: { front: 'Q?', back: 'A' } }],
    now: '2026-01-01T00:00:00Z',
  })

describe('channel collections repo', () => {
  it('saves, reads, lists, updates and deletes collections', () => {
    const db = freshDb()
    const col = createCollection({
      id: 'col-1',
      title: 'Bio pack',
      ownerHandle: 'teacher',
      channels: [manifest('ch-a')],
      now: '2026-01-01T00:00:00Z',
    })
    expect(saveCollection(col, db).ok).toBe(true)
    expect(getCollection('col-1', db)!.channels).toHaveLength(1)
    expect(listCollections(db)).toEqual([
      {
        id: 'col-1',
        title: 'Bio pack',
        ownerHandle: 'teacher',
        channelCount: 1,
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    // upsert path: replace with two channels
    const bigger = upsertCollectionChannel(col, manifest('ch-b'), '2026-01-02T00:00:00Z')
    saveCollection(bigger, db)
    expect(getCollection('col-1', db)!.channels).toHaveLength(2)
    expect(listCollections(db)[0].channelCount).toBe(2)
    expect(deleteCollection('col-1', db).ok).toBe(true)
    expect(getCollection('col-1', db)).toBeUndefined()
    expect(deleteCollection('col-1', db).ok).toBe(false)
  })
})

/** Fingerprint canonicalisation and backup envelope version bounds. Synthetic :memory: data only. */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import type { LocalItem } from '@learning-hub/core'
import type { RawSqliteHandle } from '../src/index'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import { DbChannelSyncStore } from '../src/repos/share-channels'
import { BACKUP_VERSION, backupAll, restoreAll } from '../src/backup'
import { mergeBackup } from '../src/sync'
import { ValidationError } from '../src/review-service'

function createDb(): RawSqliteHandle {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  return raw
}

const local = (localContent: Record<string, unknown>): LocalItem => ({
  channelItemId: null,
  channelContent: null,
  channelRevision: 0,
  localContent,
  learnerState: {},
})

function keysFor(raw: RawSqliteHandle, items: LocalItem[]): string[] {
  const store = new DbChannelSyncStore(raw)
  store.saveLocalItems('ch-fp', items)
  return (
    raw
      .prepare('SELECT item_key FROM "share_channel_items" WHERE channel_id = ? ORDER BY item_key')
      .all('ch-fp') as { item_key: string }[]
  ).map((r) => r.item_key)
}

describe('local item fingerprint', () => {
  it('differs when only nested content differs', () => {
    const a = keysFor(createDb(), [local({ front: { text: 'one' }, back: 'x' })])
    const b = keysFor(createDb(), [local({ front: { text: 'two' }, back: 'x' })])
    expect(a[0]).not.toBe(b[0])
  })
  it('is stable across key order and across re-saves', () => {
    const raw = createDb()
    const a = keysFor(raw, [local({ a: 1, b: { y: 2, x: [1, { q: 1, p: 2 }] } })])
    const b = keysFor(raw, [local({ b: { x: [1, { p: 2, q: 1 }], y: 2 }, a: 1 })])
    expect(a).toEqual(b)
    expect(a[0]).toMatch(/^local:0:[0-9a-f]{16}$/)
  })
})

describe('backup envelope version', () => {
  const base = { exportedAt: '2026-01-01T00:00:00Z', tables: {} }
  it('rejects restore of a newer, zero or negative version before touching data', () => {
    const raw = createDb()
    raw.prepare("INSERT INTO decks (id, name, created_at) VALUES (1, 'Keep', 'x')").run()
    for (const version of [BACKUP_VERSION + 1, 999, 0, -1]) {
      expect(() => restoreAll({ version, ...base }, raw)).toThrow(ValidationError)
      expect(() => restoreAll({ version, ...base }, raw)).toThrow(/unsupported backup version/)
    }
    expect(raw.prepare('SELECT count(*) AS c FROM decks').get()).toEqual({ c: 1 })
  })
  it('rejects merge of a newer version and still accepts the current one', async () => {
    const raw = createDb()
    await expect(mergeBackup({ version: 999, ...base }, raw)).rejects.toThrow(
      /unsupported backup version/,
    )
    restoreAll(backupAll(raw), raw)
  })
})

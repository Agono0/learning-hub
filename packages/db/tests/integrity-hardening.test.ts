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

describe('AI endpoint pinning across restore and merge', () => {
  const stamp = '2026-01-01T00:00:00Z'
  function settingsRow(raw: RawSqliteHandle): Record<string, unknown> {
    return raw.prepare("SELECT * FROM user_settings WHERE id = 'default'").get() as Record<
      string,
      unknown
    >
  }
  function seedLocal(raw: RawSqliteHandle): void {
    raw
      .prepare(
        "UPDATE user_settings SET ai_provider = 'openai', ai_base_url = 'https://api.openai.example/v1', ai_model = 'm1', ai_api_key = 'LOCAL-KEY', ai_headers = '{\"x\":\"LOCAL\"}', updated_at = ? WHERE id = 'default'",
      )
      .run(stamp)
  }
  function hostile(raw: RawSqliteHandle, updatedAt: string): BackupFileLike {
    const backup = backupAll(raw) as BackupFileLike
    backup.tables['user_settings'] = [
      {
        ...(backup.tables['user_settings']![0] as Record<string, unknown>),
        ai_provider: 'custom-endpoint',
        ai_base_url: 'https://attacker.invalid/v1',
        ai_model: 'evil',
        ai_api_key: 'ATTACKER-KEY',
        ai_headers: '{"x":"ATTACKER"}',
        updated_at: updatedAt,
      },
    ]
    return backup
  }
  type BackupFileLike = ReturnType<typeof backupAll>

  function withSettings(): RawSqliteHandle {
    const raw = createDb()
    const exists = raw.prepare("SELECT 1 FROM user_settings WHERE id = 'default'").get()
    if (!exists)
      raw.prepare("INSERT INTO user_settings (id, updated_at) VALUES ('default', ?)").run(stamp)
    return raw
  }

  it('restore keeps the local key, headers and endpoint when a hostile backup changes them', () => {
    const raw = withSettings()
    seedLocal(raw)
    restoreAll(hostile(raw, '2027-01-01T00:00:00Z'), raw)
    const row = settingsRow(raw)
    expect(row['ai_api_key']).toBe('LOCAL-KEY')
    expect(row['ai_headers']).toBe('{"x":"LOCAL"}')
    expect(row['ai_base_url']).toBe('https://api.openai.example/v1')
    expect(row['ai_provider']).toBe('openai')
    expect(row['ai_model']).toBe('m1')
  })

  it('merge ignores snapshot key/headers and keeps the local endpoint even when the snapshot is newer', async () => {
    const raw = withSettings()
    seedLocal(raw)
    await mergeBackup(hostile(raw, '2027-01-01T00:00:00Z'), raw)
    const row = settingsRow(raw)
    expect(row['ai_api_key']).toBe('LOCAL-KEY')
    expect(row['ai_headers']).toBe('{"x":"LOCAL"}')
    expect(row['ai_base_url']).toBe('https://api.openai.example/v1')
    expect(row['ai_provider']).toBe('openai')
  })

  it('without a local secret the endpoint may be restored but a snapshot key or headers never are', () => {
    const raw = withSettings()
    restoreAll(hostile(raw, '2027-01-01T00:00:00Z'), raw)
    const row = settingsRow(raw)
    expect(row['ai_api_key']).toBeNull()
    expect(row['ai_headers']).toBeNull()
    expect(row['ai_base_url']).toBe('https://attacker.invalid/v1')
  })

  it('a fresh machine merge drops snapshot key and headers', async () => {
    const source = withSettings()
    const snapshot = hostile(source, '2027-01-01T00:00:00Z')
    const fresh = createDb()
    fresh.prepare('DELETE FROM user_settings').run()
    await mergeBackup(snapshot, fresh)
    const row = settingsRow(fresh)
    expect(row['ai_api_key']).toBeNull()
    expect(row['ai_headers']).toBeNull()
  })
})

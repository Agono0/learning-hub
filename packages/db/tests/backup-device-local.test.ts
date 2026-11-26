/**
 * restoreAll keeps every device-local table (DEVICE_LOCAL_TABLES) as it is on this device and
 * never imports rows for them from the backup. Synthetic :memory: databases only.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { initDb, type RawSqliteHandle } from '../src/index'
import { backupAll, restoreAll, DEVICE_LOCAL_TABLES, type BackupFile } from '../src/backup'

let ddlSource: RawSqliteHandle
beforeAll(async () => {
  ddlSource = (await initDb({ path: ':memory:' })).$client
})

function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const ddls = ddlSource
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%' AND sql IS NOT NULL",
    )
    .all() as { sql: string }[]
  for (const { sql } of ddls) sqlite.exec(sql)
  return sqlite
}

const rows = (db: Database.Database, table: string) =>
  db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all() as Record<string, unknown>[]

function seedLocal(db: Database.Database) {
  db.prepare(
    "INSERT INTO focus_bridge (id, pairing_token, updated_at) VALUES ('default', 'LOCAL-TOKEN', '2026-01-01T00:00:00Z')",
  ).run()
  db.prepare(
    "INSERT INTO online_identity (mode, user_id, alias, priv_key) VALUES ('device_key', 'usr_local', 'Me', 'LOCAL-PRIV')",
  ).run()
}

describe('restoreAll keeps device-local tables', () => {
  it('lists the three device-local tables', () => {
    expect([...DEVICE_LOCAL_TABLES].sort()).toEqual([
      'focus_bridge',
      'online_identity',
      'sync_configs',
    ])
  })

  it('keeps the local focus_bridge row across a restore of a normal export', () => {
    const db = createTestDb()
    seedLocal(db)
    const before = rows(db, 'focus_bridge')
    expect(backupAll(db).tables['focus_bridge']).toEqual([])
    restoreAll(backupAll(db), db)
    expect(rows(db, 'focus_bridge')).toEqual(before)
    expect(rows(db, 'online_identity')).toHaveLength(1)
  })

  it('keeps it when the backup comes from a fresh database with empty tables', () => {
    const fresh = createTestDb()
    const backup = backupAll(fresh)
    const db = createTestDb()
    seedLocal(db)
    restoreAll(backup, db)
    expect(rows(db, 'focus_bridge')[0]).toMatchObject({ pairing_token: 'LOCAL-TOKEN' })
  })

  it('keeps it when a legacy backup has no entry for the device-local tables', () => {
    const legacy: BackupFile = { ...backupAll(createTestDb()), tables: {} }
    const db = createTestDb()
    seedLocal(db)
    restoreAll(legacy, db)
    expect(rows(db, 'focus_bridge')[0]).toMatchObject({ pairing_token: 'LOCAL-TOKEN' })
    expect(rows(db, 'online_identity')[0]).toMatchObject({ priv_key: 'LOCAL-PRIV' })
  })

  it('does not import a foreign device-local row from the backup', () => {
    const base = backupAll(createTestDb())
    const foreign: BackupFile = {
      ...base,
      tables: {
        ...base.tables,
        focus_bridge: [
          { id: 'default', pairing_token: 'FOREIGN-TOKEN', updated_at: '2026-02-02T00:00:00Z' },
        ],
        online_identity: [
          { id: 9, mode: 'device_key', user_id: 'usr_foreign', priv_key: 'FOREIGN' },
        ],
      },
    }
    // Local row present: it stays and the foreign one is ignored.
    const db = createTestDb()
    seedLocal(db)
    restoreAll(foreign, db)
    expect(rows(db, 'focus_bridge')).toHaveLength(1)
    expect(rows(db, 'focus_bridge')[0]).toMatchObject({ pairing_token: 'LOCAL-TOKEN' })
    expect(rows(db, 'online_identity').map((r) => r['user_id'])).toEqual(['usr_local'])
    // No local row: the foreign one is not imported either.
    const empty = createTestDb()
    restoreAll(foreign, empty)
    expect(rows(empty, 'focus_bridge')).toEqual([])
    expect(rows(empty, 'online_identity')).toEqual([])
  })

  it('keeps sync_configs local, ignores a foreign one, and still restores ordinary tables', () => {
    const src = createTestDb()
    src
      .prepare(
        "INSERT INTO focus_allowlists (name, domains, apps, created_at, updated_at) VALUES ('docs', '[]', '[]', 'x', 'x')",
      )
      .run()
    const backup = backupAll(src)
    backup.tables['sync_configs'] = [
      { id: 'default', provider: 'github', config_json: '{"pat":"FOREIGN"}', updated_at: 'x' },
    ]
    const db = createTestDb()
    seedLocal(db)
    db.prepare(
      "INSERT INTO sync_configs (id, provider, config_json, updated_at) VALUES ('default', 'webdav', '{\"pw\":\"LOCAL\"}', 'y')",
    ).run()
    db.prepare(
      "INSERT INTO focus_allowlists (name, domains, apps, created_at, updated_at) VALUES ('stale', '[]', '[]', 'x', 'x')",
    ).run()
    const result = restoreAll(backup, db)
    expect(result.rows).toBeGreaterThan(0)
    expect(rows(db, 'focus_allowlists').map((r) => r['name'])).toEqual(['docs'])
    expect(rows(db, 'sync_configs')).toHaveLength(1)
    expect(rows(db, 'sync_configs')[0]).toMatchObject({ provider: 'webdav' })
  })
})

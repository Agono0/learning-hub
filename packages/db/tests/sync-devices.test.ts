import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'
import { listSyncDevices, touchSyncDevice, upsertSyncDevice } from '../src/sync'
import { executeCloudSync, type FetchLike } from '../src/cloud-sync'
import { getSyncConfig, saveSyncConfig } from '../src/sync'

function createDeviceDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  return { sqlite, raw }
}

describe('sync device roster (M19)', () => {
  it('upserts idempotently by deviceId and updates labels in place', () => {
    const { raw, sqlite } = createDeviceDb()
    upsertSyncDevice({ deviceId: 'dev-aaaaaaaa-1', name: 'Desk PC', platform: 'windows' }, raw)
    upsertSyncDevice(
      { deviceId: 'dev-aaaaaaaa-1', name: 'Desk PC (renamed)', platform: 'windows' },
      raw,
    )
    expect(listSyncDevices('dev-aaaaaaaa-1', raw)).toHaveLength(1)

    const [row] = listSyncDevices('dev-aaaaaaaa-1', raw)
    expect(row!.name).toBe('Desk PC (renamed)')
    expect(row!.isThisDevice).toBe(true)
    sqlite.close()
  })

  it('records push/pull touches and orders the roster by last activity', () => {
    const { raw, sqlite } = createDeviceDb()
    upsertSyncDevice({ deviceId: 'dev-aaaaaaaa-1', name: 'A' }, raw)
    upsertSyncDevice({ deviceId: 'dev-bbbbbbbb-2', name: 'B' }, raw)
    touchSyncDevice('dev-aaaaaaaa-1', 'push', 'rev-1', raw)

    let rows = listSyncDevices('dev-bbbbbbbb-2', raw)
    expect(rows[0]!.deviceId).toBe('dev-aaaaaaaa-1') // pushed most recently
    expect(rows[0]!.lastPushAt).not.toBeNull()
    expect(rows[0]!.lastRevision).toBe('rev-1')
    expect(rows[1]!.isThisDevice).toBe(true)
    expect(rows[1]!.lastPushAt).toBeNull()

    touchSyncDevice('dev-bbbbbbbb-2', 'pull', 'rev-1', raw)
    rows = listSyncDevices(null, raw)
    expect(rows.map((r) => r.isThisDevice)).toEqual([false, false])
    sqlite.close()
  })

  it('returns [] on databases without the table (pre-migration safety)', () => {
    const sqlite = new Database(':memory:')
    const raw = sqlite as unknown as RawSqliteHandle
    expect(listSyncDevices(null, raw)).toEqual([])
    sqlite.close()
  })

  it('converges the roster across two devices through a real cloud sync round-trip', async () => {
    // Minimal WebDAV mock — the shared snapshot blob lives in memory.
    const cloudStore = new Map<string, string>()
    const mockFetch: FetchLike = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url === 'https://dav.example.com/sync.json') {
        if (method === 'PUT') {
          cloudStore.set('webdav', String(init?.body))
          return new Response('', { status: 201, headers: { etag: '"dav-1"' } })
        }
        const stored = cloudStore.get('webdav')
        return stored
          ? new Response(stored, { status: 200, headers: { etag: '"dav-1"' } })
          : new Response('', { status: 404 })
      }
      throw new Error(`Unexpected URL in mockFetch: ${method} ${url}`)
    }

    const davCfg = { url: 'https://dav.example.com/sync.json', username: 'u', password: 'p' }

    // Device A: a deck + its roster row, pushed to the shared target.
    const devA = createDeviceDb()
    devA.raw
      .prepare(`INSERT INTO decks (id, name, created_at) VALUES (1, 'Shared Deck', ?)`)
      .run(new Date().toISOString())
    saveSyncConfig({ provider: 'webdav', config: davCfg, encryptionEnabled: false }, devA.raw)

    const syncA = await executeCloudSync({
      action: 'sync',
      device: { deviceId: 'dev-aaaaaaaa-1', name: 'Desk PC', platform: 'windows' },
      database: devA.raw,
      fetchFn: mockFetch,
    })
    expect(syncA.pushed).toBe(true)
    expect(listSyncDevices('dev-aaaaaaaa-1', devA.raw)).toHaveLength(1)

    // Device B: pulls the snapshot — deck arrives, and the roster carries A's row.
    const devB = createDeviceDb()
    saveSyncConfig({ provider: 'webdav', config: davCfg, encryptionEnabled: false }, devB.raw)
    const syncB = await executeCloudSync({
      action: 'sync',
      device: { deviceId: 'dev-bbbbbbbb-2', name: 'Phone', platform: 'android' },
      database: devB.raw,
      fetchFn: mockFetch,
    })
    expect(syncB.pulled).toBe(true)
    expect(syncB.pushed).toBe(true)

    const bRoster = listSyncDevices('dev-bbbbbbbb-2', devB.raw)
    expect(bRoster.map((r) => r.deviceId).sort()).toEqual(['dev-aaaaaaaa-1', 'dev-bbbbbbbb-2'])
    expect(bRoster.find((r) => r.deviceId === 'dev-aaaaaaaa-1')?.name).toBe('Desk PC')

    const deckNames = devB.raw.prepare('SELECT name FROM decks ORDER BY name').all() as {
      name: string
    }[]
    expect(deckNames).toEqual([{ name: 'Shared Deck' }])

    // Device A pulls again — sees B joined, deck count stable (no duplicate rows).
    const syncA2 = await executeCloudSync({
      action: 'sync',
      device: { deviceId: 'dev-aaaaaaaa-1', name: 'Desk PC', platform: 'windows' },
      database: devA.raw,
      fetchFn: mockFetch,
    })
    expect(syncA2.pulled).toBe(true)
    const aRoster = listSyncDevices('dev-aaaaaaaa-1', devA.raw)
    expect(aRoster.map((r) => r.deviceId).sort()).toEqual(['dev-aaaaaaaa-1', 'dev-bbbbbbbb-2'])
    expect(aRoster.find((r) => r.deviceId === 'dev-aaaaaaaa-1')?.isThisDevice).toBe(true)
    expect(aRoster.find((r) => r.deviceId === 'dev-bbbbbbbb-2')?.name).toBe('Phone')

    devA.sqlite.close()
    devB.sqlite.close()
  })

  it('keeps the migration idempotent and the schema table present after runMigrations', () => {
    const { raw, sqlite } = createDeviceDb()
    // runMigrations already executed in createDeviceDb — rerunning must be safe.
    expect(() => runMigrations(raw, MIGRATIONS)).not.toThrow()
    const tables = raw
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='sync_devices'`)
      .all()
    expect(tables).toHaveLength(1)
    expect(getSyncConfig({ database: raw }).provider).toBe('none')
    sqlite.close()
  })
})

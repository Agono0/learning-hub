import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'
import { backupAll, restoreAll } from '../src/backup'
import { mergeBackup, saveSyncConfig } from '../src/sync'
import { executeCloudSync, type FetchLike } from '../src/cloud-sync'
import { getOnlineIdentity } from '../src/repos/online'

// Synthetic markers only: no real key material is generated or read.
const KEY_A = 'SYNTHETIC-PRIV-MARKER-A'
const KEY_B = 'SYNTHETIC-PRIV-MARKER-B'

function createDeviceDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema })
  return { sqlite, raw, db }
}

function seedIdentity(dev: ReturnType<typeof createDeviceDb>, userId: string, priv: string) {
  dev.db
    .insert(schema.onlineIdentity)
    .values({
      mode: 'device_key',
      userId,
      alias: `alias-${userId}`,
      pubKey: `PUB-${userId}`,
      privKey: priv,
      registeredAt: '2026-11-01T00:00:00.000Z',
    })
    .run()
}

function identityRows(dev: ReturnType<typeof createDeviceDb>) {
  return dev.sqlite.prepare('SELECT * FROM online_identity').all() as Record<string, unknown>[]
}

describe('online_identity is device-local', () => {
  it('backupAll exports the table empty and no marker appears anywhere in the envelope', () => {
    const a = createDeviceDb()
    seedIdentity(a, 'usr_a', KEY_A)
    const snap = backupAll(a.raw)
    expect(snap.tables['online_identity']).toEqual([])
    expect(JSON.stringify(snap)).not.toContain(KEY_A)
    a.sqlite.close()
  })

  it('cloud sync push payload never contains the private key (unencrypted provider)', async () => {
    const a = createDeviceDb()
    seedIdentity(a, 'usr_a', KEY_A)
    saveSyncConfig(
      {
        provider: 'webdav',
        config: { url: 'https://dav.example.com/sync.json', username: 'u', password: 'p' },
        encryptionEnabled: false,
      },
      a.raw,
    )
    const bodies: string[] = []
    const fetchFn: FetchLike = async (_url, init) => {
      if (init?.method === 'PUT') {
        bodies.push(String(init.body))
        return new Response('', { status: 201 })
      }
      return new Response('', { status: 404 })
    }
    await executeCloudSync({ action: 'push', database: a.raw, fetchFn })
    expect(bodies.length).toBeGreaterThan(0)
    for (const b of bodies) {
      expect(b).not.toContain(KEY_A)
      expect(b).not.toContain('PUB-usr_a')
    }
    a.sqlite.close()
  })

  it('restoreAll and mergeBackup keep the complete local identity, even from a legacy backup with a key', async () => {
    const b = createDeviceDb()
    seedIdentity(b, 'usr_b', KEY_B)
    const before = identityRows(b)

    // A legacy backup written by the old code: includes another device's identity row.
    const legacy = backupAll(createDeviceDb().raw)
    legacy.tables['online_identity'] = [
      {
        id: 1,
        mode: 'device_key',
        user_id: 'usr_legacy',
        alias: 'legacy',
        pub_key: 'PUB-usr_legacy',
        priv_key: KEY_A,
        registered_at: '2026-10-01T00:00:00.000Z',
      },
    ]

    await mergeBackup(legacy, b.raw)
    expect(identityRows(b)).toEqual(before)
    restoreAll(legacy, b.raw)
    expect(identityRows(b)).toEqual(before)
    expect(JSON.stringify(identityRows(b))).not.toContain(KEY_A)
    b.sqlite.close()
  })

  it('fresh machine restore: no key, no device_key mode, a usable offline identity is created', () => {
    const a = createDeviceDb()
    seedIdentity(a, 'usr_a', KEY_A)
    const snap = backupAll(a.raw)

    const fresh = createDeviceDb()
    restoreAll(snap, fresh.raw)
    expect(identityRows(fresh)).toEqual([])
    const created = getOnlineIdentity(fresh.db as never)
    expect(created.mode).toBe('offline')
    expect(created.privKey).toBeNull()
    expect(created.pubKey).toBeNull()
    expect(created.userId).not.toBe('usr_a')
    a.sqlite.close()
    fresh.sqlite.close()
  })
})

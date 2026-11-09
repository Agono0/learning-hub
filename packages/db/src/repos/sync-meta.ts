/**
 * Sync metadata repository — device-local cloud sync configuration,
 * device roster, and deletion tombstones for distributed multi-device LWW sync.
 */
import { getRawDb, type RawSqliteHandle } from '../index'
import { ValidationError } from '../review-service'

export const SECRET_CONFIG_KEYS = new Set([
  'accessToken',
  'refreshToken',
  'token',
  'password',
  'clientSecret',
])

export type SyncProviderKind = 'none' | 'dropbox' | 'github' | 'gdrive' | 'webdav'

export interface SyncConfigRecord {
  provider: SyncProviderKind
  config: Record<string, string>
  encryptionEnabled: boolean
  hasPassphrase: boolean
  passphrase?: string | null
  lastSyncedAt: string | null
  lastSyncRevision: string | null
  updatedAt: string
}

export interface SyncDeviceInput {
  deviceId: string
  name: string
  platform?: string | null
}

export interface SyncDeviceRow {
  deviceId: string
  name: string
  platform: string | null
  lastPushAt: string | null
  lastPullAt: string | null
  lastRevision: string | null
  createdAt: string
}

export interface SyncTombstoneRow {
  id?: number
  tableName: string
  recordKey: string
  deletedAt: string
}

/** Read device-local sync configuration; masks secrets when `maskSecrets` is true. */
export function getSyncConfig(
  opts: { maskSecrets?: boolean; database?: RawSqliteHandle } = {},
): SyncConfigRecord {
  const database = opts.database ?? getRawDb()
  const row = database.prepare('SELECT * FROM "sync_configs" WHERE id = ?').get('default') as
    | {
        provider: string
        config_json: string
        encryption_enabled: number
        passphrase: string | null
        last_synced_at: string | null
        last_sync_revision: string | null
        updated_at: string
      }
    | undefined

  if (!row) {
    return {
      provider: 'none',
      config: {},
      encryptionEnabled: false,
      hasPassphrase: false,
      passphrase: opts.maskSecrets ? undefined : null,
      lastSyncedAt: null,
      lastSyncRevision: null,
      updatedAt: '',
    }
  }

  let parsedConfig: Record<string, string> = {}
  try {
    const raw = JSON.parse(row.config_json) as Record<string, unknown>
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') parsedConfig[k] = v
    }
  } catch {
    parsedConfig = {}
  }

  if (opts.maskSecrets) {
    const masked: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsedConfig)) {
      if (SECRET_CONFIG_KEYS.has(k) && v.length > 0) {
        masked[k] = v.length <= 8 ? '••••' : `${v.slice(0, 4)}••••${v.slice(-3)}`
        masked[`has_${k}`] = 'true'
      } else {
        masked[k] = v
      }
    }
    parsedConfig = masked
  }

  return {
    provider: (row.provider as SyncProviderKind) || 'none',
    config: parsedConfig,
    encryptionEnabled: Boolean(row.encryption_enabled),
    hasPassphrase: Boolean(row.passphrase),
    passphrase: opts.maskSecrets ? undefined : row.passphrase,
    lastSyncedAt: row.last_synced_at,
    lastSyncRevision: row.last_sync_revision,
    updatedAt: row.updated_at,
  }
}

/** Upsert device-local sync configuration, keeping existing secrets when empty strings are sent. */
export function saveSyncConfig(
  patch: {
    provider?: SyncProviderKind
    config?: Record<string, string>
    encryptionEnabled?: boolean
    passphrase?: string | null
    lastSyncedAt?: string | null
    lastSyncRevision?: string | null
  },
  database: RawSqliteHandle = getRawDb(),
): SyncConfigRecord {
  const current = getSyncConfig({ maskSecrets: false, database })
  const nextProvider = patch.provider ?? current.provider
  const nextConfig: Record<string, string> = { ...current.config }
  if (patch.config) {
    for (const [k, v] of Object.entries(patch.config)) {
      if (k.startsWith('has_')) continue
      // Keep existing secret when empty or masked placeholder is submitted
      if (SECRET_CONFIG_KEYS.has(k) && (v === '' || v.includes('••••'))) continue
      nextConfig[k] = v
    }
  }

  const nextEncryption =
    patch.encryptionEnabled !== undefined ? patch.encryptionEnabled : current.encryptionEnabled
  let nextPassphrase = current.passphrase ?? null
  if (patch.passphrase !== undefined) {
    if (patch.passphrase === null) nextPassphrase = null
    else if (patch.passphrase !== '' && !patch.passphrase.includes('••••')) {
      nextPassphrase = patch.passphrase
    }
  }

  const updatedAt = new Date().toISOString()
  const lastSyncedAt = patch.lastSyncedAt !== undefined ? patch.lastSyncedAt : current.lastSyncedAt
  const lastSyncRevision =
    patch.lastSyncRevision !== undefined ? patch.lastSyncRevision : current.lastSyncRevision

  database
    .prepare(
      `INSERT INTO "sync_configs" (id, provider, config_json, encryption_enabled, passphrase, last_synced_at, last_sync_revision, updated_at)
       VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider = excluded.provider,
         config_json = excluded.config_json,
         encryption_enabled = excluded.encryption_enabled,
         passphrase = excluded.passphrase,
         last_synced_at = excluded.last_synced_at,
         last_sync_revision = excluded.last_sync_revision,
         updated_at = excluded.updated_at`,
    )
    .run(
      nextProvider,
      JSON.stringify(nextConfig),
      nextEncryption ? 1 : 0,
      nextPassphrase,
      lastSyncedAt,
      lastSyncRevision,
      updatedAt,
    )

  return getSyncConfig({ maskSecrets: false, database })
}

/**
 * Insert or refresh this device's roster row. Idempotent: re-syncing from the
 * same device only updates the label/platform, never duplicates rows.
 */
export function upsertSyncDevice(
  device: SyncDeviceInput,
  database: RawSqliteHandle = getRawDb(),
): void {
  if (!device.deviceId.trim() || !device.name.trim()) {
    throw new ValidationError('sync device requires deviceId and name')
  }
  database
    .prepare(
      `INSERT INTO "sync_devices" (device_id, name, platform, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         name = excluded.name,
         platform = excluded.platform`,
    )
    .run(device.deviceId, device.name, device.platform ?? null, new Date().toISOString())
}

/** Record that this device pushed or pulled at `revision` (no-op if unknown device). */
export function touchSyncDevice(
  deviceId: string,
  action: 'push' | 'pull',
  revision: string | null,
  database: RawSqliteHandle = getRawDb(),
): void {
  const at = new Date().toISOString()
  database
    .prepare(
      action === 'push'
        ? `UPDATE "sync_devices" SET last_push_at = ?, last_revision = ? WHERE device_id = ?`
        : `UPDATE "sync_devices" SET last_pull_at = ?, last_revision = ? WHERE device_id = ?`,
    )
    .run(at, revision, deviceId)
}

/**
 * The device roster sharing this sync target, most-recently-active first.
 * `thisDeviceId` (the caller's localStorage UUID) marks which row is "here".
 */
export function listSyncDevices(
  thisDeviceId?: string | null,
  database: RawSqliteHandle = getRawDb(),
): Array<SyncDeviceRow & { isThisDevice: boolean }> {
  const hasTable = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_devices'`)
    .get()
  if (!hasTable) return []
  const rows = database
    .prepare(
      `SELECT device_id, name, platform, last_push_at, last_pull_at, last_revision, created_at
       FROM "sync_devices"
       ORDER BY COALESCE(last_push_at, last_pull_at, created_at) DESC`,
    )
    .all() as {
    device_id: string
    name: string
    platform: string | null
    last_push_at: string | null
    last_pull_at: string | null
    last_revision: string | null
    created_at: string
  }[]
  return rows.map((r) => ({
    deviceId: r.device_id,
    name: r.name,
    platform: r.platform,
    lastPushAt: r.last_push_at,
    lastPullAt: r.last_pull_at,
    lastRevision: r.last_revision,
    createdAt: r.created_at,
    isThisDevice: r.device_id === thisDeviceId,
  }))
}

/** Record a deletion tombstone so future cloud merges respect intentional deletes. */
export function recordDeletionTombstone(
  tableName: string,
  recordKey: string,
  database: RawSqliteHandle = getRawDb(),
): void {
  const hasTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_tombstones'")
    .get()
  if (!hasTable) return
  const deletedAt = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO "sync_tombstones" (table_name, record_key, deleted_at)
       VALUES (?, ?, ?)
       ON CONFLICT(table_name, record_key) DO UPDATE SET deleted_at = excluded.deleted_at`,
    )
    .run(tableName, recordKey, deletedAt)
}

/** Alias for `recordDeletionTombstone`. */
export const recordTombstone = recordDeletionTombstone

/**
 * List deletion tombstones, optionally filtered by table name or deletion timestamp.
 */
export function listTombstones(
  opts: { tableName?: string; since?: string; database?: RawSqliteHandle } = {},
): SyncTombstoneRow[] {
  const database = opts.database ?? getRawDb()
  const hasTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_tombstones'")
    .get()
  if (!hasTable) return []
  let sql = 'SELECT id, table_name, record_key, deleted_at FROM "sync_tombstones" WHERE 1=1'
  const params: unknown[] = []
  if (opts.tableName) {
    sql += ' AND table_name = ?'
    params.push(opts.tableName)
  }
  if (opts.since) {
    sql += ' AND deleted_at >= ?'
    params.push(opts.since)
  }
  sql += ' ORDER BY deleted_at ASC'
  const rows = database.prepare(sql).all(...params) as {
    id: number
    table_name: string
    record_key: string
    deleted_at: string
  }[]
  return rows.map((r) => ({
    id: r.id,
    tableName: r.table_name,
    recordKey: r.record_key,
    deletedAt: r.deleted_at,
  }))
}

/**
 * Delete a specific tombstone row (e.g. upon un-tombstoning or explicit purge).
 */
export function deleteTombstone(
  tableName: string,
  recordKey: string,
  database: RawSqliteHandle = getRawDb(),
): boolean {
  const hasTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_tombstones'")
    .get()
  if (!hasTable) return false
  const res = database
    .prepare('DELETE FROM "sync_tombstones" WHERE table_name = ? AND record_key = ?')
    .run(tableName, recordKey)
  return res.changes > 0
}

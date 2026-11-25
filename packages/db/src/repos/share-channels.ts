/**
 * Shared Material Channels repository — local persistence for lh-share/v2
 * subscriptions, mirrored items (with learner state), and the append-only
 * sync-record log. Implements the core `ChannelSyncStore` contract so the
 * SyncCoordinator can run against SQLite in every host (web, MCP, CLI,
 * headless server).
 *
 * Writes go through raw SQL over the RawSqliteHandle so the store works on
 * both drivers (better-sqlite3 and the wasm driver) exactly like sync-meta.
 */
import {
  InMemoryChannelSyncStore,
  type ChannelSyncStore,
  type LocalItem,
  type Subscription,
  type SyncRecord,
} from '@learning-hub/core'

import { getRawDb, type RawSqliteHandle } from '../index'

/** A subscription row joined with the manifest fields the dashboard shows. */
export interface ChannelSubscriptionRow extends Subscription {
  title: string
  authorHandle: string
  contentType: string
  visibility: string
  /** Manifest's currentVersion as last seen by a sync. */
  seenVersion: number
  /** Convenience flag: the publisher has versions we have not applied. */
  hasPending: boolean
}

interface SubscriptionSqlRow {
  channel_id: string
  local_version: number
  subscribed_at: string
  last_sync_at: string | null
  title: string
  author_handle: string
  content_type: string
  visibility: string
  seen_version: number
}

interface ItemSqlRow {
  channel_id: string
  item_key: string
  channel_content: string | null
  channel_revision: number | null
  local_content: string
  learner_state: string
}

interface RecordSqlRow {
  id: number
  channel_id: string
  at: string
  from_version: number
  to_version: number
  outcome: string
  merge: string | null
  applied_versions: string | null
  error_code: string | null
  error_message: string | null
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === undefined) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function rowToSubscription(row: SubscriptionSqlRow): ChannelSubscriptionRow {
  return {
    channelId: row.channel_id,
    localVersion: row.local_version,
    subscribedAt: row.subscribed_at,
    lastSyncAt: row.last_sync_at,
    title: row.title,
    authorHandle: row.author_handle,
    contentType: row.content_type,
    visibility: row.visibility,
    seenVersion: row.seen_version,
    hasPending: row.seen_version > row.local_version,
  }
}

function rowToItem(row: ItemSqlRow): LocalItem {
  const isLocal = row.item_key.startsWith('local:')
  return {
    channelItemId: isLocal ? null : row.item_key,
    channelContent: parseJson<Record<string, unknown> | null>(row.channel_content, null),
    channelRevision: row.channel_revision,
    localContent: parseJson<Record<string, unknown>>(row.local_content, {}),
    learnerState: parseJson<Record<string, unknown>>(row.learner_state, {}),
  }
}

function itemKeyOf(item: LocalItem, index: number): string {
  return item.channelItemId ?? `local:${index}:${stableItemFingerprint(item.localContent)}`
}

/** Deterministic fingerprint so re-saving an unchanged roster is idempotent. */
function stableItemFingerprint(content: Record<string, unknown>): string {
  const json = JSON.stringify(content, Object.keys(content).sort())
  let hash = 0
  for (let i = 0; i < json.length; i += 1) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

/**
 * ChannelSyncStore over SQLite. All methods are synchronous because both
 * drivers are synchronous; the core interface is synchronous too.
 */
export class DbChannelSyncStore implements ChannelSyncStore {
  private readonly database: RawSqliteHandle

  constructor(database?: RawSqliteHandle) {
    this.database = database ?? getRawDb()
  }

  getSubscription(channelId: string): Subscription | null {
    const row = this.database
      .prepare('SELECT * FROM "share_channel_subscriptions" WHERE channel_id = ?')
      .get(channelId) as SubscriptionSqlRow | undefined
    if (!row) return null
    const full = rowToSubscription(row)
    return {
      channelId: full.channelId,
      localVersion: full.localVersion,
      subscribedAt: full.subscribedAt,
      lastSyncAt: full.lastSyncAt,
    }
  }

  listSubscriptions(): Subscription[] {
    const rows = this.database
      .prepare('SELECT * FROM "share_channel_subscriptions" ORDER BY channel_id')
      .all() as SubscriptionSqlRow[]
    return rows.map((r) => ({
      channelId: r.channel_id,
      localVersion: r.local_version,
      subscribedAt: r.subscribed_at,
      lastSyncAt: r.last_sync_at,
    }))
  }

  saveSubscription(subscription: Subscription): void {
    this.database
      .prepare(
        `INSERT INTO "share_channel_subscriptions"
           (channel_id, local_version, subscribed_at, last_sync_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(channel_id) DO UPDATE SET
           local_version = excluded.local_version,
           last_sync_at = excluded.last_sync_at`,
      )
      .run(
        subscription.channelId,
        subscription.localVersion,
        subscription.subscribedAt,
        subscription.lastSyncAt,
      )
  }

  getLocalItems(channelId: string): LocalItem[] {
    const rows = this.database
      .prepare('SELECT * FROM "share_channel_items" WHERE channel_id = ? ORDER BY item_key')
      .all(channelId) as ItemSqlRow[]
    return rows.map(rowToItem)
  }

  saveLocalItems(channelId: string, items: LocalItem[]): void {
    const keys = items.map((item, i) => itemKeyOf(item, i))
    this.database.prepare('DELETE FROM "share_channel_items" WHERE channel_id = ?').run(channelId)
    const insert = this.database.prepare(
      `INSERT INTO "share_channel_items"
         (channel_id, item_key, channel_content, channel_revision, local_content, learner_state)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    items.forEach((item, i) => {
      insert.run(
        channelId,
        keys[i],
        item.channelContent === null ? null : JSON.stringify(item.channelContent),
        item.channelRevision,
        JSON.stringify(item.localContent),
        JSON.stringify(item.learnerState),
      )
    })
  }

  appendSyncRecord(record: SyncRecord): void {
    this.database
      .prepare(
        `INSERT INTO "share_channel_sync_records"
           (channel_id, at, from_version, to_version, outcome, merge, applied_versions, error_code, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.channelId,
        record.at,
        record.fromVersion,
        record.toVersion,
        record.outcome,
        record.merge ? JSON.stringify(record.merge) : null,
        record.appliedVersions ? JSON.stringify(record.appliedVersions) : null,
        record.errorCode ?? null,
        record.errorMessage ?? null,
      )
  }
}

/* ==========================================================================
 * DASHBOARD QUERIES
 * ========================================================================== */

/** Subscriptions with display fields and pending-update flags, for the dashboard. */
export function listChannelSubscriptions(
  opts: { database?: RawSqliteHandle } = {},
): ChannelSubscriptionRow[] {
  const database = opts.database ?? getRawDb()
  const rows = database
    .prepare('SELECT * FROM "share_channel_subscriptions" ORDER BY subscribed_at DESC')
    .all() as SubscriptionSqlRow[]
  return rows.map(rowToSubscription)
}

/**
 * Upsert the denormalized manifest display fields after a successful fetch,
 * including seenVersion, which drives the "updates available" banner.
 */
export function refreshSubscriptionManifestView(input: {
  channelId: string
  title: string
  authorHandle: string
  contentType: string
  visibility: string
  seenVersion: number
  database?: RawSqliteHandle
}): void {
  const database = input.database ?? getRawDb()
  database
    .prepare(
      `UPDATE "share_channel_subscriptions"
       SET title = ?, author_handle = ?, content_type = ?, visibility = ?, seen_version = ?
       WHERE channel_id = ?`,
    )
    .run(
      input.title,
      input.authorHandle,
      input.contentType,
      input.visibility,
      input.seenVersion,
      input.channelId,
    )
}

/** Most recent sync records for one channel, newest first. */
export function listSyncRecords(
  channelId: string,
  opts: { limit?: number; database?: RawSqliteHandle } = {},
): SyncRecord[] {
  const database = opts.database ?? getRawDb()
  const rows = database
    .prepare(
      `SELECT * FROM "share_channel_sync_records"
       WHERE channel_id = ? ORDER BY at DESC, id DESC LIMIT ?`,
    )
    .all(channelId, opts.limit ?? 20) as RecordSqlRow[]
  return rows.map((r) => ({
    channelId: r.channel_id,
    at: r.at,
    fromVersion: r.from_version,
    toVersion: r.to_version,
    outcome: r.outcome as SyncRecord['outcome'],
    merge: parseJson<SyncRecord['merge']>(r.merge, undefined),
    appliedVersions: parseJson<number[] | undefined>(r.applied_versions, undefined),
    errorCode: (r.error_code ?? undefined) as SyncRecord['errorCode'],
    errorMessage: r.error_message ?? undefined,
  }))
}

/** Latest sync outcome per channel, for a fleet-level health glance. */
export function latestSyncOutcomePerChannel(
  opts: { database?: RawSqliteHandle } = {},
): Record<string, { at: string; outcome: string }> {
  const database = opts.database ?? getRawDb()
  const rows = database
    .prepare(
      `SELECT channel_id, at, outcome FROM "share_channel_sync_records" r
       WHERE id = (SELECT MAX(id) FROM "share_channel_sync_records" WHERE channel_id = r.channel_id)`,
    )
    .all() as { channel_id: string; at: string; outcome: string }[]
  const out: Record<string, { at: string; outcome: string }> = {}
  for (const r of rows) out[r.channel_id] = { at: r.at, outcome: r.outcome }
  return out
}

/** In-memory fallback for hosts without a database (tests, offline CLI). */
export function createMemoryChannelSyncStore(): InMemoryChannelSyncStore {
  return new InMemoryChannelSyncStore()
}

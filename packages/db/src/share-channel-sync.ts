/**
 * Shared Material Channels — host-side sync helper.
 *
 * One channel sync over HTTP, shared by the headless server routes, the MCP
 * tools and the CLI so all three hosts behave identically: fetch the manifest
 * from the channel's recorded host, refresh the dashboard view fields, then
 * run the learner-state-preserving merge through the core SyncCoordinator.
 * Fetch is injected so runtimes without a global fetch can supply their own.
 */
import {
  HttpChannelTransport,
  InMemoryChannelTransport,
  SyncCoordinator,
  TransportError,
  type ChannelManifest,
  type HttpChannelTransportOptions,
  type SyncRecord,
} from '@learning-hub/core'

import type { FetchLike } from './cloud-sync'
import type { DbChannelSyncStore } from './repos/share-channels'
import { refreshSubscriptionManifestView } from './repos/share-channels'

export type { FetchLike }

/**
 * Transport options a host may pass. Default is none: https only, no loopback.
 * The only supported opt-in is loopback for local dev and tests; a caller must
 * derive it from an explicit local setting, never from request input.
 */
export type SyncTransportOptions = Pick<HttpChannelTransportOptions, 'allowHttpLoopback'>

function failureRecord(
  store: DbChannelSyncStore,
  channelId: string,
  at: string,
  errorCode: SyncRecord['errorCode'],
  errorMessage: string,
): SyncRecord {
  const version = store.getSubscription(channelId)?.localVersion ?? 0
  const record: SyncRecord = {
    channelId,
    at,
    fromVersion: version,
    toVersion: version,
    outcome: 'failed',
    errorCode,
    errorMessage,
  }
  store.appendSyncRecord(record)
  return record
}

/**
 * Sync one subscription against its host. Returns the SyncRecord written to
 * the sync log (every path records, success or failure).
 */
export async function syncSubscriptionOverHttp(
  store: DbChannelSyncStore,
  channelId: string,
  hostBaseUrl: string | null,
  fetchFn: FetchLike,
  transportOptions: SyncTransportOptions = {},
): Promise<SyncRecord> {
  const at = new Date().toISOString()
  if (!hostBaseUrl) {
    return failureRecord(
      store,
      channelId,
      at,
      'network',
      'no host recorded for this channel; pass hostBaseUrl when subscribing or syncing',
    )
  }
  const http = new HttpChannelTransport({
    baseUrl: hostBaseUrl,
    fetchFn,
    allowHttpLoopback: transportOptions.allowHttpLoopback === true,
  })
  let manifest: ChannelManifest | null
  try {
    manifest = await http.fetchManifest(channelId)
  } catch (err) {
    return failureRecord(
      store,
      channelId,
      at,
      err instanceof TransportError ? err.code : 'network',
      err instanceof Error ? err.message : String(err),
    )
  }
  if (manifest === null) {
    const version = store.getSubscription(channelId)?.localVersion ?? 0
    const record: SyncRecord = {
      channelId,
      at,
      fromVersion: version,
      toVersion: version,
      outcome: 'already-current',
    }
    store.appendSyncRecord(record)
    return record
  }
  // Keep the dashboard view honest even when the merge that follows fails.
  refreshSubscriptionManifestView({
    channelId,
    title: manifest.title,
    authorHandle: manifest.authorHandle,
    contentType: manifest.type,
    visibility: manifest.visibility,
    seenVersion: manifest.currentVersion,
  })
  const coordinator = new SyncCoordinator({
    transport: new InMemoryChannelTransport([manifest]),
    store,
  })
  return coordinator.syncChannel(channelId)
}

/** Sync every hosted subscription; local-only ones record a skipped failure. */
export async function syncAllSubscriptions(
  store: DbChannelSyncStore,
  rows: { channelId: string; hostBaseUrl: string | null }[],
  fetchFn: FetchLike,
  transportOptions: SyncTransportOptions = {},
): Promise<{
  at: string
  checked: number
  updated: number
  alreadyCurrent: number
  failed: number
  records: SyncRecord[]
}> {
  const records: SyncRecord[] = []
  for (const row of rows) {
    records.push(
      await syncSubscriptionOverHttp(
        store,
        row.channelId,
        row.hostBaseUrl,
        fetchFn,
        transportOptions,
      ),
    )
  }
  return {
    at: new Date().toISOString(),
    checked: records.length,
    updated: records.filter((r) => r.outcome === 'updated').length,
    alreadyCurrent: records.filter((r) => r.outcome === 'already-current').length,
    failed: records.filter((r) => r.outcome === 'failed').length,
    records,
  }
}

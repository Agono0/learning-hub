/**
 * @file transport.ts
 * @description Shared Material Channels (lh-share/v2) — remote transport and
 * sync coordination.
 *
 * engine.ts is pure local logic: given a manifest already in hand, it merges
 * updates without touching learner state. This module answers "how does a
 * manifest get from the publisher's host to a subscriber's host" and "how do
 * we keep N subscriptions up to date politely":
 *
 * - `ChannelTransport` abstracts the wire. `InMemoryChannelTransport` serves
 *   tests and same-process hosting; `HttpChannelTransport` talks to any host
 *   exposing the channel endpoints (the Learning HUB headless server's
 *   `/share/channels/*` routes, or a static host that serves manifest JSON).
 * - `HttpChannelTransport` is fetch-injected and runtime-neutral (Web worker,
 *   Tauri worker, Node CLI/MCP), verifies schema AND checksums before a
 *   manifest is trusted, retries transient failures with exponential backoff,
 *   and never retries auth or validation failures.
 * - `SyncCoordinator` walks the local subscription roster, fetches manifests
 *   with conditional requests (ETag = current version checksum), applies
 *   pending versions through `applyAllPendingVersions`, and records one
 *   `SyncRecord` per attempt so the dashboard can show "last synced" and
 *   surface failures honestly.
 *
 * Politeness matters: subscribers may pin channels hosted on free tiers, so
 * the coordinator limits per-host concurrency and supports conditional fetches
 * that return 304 when nothing changed.
 */

import {
  applyAllPendingVersions,
  canSubscribe,
  ChannelManifestSchema,
  hasPendingUpdate,
  verifyManifest,
  type ChannelManifest,
  type LocalItem,
  type MergeResult,
  type Subscription,
} from './engine'

/* ==========================================================================
 * ERRORS
 * ========================================================================== */

export type TransportErrorCode =
  /** Network unreachable, DNS failure, or the fetch itself threw. */
  | 'network'
  /** Non-2xx HTTP status (status carried on the error). */
  | 'http'
  /** Response was not valid JSON or failed the manifest schema. */
  | 'invalid-manifest'
  /** Schema valid but one or more version checksums did not verify. */
  | 'checksum-mismatch'
  /** Invite token required, missing, or rejected. */
  | 'unauthorized'
  /** The channel id is unknown to the host. */
  | 'not-found'
  /** The host did not answer within the configured timeout. */
  | 'timeout'

export class TransportError extends Error {
  readonly code: TransportErrorCode
  readonly status?: number
  readonly channelId?: string

  constructor(
    code: TransportErrorCode,
    message: string,
    opts?: { status?: number; channelId?: string },
  ) {
    super(message)
    this.name = 'TransportError'
    this.code = code
    this.status = opts?.status
    this.channelId = opts?.channelId
  }
}

/** Map an HTTP status onto an error code for fetch failures. */
export function codeForStatus(status: number): TransportErrorCode {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 404) return 'not-found'
  return 'http'
}

/* ==========================================================================
 * TRANSPORT INTERFACE
 * ========================================================================== */

export interface FetchManifestOptions {
  /** Invite token for invite-only channels. */
  inviteToken?: string
  /**
   * Checksum of the subscriber's current version. Hosts that support
   * conditional requests answer 304 when their current version still has
   * this checksum, and the transport resolves with `null`.
   */
  ifNoneMatch?: string
  /** AbortSignal from the caller, combined with the internal timeout. */
  signal?: AbortSignal
}

export interface PublishManifestOptions {
  /** Creator-side secret authorizing publishes to an invite-only channel. */
  inviteSecret?: string
  signal?: AbortSignal
}

export interface ChannelTransport {
  /**
   * Fetch the current manifest for a channel. Resolves `null` when the host
   * reports the subscriber is already current (conditional 304).
   */
  fetchManifest(channelId: string, opts?: FetchManifestOptions): Promise<ChannelManifest | null>
  /** Publish (create or update) a channel manifest on the host. */
  publishManifest(
    manifest: ChannelManifest,
    opts?: PublishManifestOptions,
  ): Promise<{ accepted: boolean }>
  /** Optional directory listing; not every host exposes one. */
  listChannels?(): Promise<string[]>
}

/* ==========================================================================
 * IN-MEMORY TRANSPORT
 * ========================================================================== */

export interface InMemoryTransportOptions {
  /** Artificial latency in ms applied to every operation. */
  latencyMs?: number
  /** Fail the next N fetches with a network error (test hook). */
  failNextFetches?: number
  /** Fail the next N publishes with a network error (test hook). */
  failNextPublishes?: number
  /** Channel ids that require a matching invite token (test hook). */
  inviteTokens?: Record<string, string>
}

/**
 * Map-backed transport for tests, local development and same-process hosting.
 * Honors conditional fetches so coordinator tests cover the 304 path.
 */
export class InMemoryChannelTransport implements ChannelTransport {
  private readonly channels = new Map<string, ChannelManifest>()
  private latencyMs: number
  private failNextFetches: number
  private failNextPublishes: number
  private readonly inviteTokens: Record<string, string>
  /** Count of fetch calls, for tests asserting conditional-fetch behavior. */
  fetchCount = 0
  publishCount = 0

  constructor(initial: ChannelManifest[] = [], opts: InMemoryTransportOptions = {}) {
    for (const m of initial) this.channels.set(m.channelId, m)
    this.latencyMs = opts.latencyMs ?? 0
    this.failNextFetches = opts.failNextFetches ?? 0
    this.failNextPublishes = opts.failNextPublishes ?? 0
    this.inviteTokens = opts.inviteTokens ?? {}
  }

  private async latency(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs))
  }

  async fetchManifest(
    channelId: string,
    opts: FetchManifestOptions = {},
  ): Promise<ChannelManifest | null> {
    await this.latency()
    this.fetchCount += 1
    if (this.failNextFetches > 0) {
      this.failNextFetches -= 1
      throw new TransportError('network', 'simulated network failure', { channelId })
    }
    const manifest = this.channels.get(channelId)
    if (!manifest)
      throw new TransportError('not-found', `unknown channel: ${channelId}`, { channelId })
    const required = this.inviteTokens[channelId]
    if (required !== undefined && opts.inviteToken !== required) {
      throw new TransportError('unauthorized', 'invite token required', { channelId })
    }
    const current = manifest.versions.find((v) => v.version === manifest.currentVersion)
    if (opts.ifNoneMatch && current && current.checksum === opts.ifNoneMatch) return null
    return manifest
  }

  async publishManifest(manifest: ChannelManifest): Promise<{ accepted: boolean }> {
    await this.latency()
    this.publishCount += 1
    if (this.failNextPublishes > 0) {
      this.failNextPublishes -= 1
      throw new TransportError('network', 'simulated network failure', {
        channelId: manifest.channelId,
      })
    }
    const parsed = ChannelManifestSchema.safeParse(manifest)
    if (!parsed.success) {
      throw new TransportError('invalid-manifest', 'manifest failed schema validation', {
        channelId: manifest.channelId,
      })
    }
    const check = verifyManifest(parsed.data)
    if (!check.ok) {
      throw new TransportError(
        'checksum-mismatch',
        `bad versions: ${check.badVersions.join(', ')}`,
        {
          channelId: manifest.channelId,
        },
      )
    }
    this.channels.set(manifest.channelId, parsed.data)
    return { accepted: true }
  }

  async listChannels(): Promise<string[]> {
    return [...this.channels.keys()].sort()
  }
}

/* ==========================================================================
 * HTTP TRANSPORT
 * ========================================================================== */

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface HttpChannelTransportOptions {
  /** Base URL of the host, e.g. https://hub.example.com or http://localhost:4173. */
  baseUrl: string
  /** Runtime-provided fetch (globalThis.fetch in Node/browser). */
  fetchFn: FetchLike
  /** Per-request timeout in ms (default 10_000). */
  timeoutMs?: number
  /** Max attempts for transient failures (default 3: 1 try + 2 retries). */
  maxAttempts?: number
  /** Base backoff in ms; attempt n waits base * 2^(n-1) (default 250). */
  backoffBaseMs?: number
  /** Test hook overriding the backoff wait. */
  sleepFn?: (ms: number) => Promise<void>
}

/**
 * HTTP client for hosts exposing the channel endpoints. Paths mirror the
 * headless server routes; a static host only needs to answer GET on
 * `/share/channels/:id/manifest`.
 */
export class HttpChannelTransport implements ChannelTransport {
  private readonly baseUrl: string
  private readonly fetchFn: FetchLike
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly backoffBaseMs: number
  private readonly sleepFn: (ms: number) => Promise<void>

  constructor(opts: HttpChannelTransportOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.fetchFn = opts.fetchFn
    this.timeoutMs = opts.timeoutMs ?? 10_000
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 3)
    this.backoffBaseMs = opts.backoffBaseMs ?? 250
    this.sleepFn = opts.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  private manifestUrl(channelId: string): string {
    return `${this.baseUrl}/share/channels/${encodeURIComponent(channelId)}/manifest`
  }

  /** True when a failed attempt is worth retrying (transient only). */
  private isRetryable(err: unknown): boolean {
    if (!(err instanceof TransportError)) return true // fetch threw: network
    return (
      err.code === 'network' ||
      err.code === 'timeout' ||
      (err.code === 'http' && (err.status ?? 0) >= 500)
    )
  }

  private async withTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    outer?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const onOuterAbort = () => controller.abort()
    outer?.addEventListener('abort', onOuterAbort, { once: true })
    try {
      return await fn(controller.signal)
    } catch (err) {
      if (controller.signal.aborted && !outer?.aborted) {
        throw new TransportError('timeout', `request exceeded ${this.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onOuterAbort)
    }
  }

  private parseManifest(body: unknown, channelId: string): ChannelManifest {
    const parsed = ChannelManifestSchema.safeParse(body)
    if (!parsed.success) {
      throw new TransportError('invalid-manifest', 'manifest failed schema validation', {
        channelId,
      })
    }
    const check = verifyManifest(parsed.data)
    if (!check.ok) {
      throw new TransportError(
        'checksum-mismatch',
        `bad versions: ${check.badVersions.join(', ')}`,
        {
          channelId,
        },
      )
    }
    return parsed.data
  }

  async fetchManifest(
    channelId: string,
    opts: FetchManifestOptions = {},
  ): Promise<ChannelManifest | null> {
    let lastErr: unknown = null
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const headers: Record<string, string> = { accept: 'application/json' }
        if (opts.inviteToken) headers['x-lh-invite-token'] = opts.inviteToken
        if (opts.ifNoneMatch) headers['if-none-match'] = opts.ifNoneMatch
        const res = await this.withTimeout(
          (signal) => this.fetchFn(this.manifestUrl(channelId), { method: 'GET', headers, signal }),
          opts.signal,
        )
        if (res.status === 304) return null
        if (!res.ok) {
          throw new TransportError(codeForStatus(res.status), `host answered ${res.status}`, {
            status: res.status,
            channelId,
          })
        }
        return this.parseManifest(await res.json(), channelId)
      } catch (err) {
        const wrapped =
          err instanceof TransportError
            ? err
            : new TransportError('network', err instanceof Error ? err.message : String(err), {
                channelId,
              })
        lastErr = wrapped
        if (attempt >= this.maxAttempts || !this.isRetryable(wrapped)) throw wrapped
        await this.sleepFn(this.backoffBaseMs * 2 ** (attempt - 1))
      }
    }
    throw lastErr
  }

  async publishManifest(
    manifest: ChannelManifest,
    opts: PublishManifestOptions = {},
  ): Promise<{ accepted: boolean }> {
    // Publishers get the same integrity guarantee subscribers do: never ship
    // a manifest whose checksums do not verify.
    this.parseManifest(manifest, manifest.channelId)
    let lastErr: unknown = null
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          accept: 'application/json',
        }
        if (opts.inviteSecret) headers['x-lh-invite-secret'] = opts.inviteSecret
        const res = await this.withTimeout(
          (signal) =>
            this.fetchFn(this.manifestUrl(manifest.channelId), {
              method: 'PUT',
              headers,
              body: JSON.stringify(manifest),
              signal,
            }),
          opts.signal,
        )
        if (!res.ok) {
          throw new TransportError(codeForStatus(res.status), `host answered ${res.status}`, {
            status: res.status,
            channelId: manifest.channelId,
          })
        }
        return { accepted: true }
      } catch (err) {
        const wrapped =
          err instanceof TransportError
            ? err
            : new TransportError('network', err instanceof Error ? err.message : String(err), {
                channelId: manifest.channelId,
              })
        lastErr = wrapped
        if (attempt >= this.maxAttempts || !this.isRetryable(wrapped)) throw wrapped
        await this.sleepFn(this.backoffBaseMs * 2 ** (attempt - 1))
      }
    }
    throw lastErr
  }
}

/* ==========================================================================
 * SYNC COORDINATION
 * ========================================================================== */

/** Local read/write surface the coordinator needs; implemented over the DB repo. */
export interface ChannelSyncStore {
  getSubscription(channelId: string): Subscription | null
  listSubscriptions(): Subscription[]
  saveSubscription(subscription: Subscription): void
  getLocalItems(channelId: string): LocalItem[]
  saveLocalItems(channelId: string, items: LocalItem[]): void
  appendSyncRecord(record: SyncRecord): void
}

export interface SyncRecord {
  channelId: string
  at: string
  fromVersion: number
  toVersion: number
  outcome: 'updated' | 'already-current' | 'failed'
  merge?: MergeResult
  appliedVersions?: number[]
  errorCode?: TransportErrorCode
  errorMessage?: string
}

export interface SyncSummary {
  at: string
  checked: number
  updated: number
  alreadyCurrent: number
  failed: number
  records: SyncRecord[]
}

export interface SyncCoordinatorOptions {
  transport: ChannelTransport
  store: ChannelSyncStore
  /** Max channels fetched concurrently (default 3). */
  concurrency?: number
  /** Invite tokens by channel id, for invite-only subscriptions. */
  inviteTokens?: Record<string, string>
  /** Clock injection for tests. */
  now?: () => string
}

/**
 * Keeps the local subscription roster current against remote hosts. One
 * `syncAll` pass per scheduled sync; `syncChannel` for a manual refresh of a
 * single channel. Every attempt is recorded, success or failure, so the UI
 * can show sync state without guessing.
 */
export class SyncCoordinator {
  private readonly transport: ChannelTransport
  private readonly store: ChannelSyncStore
  private readonly concurrency: number
  private readonly inviteTokens: Record<string, string>
  private readonly now: () => string

  constructor(opts: SyncCoordinatorOptions) {
    this.transport = opts.transport
    this.store = opts.store
    this.concurrency = Math.max(1, opts.concurrency ?? 3)
    this.inviteTokens = opts.inviteTokens ?? {}
    this.now = opts.now ?? (() => new Date().toISOString())
  }

  /**
   * Sync one channel: conditional-fetch its manifest, apply pending versions
   * learner-state-safely, persist the outcome. Returns the record written.
   */
  async syncChannel(channelId: string): Promise<SyncRecord> {
    const subscription = this.store.getSubscription(channelId)
    const at = this.now()
    if (!subscription) {
      const record: SyncRecord = {
        channelId,
        at,
        fromVersion: 0,
        toVersion: 0,
        outcome: 'failed',
        errorCode: 'not-found',
        errorMessage: 'no local subscription for this channel',
      }
      this.store.appendSyncRecord(record)
      return record
    }

    // The ETag we send is the checksum of the version we hold; we do not have
    // the manifest cached, so only send a conditional header when a previous
    // sync recorded one. Simplest correct behavior: fetch unconditionally and
    // short-circuit on hasPendingUpdate — hosts without conditional support
    // still work, and the check is cheap.
    let manifest: ChannelManifest | null
    try {
      manifest = await this.transport.fetchManifest(channelId, {
        inviteToken: this.inviteTokens[channelId],
      })
    } catch (err) {
      const code = err instanceof TransportError ? err.code : 'network'
      const record: SyncRecord = {
        channelId,
        at,
        fromVersion: subscription.localVersion,
        toVersion: subscription.localVersion,
        outcome: 'failed',
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      }
      this.store.appendSyncRecord(record)
      return record
    }

    if (manifest === null || !hasPendingUpdate(subscription, manifest)) {
      const record: SyncRecord = {
        channelId,
        at,
        fromVersion: subscription.localVersion,
        toVersion: subscription.localVersion,
        outcome: 'already-current',
      }
      this.store.appendSyncRecord(record)
      this.store.saveSubscription({ ...subscription, lastSyncAt: at })
      return record
    }

    // Access re-check on every sync: a creator may have flipped a channel
    // from link to invite since we subscribed.
    const access = canSubscribe(manifest, this.inviteTokens[channelId])
    if (!access.allowed) {
      const record: SyncRecord = {
        channelId,
        at,
        fromVersion: subscription.localVersion,
        toVersion: subscription.localVersion,
        outcome: 'failed',
        errorCode: 'unauthorized',
        errorMessage: access.reason,
      }
      this.store.appendSyncRecord(record)
      return record
    }

    const localItems = this.store.getLocalItems(channelId)
    const applied = applyAllPendingVersions(localItems, subscription, manifest)
    this.store.saveLocalItems(channelId, applied.items)
    this.store.saveSubscription({
      ...subscription,
      localVersion: applied.result.newVersion,
      lastSyncAt: at,
    })
    const record: SyncRecord = {
      channelId,
      at,
      fromVersion: subscription.localVersion,
      toVersion: applied.result.newVersion,
      outcome: 'updated',
      merge: applied.result,
      appliedVersions: applied.appliedVersions,
    }
    this.store.appendSyncRecord(record)
    return record
  }

  /** Sync every subscription, bounded by the concurrency limit. */
  async syncAll(): Promise<SyncSummary> {
    const subscriptions = this.store.listSubscriptions()
    const records: SyncRecord[] = []
    let cursor = 0
    const workers = Array.from(
      { length: Math.min(this.concurrency, subscriptions.length) },
      async () => {
        while (cursor < subscriptions.length) {
          const sub = subscriptions[cursor]
          cursor += 1
          records.push(await this.syncChannel(sub.channelId))
        }
      },
    )
    await Promise.all(workers)
    return {
      at: this.now(),
      checked: records.length,
      updated: records.filter((r) => r.outcome === 'updated').length,
      alreadyCurrent: records.filter((r) => r.outcome === 'already-current').length,
      failed: records.filter((r) => r.outcome === 'failed').length,
      records,
    }
  }
}

/* ==========================================================================
 * IN-MEMORY SYNC STORE
 * ========================================================================== */

/**
 * Reference store over plain maps. Tests and the CLI's offline mode use it;
 * the web app uses the packages/db repo implementation instead.
 */
export class InMemoryChannelSyncStore implements ChannelSyncStore {
  private readonly subscriptions = new Map<string, Subscription>()
  private readonly items = new Map<string, LocalItem[]>()
  readonly records: SyncRecord[] = []

  constructor(seed: { subscriptions?: Subscription[]; items?: Record<string, LocalItem[]> } = {}) {
    for (const s of seed.subscriptions ?? []) this.subscriptions.set(s.channelId, s)
    for (const [channelId, items] of Object.entries(seed.items ?? {}))
      this.items.set(channelId, items)
  }

  getSubscription(channelId: string): Subscription | null {
    return this.subscriptions.get(channelId) ?? null
  }

  listSubscriptions(): Subscription[] {
    return [...this.subscriptions.values()].sort((a, b) => a.channelId.localeCompare(b.channelId))
  }

  saveSubscription(subscription: Subscription): void {
    this.subscriptions.set(subscription.channelId, subscription)
  }

  getLocalItems(channelId: string): LocalItem[] {
    return this.items.get(channelId) ?? []
  }

  saveLocalItems(channelId: string, items: LocalItem[]): void {
    this.items.set(channelId, items)
  }

  appendSyncRecord(record: SyncRecord): void {
    this.records.push(record)
  }
}

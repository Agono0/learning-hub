/**
 * Hub worker — the whole backend, running inside a dedicated webview worker:
 * sqlite-wasm (OPFS-persisted) + the runtime-neutral handlers, speaking the
 * {@link ./protocol} message contract. Spawned from the main thread via
 * `new Worker(new URL('./worker.ts', import.meta.url))` (see lib/transport.ts).
 *
 * ── DB recipe (Tauri webview) ───────────────────────────────────────────────
 * `packages/db`'s initDb cannot opt into a VFS: `SqliteWasmOpenOptions.vfs`
 * exists on the driver, but `DbInitOptions` never forwards it — and the
 * opfs-sahpool VFS additionally must be INSTALLED first (it locks the pool's
 * SyncAccessHandles at install time, so sqlite-wasm does not auto-register
 * it). Since packages/db is off-limits for this stage, the worker does the
 * wiring itself, using only exported packages/db + driver APIs:
 *
 *   1. `initSqliteWasm()` then `installOpfsSAHPoolVfs({ name: 'opfs-sahpool' })`
 *      and `sqlite3_vfs_register(<pool>, 1)` — the pool becomes the DEFAULT
 *      VFS, which is exactly what `initDb`'s `vfs ?? null` resolves to.
 *   2. Pre-seed the schema: initDb's ensureViews() would fail on a table-less
 *      database (CREATE VIEW validates its FROM tables) and drizzle-kit push
 *      is a Node CLI — so the worker applies the browser-safe DDL from
 *      ./schema-ddl through a throwaway connection first (all IF NOT EXISTS:
 *      a no-op on an already-pushed DB).
 *   3. `initDb({ driver: 'sqlite-wasm', path })` — opens through the pool,
 *      ensureSchema/ensureViews patch + verify, drizzle is wired.
 *
 * Everything written through opfs-sahpool persists immediately (crash-safe);
 * `dispose` (sent by the main thread on pagehide) additionally CLOSES the
 * handle cleanly, releasing the pool's SyncAccessHandles before unload.
 *
 * ── Request pipeline ────────────────────────────────────────────────────────
 * Protocol message → `new Request('http://hub.local' + path…)` (form bodies
 * rebuilt as FormData with File objects; GET/HEAD carry no body) → registry
 * match → handler → serialize: JSON/text as {kind:'json',text}, everything
 * else as {kind:'bytes',bytes} (ArrayBuffers are transferred, not cloned);
 * text/plain streams WITHOUT content-disposition (the AI chat) are piped as
 * stream-open/stream-chunk/stream-end messages instead of buffered.
 */
/// <reference lib="webworker" />
import { getRawDb, initDb } from '@learning-hub/db'
import { createSqliteWasmDb, initSqliteWasm } from '@learning-hub/db/src/driver/sqlite-wasm'
import { matchRoute } from './handlers-registry'
import type { HubFromWorker, HubInitMessage, HubRequestMessage, HubToWorker } from './protocol'
import { ensureWorkerSchema } from './schema-ddl'
import { ensurePluginsLoaded } from '@/lib/plugins'

/** DedicatedWorkerGlobalScope with the protocol's typed postMessage. */
const ctx = self as unknown as {
  postMessage(message: HubFromWorker, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<HubToWorker>) => void): void
}

let ready = false

/** Raw capi surface of the wasm module the worker needs (pool install). */
interface WasmModuleWithPool {
  capi: {
    sqlite3_vfs_find(name: string | null): unknown
    sqlite3_vfs_register(pVfs: unknown, makeDefault: number): number
  }
  installOpfsSAHPoolVfs?(options?: {
    name?: string
    forceReinitIfPreviouslyFailed?: boolean
  }): Promise<{ vfsName: string; importDb(name: string, bytes: Uint8Array): void }>
}

/**
 * Bootstrap the DB exactly once. Throws on failure — the message loop replies
 * `ready-error` and keeps the worker alive for diagnostics.
 */
async function boot(msg: HubInitMessage): Promise<void> {
  const dbPath = msg.dbPath || '/learning-hub.db'
  const vfs = msg.vfs || 'opfs-sahpool'

  // 1. Install the OPFS pool VFS and make it the DEFAULT (see file comment).
  let poolActive = false
  let pool:
    Awaited<ReturnType<NonNullable<WasmModuleWithPool['installOpfsSAHPoolVfs']>>> | undefined
  try {
    const sqlite3 = (await initSqliteWasm()) as unknown as WasmModuleWithPool
    const install = sqlite3.installOpfsSAHPoolVfs as
      WasmModuleWithPool['installOpfsSAHPoolVfs'] | undefined
    const hasOpfs =
      typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
    if (typeof install === 'function' && hasOpfs) {
      pool = await install.call(sqlite3, { name: vfs })
      const pVfs = sqlite3.capi.sqlite3_vfs_find(pool.vfsName)
      if (pVfs) sqlite3.capi.sqlite3_vfs_register(pVfs, 1)
      poolActive = true
    }
  } catch (err) {
    // No OPFS (main-thread context, old webview) → fall back to the default
    // in-memory VFS: the app works, but only the session's lifetime.
    console.warn('[hub-worker] OPFS pool VFS unavailable — persistence disabled:', err)
  }

  // First-run template seed (Tauri shell ships an empty pushed image).
  if (pool && msg.bytes && msg.bytes.byteLength > 0) {
    try {
      pool.importDb(dbPath, new Uint8Array(msg.bytes))
    } catch (err) {
      console.warn('[hub-worker] template import skipped:', err)
    }
  }

  // 2. Schema bootstrap for fresh databases (idempotent on existing ones).
  const probe = createSqliteWasmDb(dbPath, { vfs: poolActive ? vfs : undefined })
  try {
    ensureWorkerSchema(probe)
  } finally {
    probe.close()
  }

  // 3. Open through the standard initDb path (ensureSchema + ensureViews run).
  await initDb({ driver: 'sqlite-wasm', path: dbPath })

  // 4. Bundled plugins (none yet — the loader scans a plugins/ dir that does
  //    not exist inside a worker; any failure is non-fatal).
  try {
    await ensurePluginsLoaded()
  } catch (err) {
    console.warn('[hub-worker] plugin bootstrap skipped:', err)
  }

  ready = true
}

/** Rebuild the handler-facing Request from a protocol message. */
function buildRequest(msg: HubRequestMessage): Request {
  const url = 'http://hub.local' + msg.path + (msg.search ? `?${msg.search}` : '')
  const headers = new Headers(msg.headers)
  let body: BodyInit | undefined
  if (msg.method === 'GET' || msg.method === 'HEAD') {
    body = undefined
  } else if (msg.body?.kind === 'json') {
    headers.set('content-type', headers.get('content-type') ?? 'application/json')
    body = msg.body.text
  } else if (msg.body?.kind === 'form') {
    // FormData bodies get their boundary from the Request constructor — drop
    // whatever content-type the main thread sent.
    headers.delete('content-type')
    const form = new FormData()
    for (const [field, value] of Object.entries(msg.body.fields)) form.append(field, value)
    for (const file of msg.body.files) {
      form.append(file.field, new File([file.bytes], file.name, { type: file.type }))
    }
    body = form
  }
  return new Request(url, { method: msg.method, headers, body })
}

/** Headers as a plain object (protocol contract: structured-cloneable). */
function headerRecord(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

/** The AI chat stream: text/plain WITHOUT a download disposition. */
function isStreamingResponse(res: Response): boolean {
  if (res.body === null) return false
  const contentType = res.headers.get('content-type') ?? ''
  return contentType.startsWith('text/plain') && !res.headers.has('content-disposition')
}

/** Execute one request and post the serialized result (or an error). */
async function serveRequest(msg: HubRequestMessage): Promise<void> {
  try {
    if (!ready) throw new Error('hub worker is not ready — init did not complete')
    const match = matchRoute(msg.method, msg.path)
    if (!match) {
      ctx.postMessage({
        id: msg.id,
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: {
          kind: 'json',
          text: JSON.stringify({ error: `No route: ${msg.method} ${msg.path}` }),
        },
      })
      return
    }
    const request = buildRequest(msg)
    const response = await match.handler(request, { params: Promise.resolve(match.params) })

    if (isStreamingResponse(response)) {
      ctx.postMessage({ id: msg.id, type: 'stream-open' })
      const decoder = new TextDecoder()
      const reader = response.body!.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          ctx.postMessage({
            id: msg.id,
            type: 'stream-chunk',
            text: decoder.decode(value, { stream: true }),
          })
        }
      } finally {
        reader.releaseLock()
      }
      ctx.postMessage({
        id: msg.id,
        type: 'stream-end',
        status: response.status,
        headers: headerRecord(response),
      })
      return
    }

    const contentType = response.headers.get('content-type') ?? ''
    const headers = headerRecord(response)
    if (contentType.startsWith('application/json') || contentType.startsWith('text/')) {
      ctx.postMessage({
        id: msg.id,
        status: response.status,
        headers,
        body: { kind: 'json', text: await response.text() },
      })
    } else {
      const bytes = await response.arrayBuffer()
      ctx.postMessage(
        { id: msg.id, status: response.status, headers, body: { kind: 'bytes', bytes } },
        [bytes],
      )
    }
  } catch (err) {
    ctx.postMessage({ id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}

/** Persist + close the wasm handle (opfs-sahpool requires close before unload). */
function disposeDb(): void {
  ready = false
  try {
    getRawDb().close()
  } catch (err) {
    console.warn('[hub-worker] dispose skipped:', err)
  }
}

ctx.addEventListener('message', (event) => {
  const msg = event.data
  if (msg?.type === 'init') {
    boot(msg)
      .then(() => ctx.postMessage({ type: 'ready' }))
      .catch((err) =>
        ctx.postMessage({
          type: 'ready-error',
          message: err instanceof Error ? err.message : String(err),
        }),
      )
    return
  }
  if (msg?.type === 'request') {
    void serveRequest(msg)
    return
  }
  if (msg?.type === 'dispose') {
    disposeDb()
    return
  }
})

/**
 * THE network seam for UI code. Every page/component talks to the backend
 * through {@link apiGet} / {@link apiSend} / {@link apiUpload} / {@link apiStream}
 * / {@link apiDownload} (and the low-level {@link hubFetch} for odd call
 * sites) — never through `fetch` directly.
 *
 * Two transports, one contract:
 * - Browser (next dev / deployed): plain `fetch` to the same relative /api
 *   paths, served by the Next.js route shims (better-sqlite3 on Node).
 * - Tauri (`__TAURI_INTERNALS__` present): the messages of ./hub/protocol
 *   against the in-webview worker hosting sqlite-wasm + the same handlers.
 *   ArrayBuffers cross as transferables; JSON/form bodies are pre-serialized
 *   so handlers receive byte-identical Requests.
 *
 * Both transports funnel through the shared {@link HubTunnelResponse} shape
 * and the single assertion helpers ({@link expectJson} / {@link throwForStatus}),
 * so a non-2xx throws the SAME error — built from the server's
 * `{ error, detail }` envelope — in both modes, and successful calls return
 * the same parsed value.
 */
import type {
  HubFromWorker,
  HubInitMessage,
  HubRequestMessage,
  HubResponseBody,
  HubResponseMessage,
  HubToWorker,
} from '@/hub/protocol'
import { serializeFormBody, serializeJsonBody, takeTransferables } from '@/hub/protocol'

/** True inside a Tauri webview (worker RPC); false in a plain browser (HTTP). */
export const isTauri: boolean = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** OPFS-scoped database path handed to the hub worker on init. */
const HUB_DB_PATH = '/learning-hub.db'

// ─── Transport-agnostic response shape + shared assertions ──────────────────

/** The minimal response surface both transports normalize into. */
export interface HubTunnelResponse {
  status: number
  headers: Record<string, string>
  /** Decoded text body (JSON/text responses). */
  bodyText?: string
  /** Raw bytes (binary responses: images, file downloads). */
  bodyBytes?: ArrayBuffer
}

/** Error thrown for non-2xx responses — identical message in both transports. */
export class HubApiError extends Error {
  status: number
  detail?: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'HubApiError'
    this.status = status
    this.detail = detail
  }
}

/**
 * THE shared error path: build the failure for a non-ok response from the
 * server's `{ error, detail }` (or `{ message }`) JSON envelope. Malformed
 * bodies degrade to a truncated text snippet; empty bodies to the status.
 */
export function throwForStatus(status: number, bodyText: string | null): never {
  let message = `Request failed (${status})`
  let detail: unknown
  if (bodyText) {
    try {
      const parsed: unknown = JSON.parse(bodyText)
      if (parsed && typeof parsed === 'object') {
        const envelope = parsed as { error?: unknown; message?: unknown; detail?: unknown }
        if (typeof envelope.error === 'string') message = envelope.error
        else if (typeof envelope.message === 'string') message = envelope.message
        if (envelope.detail !== undefined) {
          detail = envelope.detail
          if (typeof envelope.detail === 'string') message += `: ${envelope.detail}`
        }
      }
    } catch {
      message = bodyText.slice(0, 300)
    }
  }
  throw new HubApiError(status, message, detail)
}

/**
 * THE shared success path: non-ok → {@link throwForStatus}; ok → JSON.parse.
 * An empty body parses as undefined (mirrors `res.json()` on a 204).
 */
export function expectJson<T>(res: HubTunnelResponse): T {
  if (res.status < 200 || res.status >= 300) {
    throwForStatus(res.status, res.bodyText ?? null)
  }
  if (res.bodyText === undefined || res.bodyText === '') return undefined as T
  return JSON.parse(res.bodyText) as T
}

/** ok → bytes + filename from content-disposition; non-ok → shared error. */
function expectBytes(res: HubTunnelResponse): { bytes: ArrayBuffer; filename: string | null } {
  if (res.status < 200 || res.status >= 300) {
    throwForStatus(res.status, res.bodyText ?? null)
  }
  const disposition = res.headers['content-disposition'] ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  return { bytes: res.bodyBytes ?? new ArrayBuffer(0), filename: match?.[1] ?? null }
}

/** Map a browser fetch Response into the shared tunnel shape. */
async function tunnelFromFetch(res: Response): Promise<HubTunnelResponse> {
  const headers: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    headers[key] = value
  })
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.startsWith('application/json') || contentType.startsWith('text/')) {
    return { status: res.status, headers, bodyText: await res.text() }
  }
  return { status: res.status, headers, bodyBytes: await res.arrayBuffer() }
}

/** Build a query string, skipping undefined values (same shape in both modes). */
function buildSearch(query: Record<string, string | number | undefined> | undefined): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

/** Split a path into (path, search) — the protocol carries them separately. */
function splitPath(path: string): { cleanPath: string; search: string } {
  const q = path.indexOf('?')
  return q === -1
    ? { cleanPath: path, search: '' }
    : { cleanPath: path.slice(0, q), search: path.slice(q + 1) }
}

// ─── Worker singleton (Tauri mode) ──────────────────────────────────────────

type WorkerPhase =
  | { phase: 'starting'; worker: Worker; waiters: PromiseWithResolvers<Worker>[] }
  | { phase: 'ready'; worker: Worker }
  | { phase: 'failed'; error: Error }

interface PromiseWithResolvers<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: Error) => void
}

function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  let resolve!: (value: T) => void
  let reject!: (err: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let workerPhase: WorkerPhase | null = null
let nextRequestId = 1

interface PendingRequest {
  resolve: (res: HubTunnelResponse) => void
  reject: (err: Error) => void
  /** Present when the caller consumes a text/plain stream (apiStream). */
  stream?: {
    onChunk: (text: string) => void
    onSessionId?: (v: string) => void
  }
}

/** id → in-flight request (responses, stream frames and errors all carry it). */
const pending = new Map<number, PendingRequest>()

/** Build the shared error from a serialized non-ok response body. */
function hubErrorFrom(status: number, body: HubResponseBody | undefined): Error {
  if (body?.kind === 'json') {
    try {
      throwForStatus(status, body.text)
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err))
    }
  }
  return new HubApiError(status, `Request failed (${status})`)
}

function bodyParts(body: HubResponseBody | undefined): Partial<HubTunnelResponse> {
  if (!body) return {}
  return body.kind === 'json' ? { bodyText: body.text } : { bodyBytes: body.bytes }
}

/** Terminal worker failure: reject everything in flight and poison the singleton. */
function failWorker(worker: Worker, error: Error): void {
  if (workerPhase?.phase === 'starting' && workerPhase.worker === worker) {
    for (const waiter of workerPhase.waiters) waiter.reject(error)
    workerPhase = { phase: 'failed', error }
  }
  for (const [id, entry] of pending) {
    pending.delete(id)
    const wrapped = new Error(`Hub worker failed: ${error.message}`)
    entry.reject(wrapped)
  }
  worker.terminate()
}

/** Dispatch every worker message; resolves/rejects the matching promise. */
function handleWorkerMessage(worker: Worker, message: HubFromWorker): void {
  // Typed lifecycle/stream frames (checked first: stream-end also has status).
  if ('type' in message) {
    switch (message.type) {
      case 'ready': {
        if (workerPhase?.phase === 'starting' && workerPhase.worker === worker) {
          const phase = workerPhase
          workerPhase = { phase: 'ready', worker }
          for (const waiter of phase.waiters) waiter.resolve(worker)
        }
        return
      }
      case 'ready-error': {
        failWorker(worker, new Error(message.message))
        return
      }
      case 'stream-open':
        return // status/headers arrive with stream-end (protocol contract)
      case 'stream-chunk': {
        pending.get(message.id)?.stream?.onChunk(message.text)
        return
      }
      case 'stream-end': {
        const entry = pending.get(message.id)
        if (!entry) return
        pending.delete(message.id)
        const sid = message.headers['x-session-id']
        if (sid && entry.stream?.onSessionId) entry.stream.onSessionId(sid)
        entry.resolve({ status: message.status, headers: message.headers })
        return
      }
    }
  }

  // Complete response (no `type` field — the protocol's bare reply shape).
  if ('status' in message) {
    const res: HubResponseMessage = message
    const entry = pending.get(res.id)
    if (!entry) return
    pending.delete(res.id)
    // A stream request answered with a COMPLETE response: the handler failed
    // before streaming (zod 400, provider error…) — surface it exactly like
    // the non-streaming path instead of hanging.
    if (entry.stream) {
      if (res.status >= 200 && res.status < 300) {
        const sid = res.headers['x-session-id']
        if (sid && entry.stream.onSessionId) entry.stream.onSessionId(sid)
        if (res.body?.kind === 'json') entry.stream.onChunk(res.body.text)
        entry.resolve({ status: res.status, headers: res.headers, ...bodyParts(res.body) })
      } else {
        entry.reject(hubErrorFrom(res.status, res.body))
      }
      return
    }
    if (res.status < 200 || res.status >= 300) {
      entry.reject(hubErrorFrom(res.status, res.body))
      return
    }
    entry.resolve({ status: res.status, headers: res.headers, ...bodyParts(res.body) })
    return
  }

  // Worker-side failure for one request.
  if ('message' in message) {
    if (message.id !== undefined) {
      const entry = pending.get(message.id)
      if (entry) {
        pending.delete(message.id)
        entry.reject(new Error(`Hub worker failed: ${message.message}`))
      }
      return
    }
    failWorker(worker, new Error(message.message))
  }
}

/** Boot the hub worker once; the ready handshake gates every call. */
function getWorker(): Promise<Worker> {
  if (workerPhase?.phase === 'ready') return Promise.resolve(workerPhase.worker)
  if (workerPhase?.phase === 'failed') return Promise.reject(workerPhase.error)
  if (workerPhase?.phase === 'starting') {
    const waiter = promiseWithResolvers<Worker>()
    workerPhase.waiters.push(waiter)
    return waiter.promise
  }

  let worker: Worker
  try {
    worker = new Worker(new URL('../hub/worker.ts', import.meta.url))
  } catch (err) {
    const error = new Error(
      `Hub worker failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    workerPhase = { phase: 'failed', error }
    return Promise.reject(error)
  }
  worker.addEventListener('message', (event) => {
    handleWorkerMessage(worker, event.data as HubFromWorker)
  })
  worker.addEventListener('error', (event) => {
    failWorker(worker, new Error(event.message || 'worker script error'))
  })
  worker.addEventListener('messageerror', () => {
    failWorker(worker, new Error('a message could not be deserialized'))
  })

  const boot = promiseWithResolvers<Worker>()
  workerPhase = { phase: 'starting', worker, waiters: [boot] }
  const init: HubInitMessage = { type: 'init', dbPath: HUB_DB_PATH, vfs: 'opfs-sahpool' }
  worker.postMessage(init, takeTransferables(init))
  return boot.promise
}

interface WorkerRequestOptions {
  method: string
  path: string
  search: string
  headers: Record<string, string>
  body?: HubRequestMessage['body']
  /** Extra buffers to transfer (apiUpload file bytes). */
  transfer?: ArrayBuffer[]
  /** Stream consumption (apiStream). */
  stream?: { onChunk: (text: string) => void; onSessionId?: (v: string) => void }
}

/** Send one protocol request; resolves with the serialized response. */
async function workerRequest(options: WorkerRequestOptions): Promise<HubTunnelResponse> {
  const worker = await getWorker()
  const id = nextRequestId++
  return new Promise<HubTunnelResponse>((resolve, reject) => {
    pending.set(
      id,
      options.stream ? { resolve, reject, stream: options.stream } : { resolve, reject },
    )
    const message: HubRequestMessage = {
      type: 'request',
      id,
      method: options.method,
      path: options.path,
      search: options.search,
      headers: options.headers,
      body: options.body,
    }
    worker.postMessage(message, takeTransferables(message))
  })
}

// ─── pagehide: persist + close the wasm db (opfs-sahpool needs this) ────────

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (workerPhase?.phase === 'ready') {
      workerPhase.worker.postMessage({ type: 'dispose' } satisfies HubToWorker)
    }
  })
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * GET /api/... and parse JSON. `query` values are stringified; undefined
 * entries are skipped. Non-2xx throws {@link HubApiError} in both transports.
 */
export async function apiGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const search = buildSearch(query)
  if (isTauri) {
    const { cleanPath, search: q } = splitPath(path)
    return expectJson<T>(
      await workerRequest({
        method: 'GET',
        path: cleanPath,
        search: q || search.replace(/^\?/, ''),
        headers: {},
      }),
    )
  }
  return expectJson<T>(await tunnelFromFetch(await fetch(path + search)))
}

const SEND_METHODS: readonly string[] = ['POST', 'PUT', 'PATCH', 'DELETE']

/**
 * POST/PUT/PATCH/DELETE with an optional JSON body. Returns the parsed JSON
 * response. Identical error semantics to {@link apiGet}.
 */
export async function apiSend<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  if (!SEND_METHODS.includes(method)) {
    throw new Error(`apiSend: unsupported method ${method} — use apiGet/apiUpload/apiStream`)
  }
  if (isTauri) {
    const wire = body === undefined ? undefined : serializeJsonBody(body)
    const { cleanPath, search } = splitPath(path)
    return expectJson<T>(
      await workerRequest({
        method,
        path: cleanPath,
        search,
        headers: { 'content-type': 'application/json' },
        body: wire,
      }),
    )
  }
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return expectJson<T>(await tunnelFromFetch(res))
}

/**
 * POST a FormData (multipart) — file uploads. In Tauri mode the form is
 * decomposed into protocol fields + transferred file bytes and rebuilt as a
 * FormData in the worker; the browser path hands the FormData to fetch
 * untouched (boundary included).
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  if (isTauri) {
    const body = (await serializeFormBody(form)).body
    const { cleanPath, search } = splitPath(path)
    return expectJson<T>(
      await workerRequest({ method: 'POST', path: cleanPath, search, headers: {}, body }),
    )
  }
  const res = await fetch(path, { method: 'POST', body: form })
  return expectJson<T>(await tunnelFromFetch(res))
}

/**
 * POST a JSON body and consume the text/plain stream it returns (the AI chat
 * surfaces). `onChunk` receives decoded text deltas; `onSessionId`, when
 * given, receives the `x-session-id` header value. Non-2xx throws the shared
 * {@link HubApiError}.
 */
export async function apiStream(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  onSessionId?: (v: string) => void,
): Promise<void> {
  if (isTauri) {
    const { cleanPath, search } = splitPath(path)
    await workerRequest({
      method: 'POST',
      path: cleanPath,
      search,
      headers: { 'content-type': 'application/json' },
      body: serializeJsonBody(body),
      stream: { onChunk, onSessionId },
    })
    return
  }
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throwForStatus(res.status, await res.text())
  }
  const sid = res.headers.get('x-session-id')
  if (sid && onSessionId) onSessionId(sid)
  const reader = res.body?.getReader()
  if (!reader) throw new Error('no stream body')
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(decoder.decode(value, { stream: true }))
  }
}

/**
 * Download a file produced by an /api route (backup JSON, deck exports).
 *
 * - Browser: fetch → Blob → synthetic `<a download>` click (filename from
 *   content-disposition, falling back to `fallbackName`).
 * - Tauri: fetch the bytes through the hub worker, then
 *   `@tauri-apps/plugin-dialog` `save()` + `@tauri-apps/plugin-fs`
 *   `writeFile()`. The plugin modules are imported DYNAMICALLY inside the
 *   isTauri branch, so browser bundles never load them.
 *
 * Resolves to the saved path (empty string in browser mode) or null when the
 * user cancelled the save dialog.
 */
export async function apiDownload(path: string, fallbackName = 'download'): Promise<string | null> {
  if (isTauri) {
    const { cleanPath, search } = splitPath(path)
    const res = await workerRequest({ method: 'GET', path: cleanPath, search, headers: {} })
    const { bytes, filename } = expectBytes(res)
    // Dynamic imports keep the native plugin chunks out of browser bundles.
    const [{ save }, fs] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const target = await save({ defaultPath: filename ?? fallbackName })
    if (!target) return null
    await fs.writeFile(target, new Uint8Array(bytes))
    return target
  }
  const { bytes, filename } = expectBytes(await tunnelFromFetch(await fetch(path)))
  const blob = new Blob([bytes])
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename ?? fallbackName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return ''
}

/**
 * Low-level escape hatch for the few call sites that need the raw Response
 * (headers, status, unusual methods). Returns a REAL Response in both modes —
 * Tauri mode synthesizes one from the worker's serialized reply, so `res.ok`,
 * `res.headers.get(...)` and `res.json()` behave identically. Streaming
 * responses are re-assembled from stream frames into the body.
 */
export async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!isTauri) return fetch(path, init)

  const method = (init?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {}
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value
    })
  }
  const { cleanPath, search } = splitPath(path)

  let wireBody: HubRequestMessage['body'] | undefined
  if (init?.body instanceof FormData) {
    wireBody = (await serializeFormBody(init.body)).body
  } else if (typeof init?.body === 'string') {
    wireBody = { kind: 'json', text: init.body }
  }

  const chunks: string[] = []
  const res = await workerRequest({
    method,
    path: cleanPath,
    search,
    headers,
    body: wireBody,
    stream:
      init?.body === undefined && method === 'GET'
        ? undefined
        : { onChunk: (text) => chunks.push(text) },
  })
  const responseHeaders = new Headers(res.headers)
  const text = res.bodyText ?? chunks.join('')
  return new Response(text === '' && res.bodyBytes ? res.bodyBytes : text, {
    status: res.status,
    headers: responseHeaders,
  })
}

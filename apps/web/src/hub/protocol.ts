/**
 * Hub worker protocol — the message contract between the UI (main thread) and
 * the in-webview worker that hosts the whole backend (sqlite-wasm + handlers).
 *
 * Design rules:
 * - Everything is structured-cloneable. Binary payloads ride as ArrayBuffer
 *   and are listed by {@link takeTransferables} so `postMessage` can transfer
 *   them (zero-copy) instead of cloning.
 * - A request/response pair shares one numeric `id`. Streaming responses reuse
 *   the SAME id: `stream-open` → n × `stream-chunk` → `stream-end` (or a lone
 *   `error` on failure). The worker never multiplexes two streams on one id —
 *   ids come from a monotonic counter on the main thread.
 * - Bodies are pre-serialized: JSON as its exact text ({@link serializeJsonBody}
 *   keeps key order stable) and forms as flat fields + explicit file entries,
 *   so the worker can rebuild a `Request` whose bytes are identical to what a
 *   browser fetch would have sent.
 */
import type { DbInitOptions } from '@learning-hub/db'

// ─── Main → worker ──────────────────────────────────────────────────────────

/** One-time bootstrap. The worker replies `ready` or `ready-error`. */
export interface HubInitMessage {
  type: 'init'
  /**
   * SQLite database path INSIDE the worker runtime. With the opfs-sahpool VFS
   * this is a virtual, origin-scoped path (e.g. '/learning-hub.db'); the
   * worker ignores host paths (a webview cannot touch the Rust filesystem).
   */
  dbPath: string
  /** VFS for the wasm build — 'opfs-sahpool' in the Tauri webview. */
  vfs?: string
  /**
   * Optional template SQLite image (first-run seed shipped by the Tauri shell).
   * Imported into the VFS pool before the database is opened; ignored when the
   * database already exists or no pool VFS is active.
   */
  bytes?: ArrayBuffer
  /**
   * Route the worker's outbound network traffic (AI providers) through the
   * main thread — which uses tauri-plugin-http — instead of the worker's own
   * CORS-bound fetch. Set by the Tauri runtime; plain browsers omit it.
   */
  nativeNet?: boolean
}

/** Serve one HTTP-shaped request. */
export interface HubRequestMessage {
  type: 'request'
  id: number
  method: string
  /** Path starting at /api — passed through to the handler registry. */
  path: string
  /** Query string WITHOUT the leading '?' (empty string when absent). */
  search: string
  headers: Record<string, string>
  body?: HubRequestBody
}

/** Persist + close the wasm database (sent on pagehide / explicit flush). */
export interface HubDisposeMessage {
  type: 'dispose'
}

// ─── Outbound network bridge (worker → main → native HTTP → worker) ─────────
// Tauri IPC is unreachable from a Web Worker, so the worker's fetch for AI
// providers is proxied: net-request → (main runs it natively) → net-head →
// n × net-chunk → net-end, or net-error. Ids are a separate counter owned by
// the worker. The worker may send net-abort at any time.

export interface HubNetRequestMessage {
  type: 'net-request'
  id: number
  url: string
  method: string
  headers: Record<string, string>
  body?: ArrayBuffer
}
export interface HubNetAbortMessage {
  type: 'net-abort'
  id: number
}
export interface HubNetHeadMessage {
  type: 'net-head'
  id: number
  status: number
  statusText: string
  headers: Record<string, string>
}
export interface HubNetChunkMessage {
  type: 'net-chunk'
  id: number
  bytes: ArrayBuffer
}
export interface HubNetEndMessage {
  type: 'net-end'
  id: number
}
export interface HubNetErrorMessage {
  type: 'net-error'
  id: number
  message: string
}

export type HubNetToWorker =
  HubNetHeadMessage | HubNetChunkMessage | HubNetEndMessage | HubNetErrorMessage
export type HubNetFromWorker = HubNetRequestMessage | HubNetAbortMessage

export type HubToWorker = HubInitMessage | HubRequestMessage | HubDisposeMessage | HubNetToWorker

// ─── Request bodies ─────────────────────────────────────────────────────────

/** JSON body, pre-serialized so the exact bytes reach the handler. */
export interface HubJsonBody {
  kind: 'json'
  text: string
}

/** Multipart/form-data body: flat fields plus binary file entries. */
export interface HubFormFile {
  field: string
  name: string
  type: string
  bytes: ArrayBuffer
}
export interface HubFormBody {
  kind: 'form'
  fields: Record<string, string>
  files: HubFormFile[]
}

export type HubRequestBody = HubJsonBody | HubFormBody

// ─── Worker → main ──────────────────────────────────────────────────────────

/** Bootstrap succeeded; request/stream traffic may start. */
export interface HubReadyMessage {
  type: 'ready'
}

/** Bootstrap failed — the worker stays alive but will not serve requests. */
export interface HubReadyErrorMessage {
  type: 'ready-error'
  message: string
}

export interface HubJsonResponseBody {
  kind: 'json'
  text: string
}
export interface HubBytesResponseBody {
  kind: 'bytes'
  bytes: ArrayBuffer
}
export type HubResponseBody = HubJsonResponseBody | HubBytesResponseBody

/** Complete (non-streaming) response for request `id`. */
export interface HubResponseMessage {
  id: number
  status: number
  headers: Record<string, string>
  body?: HubResponseBody
}

/** Streaming: opens the stream for request `id` (status/headers arrive at end). */
export interface HubStreamOpenMessage {
  id: number
  type: 'stream-open'
}
export interface HubStreamChunkMessage {
  id: number
  type: 'stream-chunk'
  text: string
}
export interface HubStreamEndMessage {
  id: number
  type: 'stream-end'
  status: number
  headers: Record<string, string>
}
/** Worker-side failure for request `id` (or the whole init when id is absent). */
export interface HubErrorMessage {
  id?: number
  message: string
}

export type HubFromWorker =
  | HubReadyMessage
  | HubReadyErrorMessage
  | HubResponseMessage
  | HubStreamOpenMessage
  | HubStreamChunkMessage
  | HubStreamEndMessage
  | HubErrorMessage
  | HubNetFromWorker

// ─── Serialization helpers ──────────────────────────────────────────────────

/**
 * Build the JSON wire body for an unknown payload: `JSON.stringify` on the
 * main thread, `req.json()` parses the identical value in the worker.
 */
export function serializeJsonBody(body: unknown): HubJsonBody {
  return { kind: 'json', text: JSON.stringify(body ?? null) }
}

/**
 * Split a `FormData` into its protocol form: string entries become `fields`
 * (multi-values repeat — the worker rebuilds them in order) and File/Blob
 * entries become {@link HubFormFile}s with their bytes copied into fresh
 * ArrayBuffers so they can be listed as transferables.
 */
export async function serializeFormBody(
  form: FormData,
): Promise<{ body: HubFormBody; transfer: ArrayBuffer[] }> {
  const fields: Record<string, string> = {}
  const files: HubFormFile[] = []
  const transfer: ArrayBuffer[] = []
  for (const [field, value] of form.entries()) {
    if (typeof value === 'string') {
      fields[field] = value
      continue
    }
    // arrayBuffer() copies — the source File can be released before postMessage.
    const bytes = await value.arrayBuffer()
    transfer.push(bytes)
    files.push({
      field,
      name: value.name || 'file',
      type: value.type || 'application/octet-stream',
      bytes,
    })
  }
  return { body: { kind: 'form', fields, files }, transfer }
}

/**
 * Every ArrayBuffer referenced anywhere in a message — pass as the
 * `postMessage(target, message, transfer)` list. Clone-typed for signature
 * convenience; the caller must not reuse the message afterwards.
 */
export function takeTransferables(message: HubToWorker | HubFromWorker): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>()
  const out: ArrayBuffer[] = []
  const visit = (value: unknown): void => {
    if (value instanceof ArrayBuffer) {
      if (!seen.has(value)) {
        seen.add(value)
        out.push(value)
      }
      return
    }
    if (ArrayBuffer.isView(value)) {
      const buf = value.buffer as ArrayBuffer
      if (buf.byteLength === value.byteLength) visit(buf)
      return
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) visit(item)
    }
  }
  visit(message)
  return out
}

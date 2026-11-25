/**
 * @file bounded-body.ts
 * @description Pure helpers that keep remote channel payloads bounded.
 *
 * - `readBoundedText` reads a fetch Response body through its stream, counts
 *   real bytes and cancels the stream at the cap. Content-Length is only a
 *   fast refusal, never trusted for the bound.
 * - `measureJson` walks an already-parsed value with hard limits on size,
 *   nesting depth and node count, without stringifying it.
 *
 * Limits: the byte cap bounds memory per attempt only. It does not bound time
 * (a slow host can drip bytes until the transport timeout).
 */

/** Largest manifest body accepted from a host. */
export const MAX_MANIFEST_BODY_BYTES = 16 * 1024 * 1024
/** Largest approximate size of one item's content. */
export const MAX_ITEM_CONTENT_BYTES = 1024 * 1024
/** Longest channel or item id. */
export const MAX_CHANNEL_ID_LENGTH = 200
/** Most versions one manifest may carry (each version holds its full item list). */
export const MAX_VERSIONS_PER_MANIFEST = 200
/** Most items one version may carry. */
export const MAX_ITEMS_PER_VERSION = 10_000
/** Deepest nesting allowed inside item content. */
export const MAX_CONTENT_DEPTH = 32
/** Most JSON nodes allowed inside one item's content. */
export const MAX_CONTENT_NODES = 100_000

export class BodyLimitError extends Error {
  constructor(
    readonly kind: 'too-large' | 'unreadable',
    message: string,
  ) {
    super(message)
    this.name = 'BodyLimitError'
  }
}

/** Read a Response body as UTF-8 text, refusing anything over `maxBytes`. */
export async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  const declared = res.headers.get('content-length')
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    void res.body?.cancel().catch(() => undefined)
    throw new BodyLimitError('too-large', `response declares ${declared} bytes, cap is ${maxBytes}`)
  }
  if (!res.body) throw new BodyLimitError('unreadable', 'response has no readable body')
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new BodyLimitError('too-large', `response body exceeded ${maxBytes} bytes`)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8').decode(bytes)
}

/** UTF-8 byte length of a string without allocating (lone surrogates count as 3, like TextEncoder). */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i += 1
      } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

export interface JsonMeasure {
  ok: boolean
  reason?: 'too-large' | 'too-deep' | 'too-many-nodes'
  approxBytes: number
}

/** Bounded walk over a parsed JSON value. Aborts at the first limit crossed. */
export function measureJson(
  value: unknown,
  limits: { maxBytes: number; maxDepth: number; maxNodes: number },
): JsonMeasure {
  let bytes = 0
  let nodes = 0
  const stack: { v: unknown; depth: number }[] = [{ v: value, depth: 1 }]
  while (stack.length > 0) {
    const { v, depth } = stack.pop()!
    nodes += 1
    if (nodes > limits.maxNodes) return { ok: false, reason: 'too-many-nodes', approxBytes: bytes }
    if (depth > limits.maxDepth) return { ok: false, reason: 'too-deep', approxBytes: bytes }
    if (typeof v === 'string') bytes += utf8ByteLength(v) + 2
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) bytes += 5
    else if (Array.isArray(v)) {
      bytes += 2
      for (const x of v) stack.push({ v: x, depth: depth + 1 })
    } else if (typeof v === 'object') {
      bytes += 2
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        bytes += utf8ByteLength(k) + 3
        stack.push({ v: x, depth: depth + 1 })
      }
    } else bytes += 5
    if (bytes > limits.maxBytes) return { ok: false, reason: 'too-large', approxBytes: bytes }
  }
  return { ok: true, approxBytes: bytes }
}

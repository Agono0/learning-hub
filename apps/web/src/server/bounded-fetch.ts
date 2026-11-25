/**
 * Bounded outbound text fetch for handlers that read a user-supplied URL.
 *
 * What it enforces, per call:
 * - scheme: https only unless `allowHttp` is set; no `user:pass@` in the URL;
 * - destination: literal loopback, private, link-local, CGNAT and unique-local
 *   addresses plus localhost-style names are refused, on the first request and
 *   on every redirect hop (the WHATWG URL parser normalizes decimal, hex and
 *   octal IPv4 spellings, so those are checked in dotted form);
 * - redirects: followed by hand, at most `maxRedirects`, each hop re-validated;
 * - size: a BYTE cap, counted while streaming; the reader is cancelled the
 *   moment the cap is crossed, so an oversized body is never held in memory;
 * - time: one deadline covers the request and the body read.
 *
 * What it cannot do (residual risk, by design of a runtime-neutral helper):
 * - It does not resolve DNS, so a public hostname that resolves to a private
 *   address (or rebinds after the check) is not caught.
 * - If the installed fetch follows redirects itself (some native bridges
 *   ignore `redirect: 'manual'`), the hop check cannot run before the request
 *   is sent. The helper then validates `response.url` and refuses to return the
 *   body when the final URL is not allowed, but the request has already gone.
 */
import { remoteFetch } from './net'

export class BoundedFetchError extends Error {
  constructor(
    readonly code: 'blocked' | 'too-large' | 'too-many-redirects' | 'timeout' | 'network',
    message: string,
  ) {
    super(message)
    this.name = 'BoundedFetchError'
  }
}

export interface BoundedFetchOptions {
  maxBytes: number
  timeoutMs: number
  maxRedirects?: number
  allowHttp?: boolean
  headers?: Record<string, string>
  /** Injected for tests; defaults to the handler network seam. */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>
}

export interface BoundedFetchResult {
  ok: boolean
  status: number
  finalUrl: string
  text: string
  bytes: number
}

const BLOCKED_NAME_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home']

function ipv4Private(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224
  )
}

function ipv6Private(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (!h.includes(':')) return false
  if (h === '::' || h === '::1') return true
  if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true
  const mapped = /^::ffff:(.+)$/.exec(h)
  if (mapped) {
    const rest = mapped[1]!
    if (rest.includes('.')) return ipv4Private(rest)
    const hex = rest.split(':').map((p) => parseInt(p, 16))
    if (hex.length === 2 && hex.every((n) => Number.isFinite(n))) {
      const [hi, lo] = hex as [number, number]
      return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    return true
  }
  return false
}

/** Refuses a URL the helper will not request; returns the parsed URL otherwise. */
export function assertAllowedUrl(raw: string, allowHttp = false): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BoundedFetchError('blocked', 'The URL is not valid')
  }
  const okScheme = url.protocol === 'https:' || (allowHttp && url.protocol === 'http:')
  if (!okScheme) {
    throw new BoundedFetchError(
      'blocked',
      allowHttp ? 'Only http(s) URLs are allowed' : 'Only https URLs are allowed',
    )
  }
  if (url.username || url.password) {
    throw new BoundedFetchError('blocked', 'URLs with embedded credentials are not allowed')
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    host === 'localhost' ||
    BLOCKED_NAME_SUFFIXES.some((s) => host.endsWith(s)) ||
    ipv4Private(host) ||
    ipv6Private(host) ||
    (!host.includes('.') && !host.includes(':'))
  ) {
    throw new BoundedFetchError('blocked', 'Private, local and internal addresses are not allowed')
  }
  return url
}

async function readCapped(
  res: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined)
    throw new BoundedFetchError('too-large', `The response is larger than ${maxBytes} bytes`)
  }
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > maxBytes)
      throw new BoundedFetchError('too-large', `The response is larger than ${maxBytes} bytes`)
    return buf
  }
  const reader = res.body.getReader()
  // A stalled read() never returns on its own, so race every read against the deadline.
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(new BoundedFetchError('timeout', 'The request timed out'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
  aborted.catch(() => undefined)
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>
    try {
      step = await Promise.race([reader.read(), aborted])
    } catch (err) {
      await reader.cancel().catch(() => undefined)
      throw err
    }
    const { done, value } = step
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new BoundedFetchError('too-large', `The response is larger than ${maxBytes} bytes`)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

export async function boundedFetchText(
  rawUrl: string,
  opts: BoundedFetchOptions,
): Promise<BoundedFetchResult> {
  const fetchFn = opts.fetchFn ?? ((u, i) => remoteFetch(u, i))
  const maxRedirects = opts.maxRedirects ?? 3
  const signal = AbortSignal.timeout(opts.timeoutMs)
  let url = assertAllowedUrl(rawUrl, opts.allowHttp)
  try {
    for (let hop = 0; ; hop++) {
      const res = await fetchFn(url.href, { headers: opts.headers, redirect: 'manual', signal })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        await res.body?.cancel().catch(() => undefined)
        if (hop >= maxRedirects) {
          throw new BoundedFetchError('too-many-redirects', 'Too many redirects')
        }
        url = assertAllowedUrl(new URL(res.headers.get('location')!, url).href, opts.allowHttp)
        continue
      }
      if (res.url && res.url !== url.href) {
        // The fetch followed a redirect itself: the check could only run after the request.
        try {
          assertAllowedUrl(res.url, opts.allowHttp)
        } catch (err) {
          await res.body?.cancel().catch(() => undefined)
          throw err
        }
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        return { ok: false, status: res.status, finalUrl: url.href, text: '', bytes: 0 }
      }
      const bytes = await readCapped(res, opts.maxBytes, signal)
      return {
        ok: true,
        status: res.status,
        finalUrl: url.href,
        text: new TextDecoder('utf-8').decode(bytes),
        bytes: bytes.byteLength,
      }
    }
  } catch (err) {
    if (err instanceof BoundedFetchError) throw err
    if (signal.aborted) throw new BoundedFetchError('timeout', 'The request timed out')
    // Never echo the underlying message: it can carry the host or URL (secret iCal tokens).
    const code = (err as { code?: unknown } | null)?.code
    throw new BoundedFetchError(
      'network',
      typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)
        ? `The request failed (${code})`
        : 'The request failed',
    )
  }
}

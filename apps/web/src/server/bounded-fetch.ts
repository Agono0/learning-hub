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

export function ipv4Private(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments 192.0.0.0/24, IANA registry
    (a === 192 && b === 0 && c === 2) || // documentation TEST-NET-1 192.0.2.0/24, IANA registry
    (a === 198 && (b === 18 || b === 19)) || // benchmarking, RFC 2544
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224
  )
}

/**
 * Parse an IPv6 literal into eight 16-bit groups. Handles `::` compression and a trailing dotted
 * IPv4 part. Returns null for anything that is not a well-formed literal.
 */
function ipv6Groups(h: string): number[] | null {
  let text = h
  const dotted = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text)
  if (dotted) {
    const parts = dotted[2]!.split('.').map(Number)
    if (parts.some((n) => n > 255)) return null
    text = `${dotted[1]}${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const read = (part: string): number[] | null => {
    if (part === '') return []
    const out: number[] = []
    for (const g of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null
      out.push(parseInt(g, 16))
    }
    return out
  }
  const head = read(halves[0]!)
  const tail = halves.length === 2 ? read(halves[1]!) : []
  if (!head || !tail) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const fill = 8 - head.length - tail.length
  if (fill < 1) return null
  return [...head, ...new Array<number>(fill).fill(0), ...tail]
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

export function ipv6Private(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (!h.includes(':')) return false
  const g = ipv6Groups(h)
  // A literal we cannot parse is not one we can vouch for.
  if (!g) return true
  const zeros = (from: number, to: number) => g.slice(from, to).every((n) => n === 0)
  // ::/96 holds :: (unspecified), ::1 (loopback) and the deprecated IPv4-compatible form.
  if (zeros(0, 6)) return true
  // ::ffff:a.b.c.d (IPv4-mapped) and ::ffff:0:a.b.c.d (IPv4-translated).
  if (zeros(0, 5) && g[5] === 0xffff) return ipv4Private(v4From(g[6]!, g[7]!))
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return ipv4Private(v4From(g[6]!, g[7]!))
  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address; 64:ff9b:1::/48 is local use.
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (zeros(2, 6)) return ipv4Private(v4From(g[6]!, g[7]!))
    if (g[2] === 1) return true
  }
  // 6to4 2002::/16 embeds the IPv4 address in bits 16..47.
  if (g[0] === 0x2002) return ipv4Private(v4From(g[1]!, g[2]!))
  // Teredo 2001::/32 and documentation 2001:db8::/32.
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true
  // Unique-local fc00::/7, link-local fe80::/10, deprecated site-local fec0::/10, multicast ff00::/8.
  if ((g[0]! & 0xfe00) === 0xfc00) return true
  if ((g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xffc0) === 0xfec0) return true
  if ((g[0]! & 0xff00) === 0xff00) return true
  return false
}

/** True when a literal IP address (as returned by DNS or a URL) is private, loopback or link-local. */
export function isPrivateAddress(address: string): boolean {
  const a = address.replace(/^\[|\]$/g, '').toLowerCase()
  return ipv4Private(a) || ipv6Private(a)
}

/**
 * Optional connect-time fetch for Node. When registered (apps/web/instrumentation.ts on the
 * Node server) `boundedFetchText` uses it instead of the shared network seam, so the address
 * that is connected to is the address that was checked. It never falls back to an unpinned
 * fetch: if it refuses or fails, the call fails.
 */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>
/**
 * Held on globalThis, not in a module variable: Next compiles instrumentation.ts and each route
 * into separate bundles with their own copy of this module, so a module-level slot set by the
 * instrumentation hook would never be seen by the handlers (found by the built-server smoke).
 */
const PINNED_KEY = Symbol.for('learning-hub.pinned-fetch')
function getPinned(): FetchLike | null {
  return ((globalThis as Record<symbol, unknown>)[PINNED_KEY] as FetchLike | undefined) ?? null
}
/** True on a Node process (Next server, CLI, tests). False in browsers and web workers. */
function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node'
}

/**
 * Default transport. On Node the ONLY allowed transport is the registered pinned fetch: if
 * registration never ran or failed, requests are refused (fail closed) instead of using the
 * global fetch. Browser and worker runtimes (native bridge) keep `remoteFetch`.
 */
function defaultFetch(): (url: string, init?: RequestInit) => Promise<Response> {
  const pinned = getPinned()
  if (pinned) return pinned
  if (isNodeRuntime()) {
    return async () => {
      throw new BoundedFetchError(
        'network',
        'Outbound fetching is unavailable: address pinning is not registered on this server',
      )
    }
  }
  return (u, i) => remoteFetch(u, i)
}

/**
 * The outbound transport for handlers that give a fetch to a library (for example the share
 * channel transport): the connect-time pinned fetch on a Node server (fail closed when it is not
 * registered), the native bridge elsewhere. Resolved on every call so a later registration is seen.
 * Never the bare global fetch: that would skip the address check on what the socket connects to.
 */
export function outboundFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return defaultFetch()(typeof input === 'string' ? input : input.toString(), init)
}

export function setPinnedFetch(fn: FetchLike | null): void {
  ;(globalThis as Record<symbol, unknown>)[PINNED_KEY] = fn ?? undefined
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
  const fetchFn = opts.fetchFn ?? defaultFetch()
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
    // A refusal by the connect-time address policy is a policy decision, not a network fault.
    if (err instanceof Error && err.name === 'AddressRefusedError') {
      throw new BoundedFetchError(
        'blocked',
        'Private, local and internal addresses are not allowed',
      )
    }
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

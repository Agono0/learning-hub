/**
 * Connect-time address pinning for outbound fetches on Node (Next server and any Node host).
 *
 * `createPinnedNodeFetch()` returns a fetch-shaped function built on `node:http(s).request`.
 * The hostname is resolved by OUR lookup, every returned address is checked, and the socket is
 * opened to that exact validated address. The URL's original hostname stays in the Host header,
 * TLS SNI and certificate verification, so HTTPS validates against the name, not the IP.
 * If any answer is private, loopback or link-local the request is refused (never a partial
 * fallback), and there is no fallback to the global fetch on refusal or error.
 *
 * Semantics that differ from global fetch (on purpose, documented here):
 * - Redirects are never followed; the 3xx response is returned (callers re-validate each hop).
 * - Compressed bodies (gzip, deflate, br) are decompressed as a stream so the caller's byte cap
 *   applies to the DECOMPRESSED size. `accept-encoding` defaults to identity.
 * - `init.signal` destroys the socket; the body is a web ReadableStream, cancel destroys it.
 * - `agent: false`: no keep-alive pooling, so every request resolves and validates afresh.
 * - Only GET and HEAD without a body are supported.
 *
 * Node only. This file is imported from a Node-only entry (src/instrumentation.ts), never from
 * handler code, so it is not part of the browser or native worker bundles.
 */
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { Readable } from 'node:stream'
import zlib from 'node:zlib'
import { isPrivateAddress } from './bounded-fetch'

export type ResolveFn = (hostname: string) => Promise<{ address: string; family: number }[]>

export interface PinnedFetchOptions {
  /** Injected for tests; defaults to the system resolver (all answers). */
  resolve?: ResolveFn
  /** Injected for tests; defaults to refusing private, loopback and link-local addresses. */
  isAllowedAddress?: (address: string) => boolean
  /** Test-only: extra trusted CA (PEM) so a synthetic certificate can be verified. */
  ca?: string
}

export class AddressRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AddressRefusedError'
  }
}

const defaultResolve: ResolveFn = async (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true })

export function createPinnedLookup(opts: PinnedFetchOptions = {}) {
  const resolve = opts.resolve ?? defaultResolve
  const allowed = opts.isAllowedAddress ?? ((a: string) => !isPrivateAddress(a))
  return (
    hostname: string,
    options: { all?: boolean; family?: number } | undefined,
    cb: (err: Error | null, address?: unknown, family?: number) => void,
  ): void => {
    resolve(hostname)
      .then((answers) => {
        if (answers.length === 0) throw new AddressRefusedError(`No address found for ${hostname}`)
        const bad = answers.find((a) => !allowed(a.address))
        if (bad) {
          throw new AddressRefusedError('The host resolves to a private or local address')
        }
        if (options?.all) cb(null, answers)
        else cb(null, answers[0]!.address, answers[0]!.family)
      })
      .catch((err: unknown) => cb(err instanceof Error ? err : new Error(String(err))))
  }
}

function headersFrom(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {}
  new Headers(init?.headers).forEach((v, k) => {
    out[k] = v
  })
  if (!('accept-encoding' in out)) out['accept-encoding'] = 'identity'
  return out
}

export function createPinnedNodeFetch(opts: PinnedFetchOptions = {}) {
  const lookup = createPinnedLookup(opts)
  const allowed = opts.isAllowedAddress ?? ((a: string) => !isPrivateAddress(a))

  return function pinnedFetch(input: string, init?: RequestInit): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if ((method !== 'GET' && method !== 'HEAD') || init?.body) {
        reject(new TypeError('pinned fetch supports GET and HEAD without a body only'))
        return
      }
      let url: URL
      try {
        url = new URL(input)
      } catch (err) {
        reject(err)
        return
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        reject(new TypeError(`unsupported protocol ${url.protocol}`))
        return
      }
      const host = url.hostname.replace(/^\[|\]$/g, '')
      // IP literals skip DNS, so they never reach `lookup`: check them here.
      if (net.isIP(host) && !allowed(host)) {
        reject(new AddressRefusedError('The host is a private or local address'))
        return
      }
      const signal = init?.signal ?? undefined
      if (signal?.aborted) {
        reject(signal.reason ?? new Error('aborted'))
        return
      }
      const lib = url.protocol === 'https:' ? https : http
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: host,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method,
          headers: headersFrom(init),
          lookup: lookup as never,
          // No pooled sockets: every request resolves and validates its own address.
          agent: false,
          ...(opts.ca ? { ca: opts.ca } : {}),
          // Node's default autoSelectFamily path asks lookup for all answers; ours checks all.
          servername: net.isIP(host) ? undefined : host,
        },
        (res) => {
          const enc = String(res.headers['content-encoding'] ?? '').toLowerCase()
          let body: Readable = res
          if (enc === 'gzip' || enc === 'x-gzip') body = res.pipe(zlib.createGunzip())
          else if (enc === 'deflate') body = res.pipe(zlib.createInflate())
          else if (enc === 'br') body = res.pipe(zlib.createBrotliDecompress())
          const headers = new Headers()
          for (const [k, v] of Object.entries(res.headers)) {
            if (v === undefined) continue
            if (enc && (k === 'content-encoding' || k === 'content-length')) continue
            for (const one of Array.isArray(v) ? v : [v]) headers.append(k, one)
          }
          const status = res.statusCode ?? 0
          const nullBody = status === 204 || status === 304 || method === 'HEAD'
          const web = nullBody
            ? null
            : (Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>)
          if (nullBody) res.resume()
          const response = new Response(web, { status, statusText: res.statusMessage, headers })
          Object.defineProperty(response, 'url', { value: url.href })
          resolve(response)
        },
      )
      const onAbort = () =>
        req.destroy(signal?.reason instanceof Error ? signal.reason : new Error('aborted'))
      signal?.addEventListener('abort', onAbort, { once: true })
      req.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort)
        reject(err)
      })
      req.on('close', () => signal?.removeEventListener('abort', onAbort))
      req.end()
    })
  }
}

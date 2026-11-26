/**
 * Learning HUB server: browser-origin and bearer-token guard.
 *
 * Why: the headless REST server has no login. A web page the user visits can POST to a local
 * server with a CORS "simple" request (no preflight, for example `text/plain`), and a DNS
 * rebinding page can re-point its own hostname at 127.0.0.1 and read the data. Browsers always
 * send the real `Host` and, on cross-origin writes, an `Origin`, so refusing names and origins we
 * do not serve closes both routes. This mirrors the web host's guard (apps/web/src/lib/host-guard.ts)
 * but is a separate pure module: apps/server stays Next-free.
 *
 * What this is NOT: a request with no Origin (curl, a script, a local program) passes the origin
 * checks. Only the optional bearer token authenticates non-browser clients, and Origin is never
 * proof of identity (any client can send any value), so off loopback no token means no service.
 *
 * Pure functions: unit tested directly, wired in index.ts by `createRequestHandler`.
 */
import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'

export interface GuardConfig {
  /** Extra hostnames served besides loopback and IP literals. `host:port` also pins the port. */
  allowedHosts: string[]
  /** Exact extra origins (scheme://host[:port]) trusted for cross-origin writes. */
  allowedOrigins: string[]
  /** Accepted extension IDs. Empty = any chrome-extension:// origin. */
  extensionIds: string[]
  /** Bearer token. Empty/undefined = no token required. */
  token?: string
  /** True when the server listens beyond loopback (set from the bind address, not the env). */
  exposed?: boolean
  /** Opt-out: serve every request without a token even when exposed (LEARNING_HUB_ALLOW_UNAUTHENTICATED=1). */
  allowUnauthenticated?: boolean
  /** Opt-out: accept any Content-Type on writes (LEARNING_HUB_ALLOW_ANY_CONTENT_TYPE=1). */
  allowAnyContentType?: boolean
}

export type GuardVerdict =
  { ok: true } | { ok: false; status: 401 | 403 | 415 | 421; reason: string }

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
/** Origins used by the native shell (Tauri v2 on desktop, Android and iOS). Always trusted. */
export const NATIVE_ORIGINS: readonly string[] = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
]

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function flag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

/** Read the guard settings from the environment. */
export function readGuardConfig(env: Record<string, string | undefined>): GuardConfig {
  return {
    allowedHosts: [...list(env.LEARNING_HUB_ALLOWED_HOSTS), ...list(env.TAURI_DEV_HOST)],
    allowedOrigins: list(env.LEARNING_HUB_ALLOWED_ORIGINS),
    extensionIds: list(env.LEARNING_HUB_EXTENSION_IDS),
    token: env.LEARNING_HUB_API_TOKEN?.trim() || undefined,
    allowUnauthenticated: flag(env.LEARNING_HUB_ALLOW_UNAUTHENTICATED),
    allowAnyContentType: flag(env.LEARNING_HUB_ALLOW_ANY_CONTENT_TYPE),
  }
}

/** True when the bind address only accepts connections from this machine. */
export function isLoopbackBind(host: string): boolean {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || h === '127.0.0.1' || /^127\.\d+\.\d+\.\d+$/.test(h)
}

export interface ParsedHost {
  hostname: string
  port: string
}

/** Strict Host-header parse: a bare authority only (no userinfo, path, query, list, spaces). */
export function parseHost(raw: string | null | undefined): ParsedHost | null {
  if (!raw || raw.length > 255 || /[\s,@/\\?#]/.test(raw)) return null
  let url: URL
  try {
    url = new URL(`http://${raw}`)
  } catch {
    return null
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase()
  if (!hostname) return null
  return { hostname, port: url.port }
}

function isIpLiteral(hostname: string): boolean {
  return isIP(hostname.replace(/^\[|\]$/g, '')) !== 0
}

/**
 * DNS rebinding needs a hostname the attacker controls, so an IP literal Host is never a rebinding
 * vector. Loopback names, IP literals (LAN use by address) and configured hostnames are served.
 */
function hostAllowed(h: ParsedHost, cfg: GuardConfig): boolean {
  if (LOOPBACK_NAMES.has(h.hostname) || isIpLiteral(h.hostname)) return true
  return cfg.allowedHosts.some((entry) => {
    const want = parseHost(entry)
    return !!want && want.hostname === h.hostname && (want.port === '' || want.port === h.port)
  })
}

function sameOrigin(origin: string, host: ParsedHost): boolean {
  let o: URL
  try {
    o = new URL(origin)
  } catch {
    return false
  }
  if (
    o.protocol !== 'http:' ||
    o.username ||
    o.password ||
    o.pathname !== '/' ||
    o.search ||
    o.hash
  ) {
    return false
  }
  return (
    o.hostname.replace(/\.$/, '').toLowerCase() === host.hostname &&
    (o.port || '80') === (host.port || '80')
  )
}

export interface GuardRequest {
  method: string
  /** Request target (path and optional query). Only used to recognise the liveness probe. */
  url?: string | null
  host: string | null
  origin: string | null
  secFetchSite: string | null
  authorization: string | null
  /** Content-Type header, if any. */
  contentType?: string | null
  /** True when the request carries a body (Content-Length above 0 or Transfer-Encoding). */
  hasBody?: boolean
}

/** `application/json` or a `+json` type, with optional parameters (charset). */
export function isJsonContentType(value: string | null | undefined): boolean {
  const type = (value ?? '').split(';')[0]!.trim().toLowerCase()
  return type === 'application/json' || /^application\/[\w.+-]+\+json$/.test(type)
}

function tokenMatches(header: string | null, token: string): boolean {
  const m = /^bearer ([^\s]+)$/i.exec(header ?? '')
  if (!m) return false
  const a = Buffer.from(m[1]!)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The one unauthenticated route: GET /healthz answers `{"ok":true}` and nothing else. */
export const LIVENESS_PATH = '/healthz'

function isLivenessProbe(req: GuardRequest): boolean {
  return req.method === 'GET' && (req.url ?? '').split(/[?#]/)[0] === LIVENESS_PATH
}

export function checkRequest(req: GuardRequest, cfg: GuardConfig): GuardVerdict {
  const host = parseHost(req.host)
  if (!host || !hostAllowed(host, cfg))
    return { ok: false, status: 421, reason: 'host-not-allowed' }

  // Liveness probe for supervisors and load balancers: exact method and path, no token, no body.
  // The Host check above still applies. It carries no data, so Origin and token are moot.
  if (isLivenessProbe(req)) return { ok: true }

  // Exposed beyond loopback with no token: an Origin header is just text any client can send
  // (`Origin: tauri://localhost`, or one that matches Host), so it proves nothing. Nothing can tell
  // a trusted caller from an attacker, so refuse every request unless the operator opted out.
  if (cfg.exposed && !cfg.token && !cfg.allowUnauthenticated) {
    return { ok: false, status: 401, reason: 'token-not-configured' }
  }
  if (cfg.token && !tokenMatches(req.authorization, cfg.token)) {
    return { ok: false, status: 401, reason: 'token-required' }
  }

  const safe = SAFE_METHODS.has(req.method.toUpperCase())

  // A body that is not JSON on a write is what a cross-site form or text/plain fetch sends.
  if (!safe && req.hasBody && !cfg.allowAnyContentType && !isJsonContentType(req.contentType)) {
    return { ok: false, status: 415, reason: 'json-required' }
  }
  // Fetch metadata (browsers only): a cross-site write is refused even if Origin were stripped.
  if (!safe && req.secFetchSite === 'cross-site') {
    return { ok: false, status: 403, reason: 'cross-site-write' }
  }
  if (req.origin === null) return { ok: true }
  if (req.origin === 'null') return { ok: false, status: 403, reason: 'origin-null' }
  if (sameOrigin(req.origin, host)) return { ok: true }
  if (NATIVE_ORIGINS.includes(req.origin) || cfg.allowedOrigins.includes(req.origin)) {
    return { ok: true }
  }
  if (req.origin.startsWith('chrome-extension://')) {
    const id = req.origin.slice('chrome-extension://'.length)
    if (cfg.extensionIds.length === 0 || cfg.extensionIds.includes(id)) return { ok: true }
  }
  // Unlisted cross-origin: the browser already hides reads (no CORS headers); refuse writes.
  return safe ? { ok: true } : { ok: false, status: 403, reason: 'cross-origin-write' }
}

function header(req: IncomingMessage, name: string): string | null {
  const v = req.headers[name]
  return typeof v === 'string' ? v : null
}

/** Run the guard on a node request. Sends the refusal and returns false when it is blocked. */
export function guardRequest(req: IncomingMessage, res: ServerResponse, cfg: GuardConfig): boolean {
  const verdict = checkRequest(
    {
      method: req.method ?? 'GET',
      url: req.url ?? null,
      host: header(req, 'host'),
      origin: header(req, 'origin'),
      secFetchSite: header(req, 'sec-fetch-site'),
      authorization: header(req, 'authorization'),
      contentType: header(req, 'content-type'),
      hasBody: Number(req.headers['content-length'] ?? 0) > 0 || 'transfer-encoding' in req.headers,
    },
    cfg,
  )
  if (verdict.ok) return true
  if (!res.writableEnded) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' }
    if (verdict.status === 401) headers['WWW-Authenticate'] = 'Bearer'
    res.writeHead(verdict.status, headers)
    res.end(JSON.stringify({ error: 'Forbidden', reason: verdict.reason }))
  }
  return false
}

/** Wrap a request handler so the guard runs first. */
export function withGuard(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  cfg: GuardConfig,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (guardRequest(req, res, cfg)) handler(req, res)
  }
}

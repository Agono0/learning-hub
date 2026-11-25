/**
 * Host / Origin guard for the Node web server (`LEARNING_HUB_TARGET=web`).
 *
 * Why: the app has no login (SECURITY.md). A page on another site can reach it by DNS rebinding
 * (the attacker's hostname is re-pointed at 127.0.0.1, so the browser treats the app as same-origin
 * with that hostname), and a cross-site form or fetch can try to send a request. Browsers always
 * send the real `Host` and `Origin`, so refusing names we do not serve closes that route.
 *
 * What this is NOT: it is a browser-side defense. A request with no Origin (curl, a script, any
 * local program) is allowed, and nothing here authenticates a non-browser client. It does not
 * protect against a local attacker that can already run code or read the database.
 *
 * Pure functions, no Next imports, so they are unit tested directly. `proxy.ts` is the thin shell.
 */

export interface GuardConfig {
  /** Hostnames served in addition to loopback. A `host:port` entry also pins the port. */
  allowedHosts: string[]
  /** Exact extra origins (scheme://host[:port]) trusted for cross-origin requests. */
  allowedOrigins: string[]
  /** Pin accepted extension IDs. Empty = any chrome-extension:// origin on non-secret routes. */
  extensionIds: string[]
}

export type GuardVerdict = { ok: true } | { ok: false; status: 403 | 421; reason: string }

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Routes that return a secret. Never reachable cross-origin, by any allowlist or extension. */
export const SECRET_ROUTE_PREFIXES = ['/api/focus/bridge'] as const

/**
 * Canonical form used only for matching secret routes: percent-decoded (repeatedly, bounded),
 * lower-cased, duplicate slashes and dot segments resolved. A route is secret if EITHER the raw
 * or the canonical path matches, so an encoded or oddly cased spelling cannot dodge the rule.
 */
export function canonicalPath(pathname: string): string {
  let p = pathname
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(p)
      if (d === p) break
      p = d
    } catch {
      break
    }
  }
  const out: string[] = []
  for (const seg of p.replace(/\\/g, '/').toLowerCase().split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return `/${out.join('/')}`
}

export function isSecretRoute(pathname: string): boolean {
  const match = (x: string) => SECRET_ROUTE_PREFIXES.some((p) => x === p || x.startsWith(`${p}/`))
  return match(pathname) || match(canonicalPath(pathname))
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Read the guard settings from the environment. TAURI_DEV_HOST (native dev on a LAN IP) is honored. */
export function readGuardConfig(env: Record<string, string | undefined>): GuardConfig {
  return {
    allowedHosts: [...list(env.LEARNING_HUB_ALLOWED_HOSTS), ...list(env.TAURI_DEV_HOST)],
    allowedOrigins: list(env.LEARNING_HUB_ALLOWED_ORIGINS),
    extensionIds: list(env.LEARNING_HUB_EXTENSION_IDS),
  }
}

export interface ParsedHost {
  hostname: string
  port: string
}

/**
 * Parse a Host-style value (`name`, `name:port`, `[::1]:port`) deliberately. Anything that is not a
 * bare authority is rejected: userinfo, paths, queries, spaces, commas (a folded duplicate header),
 * empty names.
 */
export function parseHost(raw: string | null | undefined): ParsedHost | null {
  if (!raw || raw.length > 255 || /[\s,@/\\?#]/.test(raw)) return null
  let url: URL
  try {
    url = new URL(`http://${raw}`)
  } catch {
    return null
  }
  // The re-serialized authority must equal the input (modulo case, default port): no smuggled parts.
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase()
  if (!hostname) return null
  return { hostname, port: url.port }
}

function hostAllowed(h: ParsedHost, cfg: GuardConfig): boolean {
  if (LOOPBACK.has(h.hostname)) return true
  return cfg.allowedHosts.some((entry) => {
    const want = parseHost(entry)
    if (!want) return false
    return want.hostname === h.hostname && (want.port === '' || want.port === h.port)
  })
}

export interface GuardRequest {
  method: string
  pathname: string
  /** 'http:' or 'https:' as the server received it. */
  protocol: string
  host: string | null
  /** Present only if a proxy set it. Validated as a Host too, never trusted for anything else. */
  forwardedHost: string | null
  origin: string | null
  secFetchSite: string | null
}

function sameOrigin(origin: string, protocol: string, host: ParsedHost): boolean {
  let o: URL
  try {
    o = new URL(origin)
  } catch {
    return false
  }
  if (o.username || o.password || o.pathname !== '/' || o.search || o.hash) return false
  const oPort = o.port || (o.protocol === 'https:' ? '443' : '80')
  const hPort = host.port || (protocol === 'https:' ? '443' : '80')
  return (
    o.protocol === protocol &&
    o.hostname.replace(/\.$/, '').toLowerCase() === host.hostname &&
    oPort === hPort
  )
}

export function checkRequest(req: GuardRequest, cfg: GuardConfig): GuardVerdict {
  const host = parseHost(req.host)
  if (!host || !hostAllowed(host, cfg)) {
    return { ok: false, status: 421, reason: 'host-not-allowed' }
  }
  if (req.forwardedHost !== null) {
    const fwd = parseHost(req.forwardedHost)
    if (!fwd || !hostAllowed(fwd, cfg)) {
      return { ok: false, status: 421, reason: 'forwarded-host-not-allowed' }
    }
  }

  const secret = isSecretRoute(req.pathname)

  // Fetch metadata (browsers only): a secret route is same-origin or a direct navigation, nothing else.
  if (secret && req.secFetchSite !== null) {
    if (req.secFetchSite !== 'same-origin' && req.secFetchSite !== 'none') {
      return { ok: false, status: 403, reason: 'secret-route-cross-site' }
    }
  }

  if (req.origin === null) return { ok: true }
  // "null" origins (sandboxed iframes, redirects) are never trusted.
  if (req.origin === 'null') return { ok: false, status: 403, reason: 'origin-null' }

  if (sameOrigin(req.origin, req.protocol, host)) return { ok: true }

  const explicit = cfg.allowedOrigins.includes(req.origin)
  if (secret) {
    // Secret routes: only same-origin, or an origin the operator listed by exact string.
    return explicit ? { ok: true } : { ok: false, status: 403, reason: 'secret-route-origin' }
  }
  if (explicit) return { ok: true }

  // The companion extension talks to the app (capture, lock status). Its ID is not fixed for an
  // unpacked install, so any extension origin is accepted on non-secret routes unless IDs are pinned.
  if (req.origin.startsWith('chrome-extension://')) {
    const id = req.origin.slice('chrome-extension://'.length)
    if (cfg.extensionIds.length === 0 || cfg.extensionIds.includes(id)) return { ok: true }
  }

  // Unlisted cross-origin: reads were already blocked by the browser without CORS headers;
  // refuse state changes outright.
  if (!SAFE_METHODS.has(req.method.toUpperCase())) {
    return { ok: false, status: 403, reason: 'cross-origin-write' }
  }
  return { ok: true }
}

/**
 * @file host-policy.ts
 * @description Pure destination policy for channel hosts (no DNS, no node:*).
 *
 * This is a STRING-LEVEL guard. It refuses URLs whose literal host is a
 * credentialed, loopback, private, link-local, reserved or obviously internal
 * name. It cannot see what a public hostname RESOLVES to, so it is not a
 * complete SSRF defence: DNS answers pointing at private addresses and DNS
 * rebinding need a connect-time check in the runtime that owns the socket
 * (see docs/share-channels.md, "Host URL policy").
 */

export interface HostPolicyOptions {
  /**
   * Allow loopback hosts (localhost, 127.0.0.0/8, ::1) and, for them only,
   * plain http. Off by default. Never widens to LAN or private ranges.
   */
  allowHttpLoopback?: boolean
}

export type HostPolicyVerdict = { ok: true; url: URL } | { ok: false; reason: string }

/** Redirect hops followed (same origin only). */
export const MAX_REDIRECT_HOPS = 3

const INTERNAL_SUFFIXES = ['.local', '.internal', '.localdomain', '.home.arpa', '.lan']

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

function parseIpv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null
}

/** Parse an IPv6 literal (already bracket-stripped) into eight 16-bit groups. */
function parseIpv6(host: string): number[] | null {
  if (!host.includes(':')) return null
  let text = host.split('%')[0] ?? ''
  // Embedded dotted IPv4 tail (::ffff:1.2.3.4) becomes two hex groups.
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (tail) {
    const v4 = parseIpv4(tail[1]!)
    if (!v4) return null
    const hi = ((v4[0]! << 8) | v4[1]!).toString(16)
    const lo = ((v4[2]! << 8) | v4[3]!).toString(16)
    text = `${text.slice(0, text.length - tail[1]!.length)}${hi}:${lo}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const toGroups = (s: string): number[] | null => {
    if (s === '') return []
    const out: number[] = []
    for (const g of s.split(':')) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null
      out.push(parseInt(g, 16))
    }
    return out
  }
  const head = toGroups(halves[0] ?? '')
  const rest = halves.length === 2 ? toGroups(halves[1] ?? '') : []
  if (!head || !rest) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const fill = 8 - head.length - rest.length
  if (fill < 1) return null
  return [...head, ...new Array<number>(fill).fill(0), ...rest]
}

/** Why an IPv4 address is not a public unicast address, or null when it is. */
function ipv4Reason(p: number[]): string | null {
  const [a, b] = [p[0]!, p[1]!]
  if (a === 127) return 'loopback'
  if (a === 0) return 'unspecified'
  if (a === 10) return 'private'
  if (a === 172 && b >= 16 && b <= 31) return 'private'
  if (a === 192 && b === 168) return 'private'
  if (a === 169 && b === 254) return 'link-local'
  if (a === 100 && b >= 64 && b <= 127) return 'shared-address-space'
  if (a === 192 && b === 0 && p[2] === 0) return 'reserved'
  if (a === 192 && b === 0 && p[2] === 2) return 'reserved'
  if (a === 198 && (b === 18 || b === 19)) return 'reserved'
  if (a === 198 && b === 51 && p[2] === 100) return 'reserved'
  if (a === 203 && b === 0 && p[2] === 113) return 'reserved'
  if (a >= 224) return 'multicast-or-reserved'
  return null
}

/**
 * Classify an IP literal (v4 or v6, brackets allowed). Returns the reason it
 * is not a public unicast address, or null when it is, or 'not-an-ip' for a
 * name. Exported so a runtime with a connect-time hook can reuse the table.
 */
export function classifyIp(address: string): string | null {
  const host = stripBrackets(address.trim().toLowerCase())
  const v4 = parseIpv4(host)
  if (v4) return ipv4Reason(v4)
  const g = parseIpv6(host)
  if (!g) return 'not-an-ip'
  const allZeroExceptLast = g.slice(0, 7).every((x) => x === 0)
  if (allZeroExceptLast && g[7] === 1) return 'loopback'
  if (g.every((x) => x === 0)) return 'unspecified'
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms.
  const first5Zero = g.slice(0, 5).every((x) => x === 0)
  if (first5Zero && (g[5] === 0xffff || g[5] === 0)) {
    const v4m = [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255]
    return ipv4Reason(v4m) ?? 'ipv4-embedded'
  }
  // 64:ff9b::/96 NAT64, 2002::/16 6to4, 2001::/32 Teredo, 2001:db8::/32 docs.
  if (g[0] === 0x64 && g[1] === 0xff9b) return 'ipv4-embedded'
  if (g[0] === 0x2002) return 'ipv4-embedded'
  if (g[0] === 0x2001 && g[1] === 0) return 'ipv4-embedded'
  if (g[0] === 0x2001 && g[1] === 0xdb8) return 'reserved'
  if ((g[0]! & 0xfe00) === 0xfc00) return 'private'
  if ((g[0]! & 0xffc0) === 0xfe80) return 'link-local'
  if ((g[0]! & 0xffc0) === 0xfec0) return 'private'
  if ((g[0]! & 0xff00) === 0xff00) return 'multicast-or-reserved'
  return null
}

function isLoopbackName(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost')
}

/**
 * Validate and normalize a host URL. The WHATWG URL parser first folds odd
 * IPv4 spellings (decimal, hex, octal, short forms) into dotted decimal, so
 * the checks below see the address the socket would use.
 */
export function checkHostUrl(raw: string | URL, opts: HostPolicyOptions = {}): HostPolicyVerdict {
  let url: URL
  try {
    url = raw instanceof URL ? new URL(raw.href) : new URL(raw)
  } catch {
    return { ok: false, reason: 'not a valid URL' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: `scheme ${url.protocol} is not allowed` }
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'credentials in the URL are not allowed' }
  }
  const host = stripBrackets(url.hostname.toLowerCase()).replace(/\.$/, '')
  if (host === '') return { ok: false, reason: 'missing host' }

  const ipReason = classifyIp(host)
  let loopback = false
  if (ipReason !== 'not-an-ip') {
    if (ipReason === 'loopback') loopback = true
    else if (ipReason !== null) return { ok: false, reason: `${ipReason} address` }
  } else if (isLoopbackName(host)) {
    loopback = true
  } else if (!host.includes('.')) {
    return { ok: false, reason: 'single-label host names are not allowed' }
  } else if (INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: 'internal host name' }
  }

  if (loopback) {
    if (!opts.allowHttpLoopback) return { ok: false, reason: 'loopback host' }
    return { ok: true, url }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https is required' }
  return { ok: true, url }
}

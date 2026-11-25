import { describe, expect, it } from 'vitest'
import {
  checkRequest,
  isSecretRoute,
  parseHost,
  readGuardConfig,
  type GuardConfig,
  type GuardRequest,
} from '../src/lib/host-guard'

const cfg = (over: Partial<GuardConfig> = {}): GuardConfig => ({
  allowedHosts: [],
  allowedOrigins: [],
  extensionIds: [],
  ...over,
})
const req = (over: Partial<GuardRequest> = {}): GuardRequest => ({
  method: 'GET',
  pathname: '/api/cards',
  protocol: 'http:',
  host: 'localhost:3000',
  forwardedHost: null,
  origin: null,
  secFetchSite: null,
  ...over,
})
const status = (r: GuardRequest, c = cfg()) => {
  const v = checkRequest(r, c)
  return v.ok ? 200 : v.status
}

describe('parseHost', () => {
  it('parses names, ports, IPv6 and trailing dots', () => {
    expect(parseHost('LocalHost:3000')).toEqual({ hostname: 'localhost', port: '3000' })
    expect(parseHost('127.0.0.1')).toEqual({ hostname: '127.0.0.1', port: '' })
    expect(parseHost('[::1]:3000')).toEqual({ hostname: '[::1]', port: '3000' })
    expect(parseHost('localhost.:3000')?.hostname).toBe('localhost')
  })
  it.each([
    '',
    'user@localhost',
    'localhost/evil',
    'localhost?x=1',
    'localhost#x',
    'a b',
    'localhost,evil.com',
    'localhost:3000,evil.com:80',
    'localhost\\evil',
    'x'.repeat(300),
    ':3000',
  ])('rejects malformed %j', (bad) => {
    expect(parseHost(bad)).toBeNull()
  })
  it('rejects null', () => expect(parseHost(null)).toBeNull())
})

describe('Host allowlist', () => {
  it('serves loopback names on any port', () => {
    for (const h of ['localhost:3000', 'localhost', '127.0.0.1:4000', '[::1]:3000']) {
      expect(status(req({ host: h }))).toBe(200)
    }
  })
  it('refuses a rebound hostname, suffix and substring tricks', () => {
    for (const h of [
      'evil.example:3000',
      'localhost.evil.example',
      'evil-localhost',
      '127.0.0.1.evil.example',
      'localhostx',
      '0.0.0.0:3000',
      '192.168.1.20:3000',
    ]) {
      expect(status(req({ host: h }))).toBe(421)
    }
  })
  it('refuses a missing or folded Host', () => {
    expect(status(req({ host: null }))).toBe(421)
    expect(status(req({ host: 'localhost,evil.example' }))).toBe(421)
  })
  it('serves an explicitly configured LAN or custom host, with or without a pinned port', () => {
    const c = cfg({ allowedHosts: ['192.168.1.20', 'hub.lan:8443'] })
    expect(status(req({ host: '192.168.1.20:3000' }), c)).toBe(200)
    expect(status(req({ host: 'hub.lan:8443' }), c)).toBe(200)
    expect(status(req({ host: 'hub.lan:3000' }), c)).toBe(421)
    expect(status(req({ host: 'other.lan' }), c)).toBe(421)
  })
  it('TAURI_DEV_HOST and the env lists are read', () => {
    const c = readGuardConfig({
      TAURI_DEV_HOST: '10.0.0.5',
      LEARNING_HUB_ALLOWED_HOSTS: 'a.lan, b.lan',
      LEARNING_HUB_ALLOWED_ORIGINS: 'https://x.test',
      LEARNING_HUB_EXTENSION_IDS: 'abc',
    })
    expect(c.allowedHosts).toEqual(['a.lan', 'b.lan', '10.0.0.5'])
    expect(c.allowedOrigins).toEqual(['https://x.test'])
    expect(c.extensionIds).toEqual(['abc'])
    expect(status(req({ host: '10.0.0.5:3000' }), c)).toBe(200)
  })
  it('validates X-Forwarded-Host too, so a spoofed value cannot smuggle a name in', () => {
    expect(status(req({ forwardedHost: 'evil.example' }))).toBe(421)
    expect(status(req({ forwardedHost: 'localhost:3000' }))).toBe(200)
    expect(status(req({ forwardedHost: 'a@localhost' }))).toBe(421)
  })
})

describe('Origin', () => {
  it('allows no Origin (non-browser client) and says nothing more about it', () => {
    expect(status(req({ method: 'POST' }))).toBe(200)
  })
  it('allows the exact same origin: scheme, host and port', () => {
    expect(status(req({ method: 'POST', origin: 'http://localhost:3000' }))).toBe(200)
    expect(status(req({ method: 'POST', origin: 'http://LOCALHOST:3000' }))).toBe(200)
  })
  it('refuses a same-host origin with a different port or scheme on writes', () => {
    expect(status(req({ method: 'POST', origin: 'http://localhost:4000' }))).toBe(403)
    expect(status(req({ method: 'POST', origin: 'https://localhost:3000' }))).toBe(403)
    expect(status(req({ method: 'POST', origin: 'http://127.0.0.1:3000' }))).toBe(403)
  })
  it('refuses cross-origin writes and a null origin', () => {
    expect(status(req({ method: 'PUT', origin: 'https://evil.example' }))).toBe(403)
    expect(status(req({ method: 'DELETE', origin: 'http://localhost:3000.evil.example' }))).toBe(
      403,
    )
    expect(status(req({ method: 'POST', origin: 'null' }))).toBe(403)
    expect(status(req({ method: 'GET', origin: 'null' }))).toBe(403)
  })
  it('leaves cross-origin reads to the browser (no CORS headers are sent)', () => {
    expect(status(req({ method: 'GET', origin: 'https://evil.example' }))).toBe(200)
  })
  it('accepts a listed origin exactly, never by prefix', () => {
    const c = cfg({ allowedOrigins: ['https://ui.example'] })
    expect(status(req({ method: 'POST', origin: 'https://ui.example' }), c)).toBe(200)
    expect(status(req({ method: 'POST', origin: 'https://ui.example.evil' }), c)).toBe(403)
  })
  it('honors the https default port when the Host omits it', () => {
    const c = cfg({ allowedHosts: ['hub.lan'] })
    const r = { protocol: 'https:', host: 'hub.lan', method: 'POST' }
    expect(status(req({ ...r, origin: 'https://hub.lan' }), c)).toBe(200)
    expect(status(req({ ...r, origin: 'https://hub.lan:443' }), c)).toBe(200)
    expect(status(req({ ...r, origin: 'https://hub.lan:8443' }), c)).toBe(403)
  })
})

describe('companion extension', () => {
  const ext = 'chrome-extension://abcdefghijklmnop'
  it('may write to non-secret routes (capture) when no IDs are pinned', () => {
    expect(status(req({ method: 'POST', pathname: '/api/cards', origin: ext }))).toBe(200)
  })
  it('only the pinned IDs when pinned', () => {
    const c = cfg({ extensionIds: ['abcdefghijklmnop'] })
    expect(status(req({ method: 'POST', origin: ext }), c)).toBe(200)
    expect(status(req({ method: 'POST', origin: 'chrome-extension://zzzz' }), c)).toBe(403)
  })
})

describe('secret routes', () => {
  const p = '/api/focus/bridge'
  it('knows the secret route and its children, not lookalikes', () => {
    expect(isSecretRoute(p)).toBe(true)
    expect(isSecretRoute(`${p}/x`)).toBe(true)
    expect(isSecretRoute('/api/focus/bridgex')).toBe(false)
  })
  it('cannot be dodged by encoding, case, dot segments or extra slashes', () => {
    for (const path of [
      '/api/focus/%62ridge',
      '/api/focus/%2562ridge',
      '/API/focus/Bridge',
      '//api//focus//bridge',
      '/api/focus/x/../bridge',
      '/api/focus/bridge/',
      '/api/focus\\bridge',
    ]) {
      expect(isSecretRoute(path), path).toBe(true)
      expect(status(req({ pathname: path, origin: 'https://evil.example' })), path).toBe(403)
    }
    expect(isSecretRoute('/api/focus/max')).toBe(false)
  })
  it('is reachable from the app itself and from a plain client', () => {
    expect(
      status(req({ pathname: p, secFetchSite: 'same-origin', origin: 'http://localhost:3000' })),
    ).toBe(200)
    expect(status(req({ pathname: p, secFetchSite: 'same-origin' }))).toBe(200)
    expect(status(req({ pathname: p }))).toBe(200)
  })
  it('is refused to any extension, even with pinned IDs', () => {
    const ext = 'chrome-extension://abcdefghijklmnop'
    expect(status(req({ pathname: p, origin: ext }))).toBe(403)
    expect(
      status(req({ pathname: p, origin: ext }), cfg({ extensionIds: ['abcdefghijklmnop'] })),
    ).toBe(403)
  })
  it('is refused cross-site and same-site fetches, and cross-origin even on GET', () => {
    expect(status(req({ pathname: p, secFetchSite: 'cross-site' }))).toBe(403)
    expect(status(req({ pathname: p, secFetchSite: 'same-site' }))).toBe(403)
    expect(status(req({ pathname: p, origin: 'https://evil.example' }))).toBe(403)
    expect(status(req({ pathname: p, method: 'POST', origin: 'https://evil.example' }))).toBe(403)
  })
  it('is refused on a rebound host before anything else', () => {
    expect(status(req({ pathname: p, host: 'evil.example:3000' }))).toBe(421)
  })
  it('allows an operator-listed origin by exact match', () => {
    expect(
      status(
        req({ pathname: p, origin: 'https://ui.example' }),
        cfg({ allowedOrigins: ['https://ui.example'] }),
      ),
    ).toBe(200)
  })
})

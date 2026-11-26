/**
 * Pinned adapter end to end. Resolution is always an injected stub (no DNS). Sockets only
 * ever open to an ephemeral listener on this machine's loopback interface, inside the test
 * process: no external connection, account or service. A TLS listener with a certificate
 * generated at test time (openssl, synthetic, thrown away) is used for the certificate
 * and SNI checks, because certificate validation cannot be exercised without a TLS peer.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo, Socket } from 'node:net'
import zlib from 'node:zlib'
import { createPinnedNodeFetch } from '../src/server/pinned-fetch-node'
import { boundedFetchText, BoundedFetchError, isPrivateAddress } from '../src/server/bounded-fetch'

const LOOP = [{ address: '127.0.0.1', family: 4 }]
// Loopback is allowed ONLY so the local fixture is reachable; 10.x stays refused.
const allow = (a: string) => a === '127.0.0.1' || !isPrivateAddress(a)

let dir = ''
let cert = ''
let key = ''
let httpServer: http.Server
let tlsServer: https.Server
let httpPort = 0
let tlsPort = 0
const httpSeen: string[] = []
const tlsSeen: string[] = []
const sni: (string | false)[] = []
const sockets = new Set<Socket>()
const closed: string[] = []

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'pinned-tls-'))
  execFileSync(
    'openssl',
    [
      ...['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes'],
      ...['-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2'],
      ...['-subj', '/CN=pinned.test', '-addext', 'subjectAltName=DNS:pinned.test'],
    ],
    { stdio: 'ignore' },
  )
  cert = readFileSync(path.join(dir, 'c.pem'), 'utf8')
  key = readFileSync(path.join(dir, 'k.pem'), 'utf8')

  httpServer = http.createServer((req, res) => {
    httpSeen.push(`${req.headers.host}${req.url}`)
    res.on('close', () => closed.push(req.url ?? ''))
    switch (req.url) {
      case '/r1':
        res.writeHead(302, { location: `http://b.test:${httpPort}/final` })
        return void res.end()
      case '/r2':
        res.writeHead(302, { location: `http://evil.test:${httpPort}/secret` })
        return void res.end()
      case '/final':
        return void res.end('final-body')
      case '/hang':
        return // never answers
      case '/stall':
        res.writeHead(200, { 'content-length': '100000' })
        return void res.write('partial')
      case '/badgz':
        res.writeHead(200, { 'content-encoding': 'gzip' })
        return void res.end(Buffer.from('this is not gzip data at all, just plain bytes'))
      case '/bomb':
        res.writeHead(200, { 'content-encoding': 'gzip' })
        return void res.end(zlib.gzipSync(Buffer.alloc(20 * 1024 * 1024)))
      default:
        res.end('ok')
    }
  })
  httpServer.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise<void>((r) => httpServer.listen(0, '127.0.0.1', r))
  httpPort = (httpServer.address() as AddressInfo).port

  tlsServer = https.createServer(
    {
      key,
      cert,
      SNICallback: (name, cb) => {
        sni.push(name)
        cb(null, undefined)
      },
    },
    (req, res) => {
      tlsSeen.push(`${req.headers.host}${req.url}`)
      res.end('tls-ok')
    },
  )
  await new Promise<void>((r) => tlsServer.listen(0, '127.0.0.1', r))
  tlsPort = (tlsServer.address() as AddressInfo).port
})
afterAll(() => {
  for (const s of sockets) s.destroy()
  httpServer.close()
  tlsServer.close()
  rmSync(dir, { recursive: true, force: true })
})

function mk(map: Record<string, { address: string; family: number }[]>, extra = {}) {
  const calls: string[] = []
  const fetchFn = createPinnedNodeFetch({
    resolve: async (h) => {
      calls.push(h)
      return map[h] ?? []
    },
    isAllowedAddress: allow,
    ...extra,
  })
  return { fetchFn, calls }
}

describe('TLS against the original hostname', () => {
  it('verifies the cert for the URL hostname, sends it as SNI and Host, resolving once', async () => {
    const { fetchFn, calls } = mk({ 'pinned.test': LOOP }, { ca: cert })
    sni.length = 0
    const r = await boundedFetchText(`https://pinned.test:${tlsPort}/x`, {
      maxBytes: 1000,
      timeoutMs: 5000,
      fetchFn,
    })
    expect(r.text).toBe('tls-ok')
    expect(sni).toEqual(['pinned.test'])
    expect(tlsSeen.at(-1)).toBe(`pinned.test:${tlsPort}/x`)
    expect(calls).toEqual(['pinned.test'])
  })

  it('refuses a certificate that does not match the hostname, before any request', async () => {
    const { fetchFn } = mk({ 'other.test': LOOP }, { ca: cert })
    const before = tlsSeen.length
    await expect(fetchFn(`https://other.test:${tlsPort}/x`)).rejects.toMatchObject({
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
    })
    expect(tlsSeen.length).toBe(before)
  })

  it('refuses an untrusted certificate even for the right name', async () => {
    const { fetchFn } = mk({ 'pinned.test': LOOP })
    const before = tlsSeen.length
    await expect(fetchFn(`https://pinned.test:${tlsPort}/x`)).rejects.toThrow()
    expect(tlsSeen.length).toBe(before)
  })
})

describe('redirects through the pinned adapter (stub resolver)', () => {
  it('validates and resolves every hop separately, one lookup per hop', async () => {
    const { fetchFn, calls } = mk({ 'a.test': LOOP, 'b.test': LOOP })
    const r = await boundedFetchText(`http://a.test:${httpPort}/r1`, {
      maxBytes: 1000,
      timeoutMs: 5000,
      allowHttp: true,
      fetchFn,
    })
    expect(r.text).toBe('final-body')
    expect(calls).toEqual(['a.test', 'b.test'])
    expect(httpSeen.slice(-2)).toEqual([`a.test:${httpPort}/r1`, `b.test:${httpPort}/final`])
  })

  it('refuses a redirect to a name that resolves privately, with no second request', async () => {
    const { fetchFn, calls } = mk({
      'a.test': LOOP,
      'evil.test': [{ address: '10.0.0.5', family: 4 }],
    })
    const before = httpSeen.length
    await expect(
      boundedFetchText(`http://a.test:${httpPort}/r2`, {
        maxBytes: 1000,
        timeoutMs: 5000,
        allowHttp: true,
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: 'blocked' })
    expect(calls).toEqual(['a.test', 'evil.test'])
    expect(httpSeen.length).toBe(before + 1)
  })

  it('refuses mixed and IPv4-mapped answers with zero requests', async () => {
    const { fetchFn } = mk({
      'm.test': [LOOP[0]!, { address: '::ffff:a00:1', family: 6 }],
      'v.test': [{ address: '::ffff:7f00:1', family: 6 }],
    } as never)
    const before = httpSeen.length
    await expect(fetchFn(`http://m.test:${httpPort}/`)).rejects.toThrow()
    await expect(fetchFn(`http://v.test:${httpPort}/`)).rejects.toThrow()
    expect(httpSeen.length).toBe(before)
  })
})

describe('abort and stream semantics', () => {
  it('abort during DNS rejects promptly and opens no request', async () => {
    const fetchFn = createPinnedNodeFetch({
      resolve: () => new Promise(() => undefined),
      isAllowedAddress: allow,
    })
    const before = httpSeen.length
    const t0 = Date.now()
    await expect(
      boundedFetchText(`http://slow.test:${httpPort}/`, {
        maxBytes: 1000,
        timeoutMs: 80,
        allowHttp: true,
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: 'timeout' })
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(httpSeen.length).toBe(before)
  })

  it('abort while waiting for response headers closes the socket', async () => {
    const { fetchFn } = mk({ 'h.test': LOOP })
    await expect(
      boundedFetchText(`http://h.test:${httpPort}/hang`, {
        maxBytes: 1000,
        timeoutMs: 100,
        allowHttp: true,
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: 'timeout' })
    await new Promise((r) => setTimeout(r, 50))
    expect(closed).toContain('/hang')
  })

  it('abort in the middle of a stalled body rejects and closes the socket', async () => {
    const { fetchFn } = mk({ 's.test': LOOP })
    await expect(
      boundedFetchText(`http://s.test:${httpPort}/stall`, {
        maxBytes: 1_000_000,
        timeoutMs: 150,
        allowHttp: true,
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: 'timeout' })
    await new Promise((r) => setTimeout(r, 50))
    expect(closed).toContain('/stall')
  })

  it('a corrupt gzip body fails as a clean network error', async () => {
    const { fetchFn } = mk({ 'g.test': LOOP })
    const err = await boundedFetchText(`http://g.test:${httpPort}/badgz`, {
      maxBytes: 1000,
      timeoutMs: 5000,
      allowHttp: true,
      fetchFn,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BoundedFetchError)
    expect((err as BoundedFetchError).code).toBe('network')
    expect((err as Error).message).not.toMatch(/g\.test|badgz/)
  })

  it('a gzip bomb (about 20 KB on the wire, 20 MB inflated) is stopped by the byte cap', async () => {
    const { fetchFn } = mk({ 'z.test': LOOP })
    const t0 = Date.now()
    await expect(
      boundedFetchText(`http://z.test:${httpPort}/bomb`, {
        maxBytes: 4096,
        timeoutMs: 5000,
        allowHttp: true,
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: 'too-large' })
    expect(Date.now() - t0).toBeLessThan(3000)
    await new Promise((r) => setTimeout(r, 50))
    expect(closed).toContain('/bomb')
  })
})

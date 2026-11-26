import http from 'node:http'
import { expect, test } from '@playwright/test'

/**
 * Real Next runtime check of apps/web/proxy.ts (Host/Origin guard) against the same `next dev`
 * server the browser smoke uses. Raw node:http so the Host header can be set exactly. Synthetic
 * and local only: every request goes to 127.0.0.1 on the smoke port, nothing leaves the machine.
 * The server is started with LEARNING_HUB_ALLOWED_HOSTS=lan-test.invalid (with-test-server.mjs).
 */
const PORT = Number(process.env.UI_SMOKE_PORT ?? 3100)

function send(opts: {
  method?: string
  path: string
  headers?: Record<string, string>
  body?: string
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method: opts.method ?? 'GET',
        path: opts.path,
        headers: { Host: `localhost:${PORT}`, ...opts.headers },
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

const json = { 'Content-Type': 'application/json' }

test('allowed Host serves /api normally', async () => {
  expect((await send({ path: '/api/focus/max' })).status).toBe(200)
  expect(
    (await send({ path: '/api/focus/max', headers: { Host: `127.0.0.1:${PORT}` } })).status,
  ).toBe(200)
})

test('a rebound or unknown Host is refused with 421', async () => {
  for (const host of [
    'evil.example',
    `evil.example:${PORT}`,
    'localhost.evil.example',
    '192.168.1.20',
  ]) {
    const r = await send({ path: '/api/focus/max', headers: { Host: host } })
    expect(r.status, host).toBe(421)
  }
})

test('a configured LAN/custom host is allowed', async () => {
  const r = await send({ path: '/api/focus/max', headers: { Host: `lan-test.invalid:${PORT}` } })
  expect(r.status).toBe(200)
})

test('X-Forwarded-Host spoofing is refused', async () => {
  const r = await send({ path: '/api/focus/max', headers: { 'X-Forwarded-Host': 'evil.example' } })
  expect(r.status).toBe(421)
})

test('a mutating request from a foreign origin is refused with 403', async () => {
  const body = JSON.stringify({ action: 'heartbeat' })
  const foreign = await send({
    method: 'POST',
    path: '/api/focus/bridge',
    headers: { ...json, Origin: 'https://evil.example' },
    body,
  })
  expect(foreign.status).toBe(403)
  const wrongPort = await send({
    method: 'POST',
    path: '/api/focus/bridge',
    headers: { ...json, Origin: `http://localhost:${PORT + 1}` },
    body,
  })
  expect(wrongPort.status).toBe(403)
  const same = await send({
    method: 'POST',
    path: '/api/focus/bridge',
    headers: { ...json, Origin: `http://localhost:${PORT}` },
    body,
  })
  expect(same.status).toBe(200)
})

test('the pairing-token route is refused cross-origin, including for extensions and odd spellings', async () => {
  for (const origin of ['https://evil.example', 'chrome-extension://abcdefghijklmnop', 'null']) {
    const r = await send({ path: '/api/focus/bridge', headers: { Origin: origin } })
    expect(r.status, origin).toBe(403)
    expect(r.body).not.toContain('pairingToken')
  }
  const fetchSite = await send({
    path: '/api/focus/bridge',
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  })
  expect(fetchSite.status).toBe(403)
  for (const p of ['/api/focus/%62ridge', '/api/focus/bridge/', '/api//focus/bridge']) {
    const r = await send({ path: p, headers: { Origin: 'https://evil.example' } })
    expect([403, 404, 308], p).toContain(r.status)
    expect(r.body).not.toContain('pairingToken')
  }
  const same = await send({
    path: '/api/focus/bridge',
    headers: { Origin: `http://localhost:${PORT}`, 'Sec-Fetch-Site': 'same-origin' },
  })
  expect(same.status).toBe(200)
})

test('an extension origin is accepted on a non-secret write (documented, not own-extension trust)', async () => {
  // Any chrome-extension:// origin passes the guard on non-secret routes unless
  // LEARNING_HUB_EXTENSION_IDS pins IDs. The handler's own validation answers (400 here), not the guard.
  const r = await send({
    method: 'POST',
    path: '/api/cards',
    headers: { ...json, Origin: 'chrome-extension://abcdefghijklmnop' },
    body: '{}',
  })
  expect([403, 421]).not.toContain(r.status)
  const foreign = await send({
    method: 'POST',
    path: '/api/cards',
    headers: { ...json, Origin: 'https://evil.example' },
    body: '{}',
  })
  expect(foreign.status).toBe(403)
})

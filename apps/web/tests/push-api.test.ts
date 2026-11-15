/**
 * Push API handler integration test (F-16)
 *
 * Verifies GET VAPID key availability, POST subscription registration,
 * and DELETE subscription unregistration.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-push-test-')), 'push.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  push: typeof import('../src/server/handlers/push/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const pushMod = await import('../src/server/handlers/push/route')
  M = { push: pushMod, db: dbMod }
})

describe('Push API Handler (/api/push)', () => {
  const sampleSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/sample_token_xyz',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ic0A',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  }

  it('GET /api/push returns VAPID configuration status', async () => {
    const res = await M.push.GET(new Request('http://localhost/api/push'))
    expect(res.status).toBe(200)

    const data = (await res.json()) as { ok: boolean; vapidPublicKey: string | null }
    expect(data.ok).toBe(true)
    expect('vapidPublicKey' in data).toBe(true)
  })

  it('POST /api/push saves a browser push subscription', async () => {
    const req = new Request('http://localhost/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleSubscription),
    })

    const res = await M.push.POST(req)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean }
    expect(data.ok).toBe(true)
  })

  it('rejects POST with invalid endpoint URL', async () => {
    const req = new Request('http://localhost/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'not-a-valid-url',
        keys: sampleSubscription.keys,
      }),
    })

    const res = await M.push.POST(req)
    expect(res.status).toBe(400)
  })

  it('DELETE /api/push deletes a subscription by endpoint', async () => {
    const req = new Request(
      `http://localhost/api/push?endpoint=${encodeURIComponent(sampleSubscription.endpoint)}`,
      {
        method: 'DELETE',
      },
    )

    const res = await M.push.DELETE(req)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; removed: boolean }
    expect(data.ok).toBe(true)
    expect(data.removed).toBe(true)
  })

  it('DELETE /api/push returns 400 when endpoint query is missing', async () => {
    const req = new Request('http://localhost/api/push', { method: 'DELETE' })
    const res = await M.push.DELETE(req)
    expect(res.status).toBe(400)
  })
})

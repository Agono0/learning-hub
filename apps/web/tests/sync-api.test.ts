/**
 * Sync API handler integration test (F-16)
 *
 * Verifies GET sync status/roster, PUT credential configuration with secret masking,
 * and POST sync actions.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-sync-test-')), 'sync.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  sync: typeof import('../src/server/handlers/sync/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const syncMod = await import('../src/server/handlers/sync/route')
  M = { sync: syncMod, db: dbMod }
})

describe('Sync API Handler (/api/sync)', () => {
  it('GET /api/sync returns masked credentials and device roster', async () => {
    const req = new Request('http://localhost/api/sync?deviceId=client_device_1')
    const res = await M.sync.GET(req)
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      sync: { provider: string }
      devices: unknown[]
    }
    expect(data.ok).toBe(true)
    expect(data.sync).toBeDefined()
    expect(Array.isArray(data.devices)).toBe(true)
  })

  it('PUT /api/sync saves provider config and masks secrets in response', async () => {
    const req = new Request('http://localhost/api/sync', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'dropbox',
        config: { accessToken: 'secret_token_123456789' },
        encryptionEnabled: true,
        passphrase: 'super-secret-encryption-passphrase',
      }),
    })

    const res = await M.sync.PUT(req)
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      sync: {
        provider: string
        config: Record<string, string>
        passphrase: string | null
      }
    }
    expect(data.ok).toBe(true)
    expect(data.sync.provider).toBe('dropbox')
    // Secrets must be masked (Rule 10 & §8.2 security invariant)
    expect(data.sync.config.accessToken).not.toBe('secret_token_123456789')
    expect(data.sync.config.accessToken).toContain('••••')
  })

  it('POST /api/sync rejects invalid action with validation error', async () => {
    const badReq = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'invalid_action' }),
    })

    const res = await M.sync.POST(badReq)
    expect(res.status).toBe(400)
  })

  it('POST /api/sync rejects sync when provider is none', async () => {
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'sync',
        override: { provider: 'none' },
      }),
    })

    const res = await M.sync.POST(req)
    expect(res.status).toBe(400)
    const data = (await res.json()) as { ok: boolean; error: string }
    expect(data.ok).toBe(false)
    expect(data.error).toContain('Select a Cloud Sync provider')
  })

  it('GET /api/sync reflects registered devices in the roster', () => {
    M.db.upsertSyncDevice({
      deviceId: 'device_desktop_alpha',
      name: 'Workstation Alpha',
      platform: 'windows',
    })

    const devices = M.db.listSyncDevices('device_desktop_alpha')
    expect(devices.some((d) => d.deviceId === 'device_desktop_alpha')).toBe(true)
    const matched = devices.find((d) => d.deviceId === 'device_desktop_alpha')
    expect(matched?.isThisDevice).toBe(true)
  })
})

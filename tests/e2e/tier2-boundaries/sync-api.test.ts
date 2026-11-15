import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import { recordDeletionTombstone, upsertSyncDevice, db, syncTombstones } from '@learning-hub/db'
import * as syncRoute from '../../../apps/web/app/api/sync/route'

describe('Tier 2 E2E: Cloud Sync API Surface & Multi-Device Convergence', () => {
  it('manages device roster and highlights local calling device', async () => {
    // 1. Register two simulated devices
    upsertSyncDevice({
      deviceId: 'device-desktop-alpha',
      name: 'Desktop Alpha Workstation',
      platform: 'windows',
    })

    upsertSyncDevice({
      deviceId: 'device-mobile-beta',
      name: 'Pixel Phone Beta',
      platform: 'android',
    })

    // 2. Query sync API from device Alpha's perspective
    const res = await callRoute<{
      ok: boolean
      sync: { provider: string }
      devices: Array<{ deviceId: string; name: string; isThisDevice: boolean }>
    }>(syncRoute.GET, {
      method: 'GET',
      query: { deviceId: 'device-desktop-alpha' },
    })

    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
    expect(Array.isArray(res.data.devices)).toBe(true)

    const alpha = res.data.devices.find((d) => d.deviceId === 'device-desktop-alpha')
    const beta = res.data.devices.find((d) => d.deviceId === 'device-mobile-beta')

    expect(alpha).toBeDefined()
    expect(alpha?.isThisDevice).toBe(true)
    expect(beta).toBeDefined()
    expect(beta?.isThisDevice).toBe(false)
  })

  it('updates provider credentials and strictly masks secrets in response', async () => {
    const putRes = await callRoute<{
      ok: boolean
      sync: { provider: string; config: Record<string, string>; passphrase: string | null }
    }>(syncRoute.PUT, {
      method: 'PUT',
      body: {
        provider: 'github',
        config: { token: 'ghp_super_secret_auth_token_99999' },
        encryptionEnabled: true,
        passphrase: 'super-secret-sync-passphrase',
      },
    })

    expect(putRes.status).toBe(200)
    expect(putRes.data.ok).toBe(true)
    expect(putRes.data.sync.provider).toBe('github')
    // Security invariant: secret token must never be echoed in plain text
    expect(putRes.data.sync.config.token).not.toBe('ghp_super_secret_auth_token_99999')
    expect(putRes.data.sync.config.token).toContain('••••')
  })

  it('records and queries deletion tombstones for multi-device sync', async () => {
    const deletedKey = 'deleted-course-or-deck-key'
    recordDeletionTombstone('decks', deletedKey)

    const tombstones = await db.select().from(syncTombstones)
    expect(tombstones.some((t) => t.tableName === 'decks' && t.recordKey === deletedKey)).toBe(true)
  })

  it('rejects sync trigger when provider is unconfigured or invalid', async () => {
    const badRes = await callRoute<{ ok: boolean; error: string }>(syncRoute.POST, {
      method: 'POST',
      body: {
        action: 'sync',
        override: { provider: 'none' },
      },
    })

    expect(badRes.status).toBe(400)
    expect(badRes.data.ok).toBe(false)
    expect(badRes.data.error).toContain('Select a Cloud Sync provider')
  })
})

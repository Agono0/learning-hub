import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  backupAll,
  createImage,
  deleteImage,
  deleteTombstone,
  getImage,
  getImageByFilename,
  getRawDb,
  getSyncConfig,
  images,
  initDb,
  listImages,
  listSyncDevices,
  listTombstones,
  recordTombstone,
  saveSyncConfig,
  setDb,
  syncConfigs,
  syncDevices,
  syncTombstones,
  touchSyncDevice,
  upsertSyncDevice,
  type LearningHubDB,
} from '../src/index'

let testDb: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-images-sync-'))
  testDb = await initDb({ path: join(tmp, 'images-sync.db') })
  setDb(testDb)
})

beforeEach(() => {
  testDb.delete(images).run()
  testDb.delete(syncDevices).run()
  testDb.delete(syncTombstones).run()
  testDb.delete(syncConfigs).run()
})

afterAll(() => {
  try {
    ;(testDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('images repository', () => {
  it('creates, retrieves, lists, and deletes images', () => {
    const created = createImage({
      filename: 'test-uuid-1.png',
      mime: 'image/png',
      data: 'aGVsbG8=',
      createdAt: '2026-11-09T01:00:00.000Z',
    })

    expect(created.id).toBeGreaterThan(0)
    expect(created.filename).toBe('test-uuid-1.png')
    expect(created.mime).toBe('image/png')
    expect(created.data).toBe('aGVsbG8=')

    const byId = getImage(created.id)
    expect(byId).not.toBeNull()
    expect(byId?.filename).toBe('test-uuid-1.png')

    const byFilename = getImageByFilename('test-uuid-1.png')
    expect(byFilename).not.toBeNull()
    expect(byFilename?.id).toBe(created.id)

    const nonexistent = getImage(99999)
    expect(nonexistent).toBeNull()

    const list = listImages({ limit: 10 })
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)

    const deleted = deleteImage(created.id)
    expect(deleted).toBe(true)
    expect(getImage(created.id)).toBeNull()
  })
})

describe('sync-meta repository', () => {
  it('reads and saves sync configuration with secret masking', () => {
    const initial = getSyncConfig()
    expect(initial.provider).toBe('none')
    expect(initial.encryptionEnabled).toBe(false)

    saveSyncConfig({
      provider: 'github',
      config: { token: 'ghp_secrettoken12345', gistId: 'gist999' },
      encryptionEnabled: true,
      passphrase: 'my-passphrase',
    })

    const masked = getSyncConfig({ maskSecrets: true })
    expect(masked.provider).toBe('github')
    expect(masked.encryptionEnabled).toBe(true)
    expect(masked.hasPassphrase).toBe(true)
    expect(masked.passphrase).toBeUndefined()
    expect(masked.config.gistId).toBe('gist999')
    expect(masked.config.token).toContain('••••')
    expect(masked.config.has_token).toBe('true')

    const unmasked = getSyncConfig({ maskSecrets: false })
    expect(unmasked.config.token).toBe('ghp_secrettoken12345')
    expect(unmasked.passphrase).toBe('my-passphrase')

    // Updating without re-sending the secret preserves the existing token
    saveSyncConfig({
      provider: 'github',
      config: { gistId: 'gist1000', token: '' },
    })
    const preserved = getSyncConfig({ maskSecrets: false })
    expect(preserved.config.gistId).toBe('gist1000')
    expect(preserved.config.token).toBe('ghp_secrettoken12345')
  })

  it('manages device roster with touch and list', () => {
    upsertSyncDevice({ deviceId: 'dev-1', name: 'Desktop PC', platform: 'windows' })
    upsertSyncDevice({ deviceId: 'dev-2', name: 'Mobile Phone', platform: 'android' })

    touchSyncDevice('dev-1', 'push', 'rev-100')
    touchSyncDevice('dev-2', 'pull', 'rev-99')

    const roster = listSyncDevices('dev-1')
    expect(roster).toHaveLength(2)
    const dev1 = roster.find((d) => d.deviceId === 'dev-1')
    const dev2 = roster.find((d) => d.deviceId === 'dev-2')

    expect(dev1?.name).toBe('Desktop PC')
    expect(dev1?.isThisDevice).toBe(true)
    expect(dev1?.lastPushAt).toBeTruthy()
    expect(dev1?.lastRevision).toBe('rev-100')

    expect(dev2?.name).toBe('Mobile Phone')
    expect(dev2?.isThisDevice).toBe(false)
    expect(dev2?.lastPullAt).toBeTruthy()
  })

  it('records, queries, and deletes tombstones', () => {
    recordTombstone('cards', 'card:uuid-100')
    recordTombstone('decks', 'deck:math-101')

    const all = listTombstones()
    expect(all).toHaveLength(2)

    const cardsOnly = listTombstones({ tableName: 'cards' })
    expect(cardsOnly).toHaveLength(1)
    expect(cardsOnly[0].recordKey).toBe('card:uuid-100')

    const deleted = deleteTombstone('cards', 'card:uuid-100')
    expect(deleted).toBe(true)

    expect(listTombstones({ tableName: 'cards' })).toHaveLength(0)
    expect(listTombstones({ tableName: 'decks' })).toHaveLength(1)
  })

  it('guarantees sync_configs is never exported into backupAll (Rule 10 & §8.2 security invariant)', () => {
    saveSyncConfig({
      provider: 'webdav',
      config: { password: 'secret-webdav-password' },
      encryptionEnabled: true,
      passphrase: 'super-secret-passphrase',
    })

    const backup = backupAll(getRawDb())
    // Whitelist check: sync_configs must be empty array or undefined
    expect(backup.tables['sync_configs']).toEqual([])
  })
})

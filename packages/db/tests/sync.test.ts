import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'
import { backupAll, restoreAll } from '../src/backup'
import { executeReview } from '../src/review-service'
import { getSyncConfig, mergeBackup, recordDeletionTombstone, saveSyncConfig } from '../src/sync'
import { executeCloudSync, type FetchLike } from '../src/cloud-sync'

function createDeviceDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema })
  return { sqlite, raw, db }
}

describe('Smart Merge, Secret Isolation & Free Cloud Sync', () => {
  it('strips device-local secrets on backupAll and preserves them on restoreAll & mergeBackup', async () => {
    const devA = createDeviceDb()
    devA.db
      .insert(schema.userSettings)
      .values({
        id: 'default',
        aiProvider: 'openai',
        aiApiKey: 'sk-super-secret-a',
        aiHeaders: '{"Authorization":"Bearer secret-hdr"}',
        sessionMinutes: 45,
        updatedAt: '2026-11-05T10:00:00.000Z',
      })
      .run()
    saveSyncConfig(
      {
        provider: 'github',
        config: { token: 'ghp_secret_sync_token', gistId: 'gist-123' },
        encryptionEnabled: true,
        passphrase: 'vault-passphrase-never-exported',
      },
      devA.raw,
    )

    const masked = getSyncConfig({ maskSecrets: true, database: devA.raw })
    expect(masked.config['token']).toContain('••••')
    expect(masked.hasPassphrase).toBe(true)
    expect(masked.passphrase).toBeUndefined()

    const snapshot = backupAll(devA.raw)
    expect(snapshot.tables['sync_configs']).toEqual([])
    const exportedSettings = snapshot.tables['user_settings']?.[0] as Record<string, unknown>
    expect(exportedSettings['ai_api_key']).toBeNull()
    expect(exportedSettings['ai_headers']).toBeNull()

    // Device B has its own local AI key & sync config; neither restoreAll nor mergeBackup may wipe them
    const devB = createDeviceDb()
    devB.db
      .insert(schema.userSettings)
      .values({
        id: 'default',
        aiProvider: 'anthropic',
        aiApiKey: 'sk-ant-local-device-b',
        aiHeaders: '{"x-local":"keep-me"}',
        sessionMinutes: 20,
        updatedAt: '2026-11-01T10:00:00.000Z',
      })
      .run()
    saveSyncConfig(
      {
        provider: 'dropbox',
        config: { accessToken: 'sl.device_b_token' },
      },
      devB.raw,
    )

    await mergeBackup(snapshot, devB.raw)
    const afterMergeSettings = devB.db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.id, 'default'))
      .get()
    expect(afterMergeSettings?.sessionMinutes).toBe(45) // LWW non-secret updated
    expect(afterMergeSettings?.aiApiKey).toBe('sk-ant-local-device-b') // local secret kept!
    expect(getSyncConfig({ maskSecrets: false, database: devB.raw }).config['accessToken']).toBe(
      'sl.device_b_token',
    )

    restoreAll(snapshot, devB.raw)
    const afterRestoreSettings = devB.db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.id, 'default'))
      .get()
    expect(afterRestoreSettings?.aiApiKey).toBe('sk-ant-local-device-b')
    expect(getSyncConfig({ maskSecrets: false, database: devB.raw }).config['accessToken']).toBe(
      'sl.device_b_token',
    )

    devA.sqlite.close()
    devB.sqlite.close()
  })

  it('remaps colliding offline autoincrement IDs across decks → cards → revlog with zero data loss', async () => {
    const desktop = createDeviceDb()
    const phone = createDeviceDb()

    // Desktop creates Deck #1 "Rust" + Card #1 + review
    desktop.db
      .insert(schema.decks)
      .values({ id: 1, name: 'Rust', createdAt: '2026-10-01T09:00:00.000Z' })
      .run()
    desktop.db
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'basic',
        content: { basic: { front: 'Ownership rule 1?', back: 'Each value has an owner' } },
        due: '2026-10-01T09:00:00.000Z',
        createdAt: '2026-10-01T09:00:00.000Z',
      })
      .run()
    await executeReview(
      { cardId: 1, grade: 3, confidence: 1, timeMs: 2500 },
      { db: desktop.db as never, now: new Date('2026-10-01T10:00:00.000Z') },
    )

    // Phone offline independently creates Deck #1 "Spanish" + Card #1 + review
    phone.db
      .insert(schema.decks)
      .values({ id: 1, name: 'Spanish', createdAt: '2026-10-01T11:00:00.000Z' })
      .run()
    phone.db
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'basic',
        content: { basic: { front: 'Hola', back: 'Hello' } },
        due: '2026-10-01T11:00:00.000Z',
        createdAt: '2026-10-01T11:00:00.000Z',
      })
      .run()
    await executeReview(
      { cardId: 1, grade: 4, confidence: 2, timeMs: 1800 },
      { db: phone.db as never, now: new Date('2026-10-01T12:00:00.000Z') },
    )

    const res = await mergeBackup(backupAll(phone.raw), desktop.raw)
    expect(res.inserted).toBeGreaterThanOrEqual(4) // deck + card + revlog + xp_event

    const allDecks = desktop.db.select().from(schema.decks).all()
    expect(allDecks.map((d) => d.name).sort()).toEqual(['Rust', 'Spanish'])

    const spanishDeck = allDecks.find((d) => d.name === 'Spanish')!
    expect(spanishDeck.id).toBe(2)

    const allCards = desktop.db.select().from(schema.cards).all()
    expect(allCards).toHaveLength(2)
    const spanishCard = allCards.find((c) => c.deckId === spanishDeck.id)!
    expect(spanishCard.id).toBe(2)

    const allRevlogs = desktop.db.select().from(schema.revlog).all()
    expect(allRevlogs).toHaveLength(2)
    expect(allRevlogs.map((r) => r.cardId).sort()).toEqual([1, 2])

    // Idempotency: merging the same snapshot a second time inserts 0 duplicates
    const second = await mergeBackup(backupAll(phone.raw), desktop.raw)
    expect(second.inserted).toBe(0)
    expect(desktop.db.select().from(schema.revlog).all()).toHaveLength(2)

    desktop.sqlite.close()
    phone.sqlite.close()
  })

  it('unions concurrent offline reviews on the SAME card and replays FSRS-6 history', async () => {
    const devA = createDeviceDb()
    const devB = createDeviceDb()

    // Seed shared deck + card on Device A, clone onto Device B
    devA.db
      .insert(schema.decks)
      .values({ id: 1, name: 'Shared Deck', createdAt: '2026-10-01T00:00:00.000Z' })
      .run()
    devA.db
      .insert(schema.cards)
      .values({
        id: 10,
        deckId: 1,
        type: 'basic',
        content: { basic: { front: 'Spaced repetition?', back: 'FSRS-6' } },
        due: '2026-10-01T00:00:00.000Z',
        createdAt: '2026-10-01T00:00:00.000Z',
      })
      .run()
    restoreAll(backupAll(devA.raw), devB.raw)

    // Device A reviews at Day 1; Device B reviews offline at Day 3
    await executeReview(
      { cardId: 10, grade: 3, confidence: 1, timeMs: 2000 },
      { db: devA.db as never, now: new Date('2026-10-02T10:00:00.000Z') },
    )
    await executeReview(
      { cardId: 10, grade: 4, confidence: 2, timeMs: 1900 },
      { db: devB.db as never, now: new Date('2026-10-05T10:00:00.000Z') },
    )

    const merged = await mergeBackup(backupAll(devB.raw), devA.raw)
    expect(merged.rescheduledCards).toBe(1)

    const logs = devA.db.select().from(schema.revlog).all()
    expect(logs).toHaveLength(2)

    const card = devA.db.select().from(schema.cards).where(eq(schema.cards.id, 10)).get()!
    expect(card.reps).toBe(2)
    expect(card.lastReview).toBe('2026-10-05T10:00:00.000Z')
    expect(card.stability).toBeGreaterThan(0)

    devA.sqlite.close()
    devB.sqlite.close()
  })

  it('respects deletion tombstones across devices so deleted items do not resurrect', async () => {
    const devA = createDeviceDb()
    const devB = createDeviceDb()

    devA.db
      .insert(schema.notes)
      .values({
        id: 1,
        title: 'Obsolete Draft',
        content: 'Delete me',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      })
      .run()
    restoreAll(backupAll(devA.raw), devB.raw)

    // Device A deletes the note and records a tombstone
    devA.db.delete(schema.notes).where(eq(schema.notes.id, 1)).run()
    recordDeletionTombstone('notes', 'title:Obsolete Draft', devA.raw)

    // Merging stale Device B into Device A does NOT resurrect the deleted note
    await mergeBackup(backupAll(devB.raw), devA.raw)
    expect(devA.db.select().from(schema.notes).all()).toHaveLength(0)

    // Merging Device A (with tombstone) into Device B prunes the deleted note on B
    const bMerge = await mergeBackup(backupAll(devA.raw), devB.raw)
    expect(bMerge.tombstoned).toBeGreaterThanOrEqual(1)
    expect(devB.db.select().from(schema.notes).all()).toHaveLength(0)

    devA.sqlite.close()
    devB.sqlite.close()
  })

  it('executes E2EE bidirectional cloud sync across GitHub Gist, Dropbox, GDrive, and WebDAV', async () => {
    // In-memory mock cloud storage supporting all 4 provider HTTP contracts
    const cloudStore = new Map<string, string>()

    const mockFetch: FetchLike = async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init?.method ?? 'GET').toUpperCase()
      const headers = new Headers(init?.headers)

      // 1. GitHub Gist API
      if (url === 'https://api.github.com/gists' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as {
          files: Record<string, { content: string }>
        }
        const content = Object.values(body.files)[0]!.content
        cloudStore.set('gist:g-auto-1', content)
        return Response.json({ id: 'g-auto-1', updated_at: '2026-11-05T12:00:00Z' })
      }
      if (url.startsWith('https://api.github.com/gists/g-auto-1')) {
        if (method === 'PATCH') {
          const body = JSON.parse(String(init?.body)) as {
            files: Record<string, { content: string }>
          }
          cloudStore.set('gist:g-auto-1', Object.values(body.files)[0]!.content)
          return Response.json({ id: 'g-auto-1', updated_at: '2026-11-05T12:05:00Z' })
        }
        const stored = cloudStore.get('gist:g-auto-1')
        if (!stored) return new Response('Not Found', { status: 404 })
        return Response.json({
          id: 'g-auto-1',
          updated_at: '2026-11-05T12:05:00Z',
          files: { 'learning-hub-sync.json': { content: stored, truncated: false } },
        })
      }
      if (url === 'https://api.github.com/user') {
        return Response.json({ login: 'learner' })
      }

      // 2. Dropbox API
      if (url === 'https://content.dropboxapi.com/2/files/download') {
        const stored = cloudStore.get('dropbox:/learning-hub-sync.json')
        if (!stored) return new Response('{"error_summary":"path/not_found/.."}', { status: 409 })
        return new Response(stored, {
          status: 200,
          headers: { 'dropbox-api-result': JSON.stringify({ rev: 'dbx-rev-1' }) },
        })
      }
      if (url === 'https://content.dropboxapi.com/2/files/upload') {
        cloudStore.set('dropbox:/learning-hub-sync.json', String(init?.body))
        return Response.json({ rev: 'dbx-rev-2' })
      }

      // 3. Google Drive API
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?spaces=')) {
        const has = cloudStore.has('gdrive:file-1')
        return Response.json({
          files: has ? [{ id: 'file-1', modifiedTime: '2026-11-05T12:00:00Z' }] : [],
        })
      }
      if (url === 'https://www.googleapis.com/drive/v3/files?fields=id' && method === 'POST') {
        return Response.json({ id: 'file-1' })
      }
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files/file-1')) {
        cloudStore.set('gdrive:file-1', String(init?.body))
        return Response.json({ id: 'file-1', modifiedTime: '2026-11-05T12:10:00Z' })
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/file-1?fields=')) {
        return Response.json({ id: 'file-1', modifiedTime: '2026-11-05T12:10:00Z', trashed: false })
      }
      if (url === 'https://www.googleapis.com/drive/v3/files/file-1?alt=media') {
        const stored = cloudStore.get('gdrive:file-1')
        return stored ? new Response(stored, { status: 200 }) : new Response('', { status: 404 })
      }

      // 4. WebDAV
      if (url === 'https://dav.example.com/sync.json') {
        expect(headers.get('authorization')).toMatch(/^Basic /)
        if (method === 'PUT') {
          cloudStore.set('webdav', String(init?.body))
          return new Response('', { status: 201, headers: { etag: '"dav-1"' } })
        }
        const stored = cloudStore.get('webdav')
        return stored
          ? new Response(stored, { status: 200, headers: { etag: '"dav-1"' } })
          : new Response('', { status: 404 })
      }

      throw new Error(`Unexpected URL in mockFetch: ${method} ${url}`)
    }

    // Test GitHub Secret Gist + E2EE between Device A and Device B
    const devA = createDeviceDb()
    devA.db
      .insert(schema.decks)
      .values({ id: 1, name: 'Encrypted GitHub Deck', createdAt: '2026-11-05T09:00:00.000Z' })
      .run()
    saveSyncConfig(
      {
        provider: 'github',
        config: { token: 'ghp_valid', target: 'gist' },
        encryptionEnabled: true,
        passphrase: 'shared-e2ee-passphrase',
      },
      devA.raw,
    )

    const pushA = await executeCloudSync({
      action: 'sync',
      database: devA.raw,
      fetchFn: mockFetch,
      pbkdf2Iterations: 10_000,
    })
    expect(pushA.pushed).toBe(true)
    expect(pushA.encrypted).toBe(true)
    // Auto-created gistId persisted locally!
    const createdGistId = getSyncConfig({ database: devA.raw }).config['gistId']
    expect(createdGistId).toBe('g-auto-1')
    // Remote blob is encrypted ciphertext, NOT plaintext!
    expect(cloudStore.get('gist:g-auto-1')).not.toContain('Encrypted GitHub Deck')
    expect(cloudStore.get('gist:g-auto-1')).toContain('"cipher":"AES-256-GCM"')

    const devB = createDeviceDb()
    saveSyncConfig(
      {
        provider: 'github',
        config: { token: 'ghp_valid', target: 'gist', gistId: 'g-auto-1' },
        encryptionEnabled: true,
        passphrase: 'shared-e2ee-passphrase',
      },
      devB.raw,
    )
    const pullB = await executeCloudSync({
      action: 'pull',
      database: devB.raw,
      fetchFn: mockFetch,
      pbkdf2Iterations: 10_000,
    })
    expect(pullB.pulled).toBe(true)
    expect(
      devB.db
        .select()
        .from(schema.decks)
        .all()
        .map((d) => d.name),
    ).toEqual(['Encrypted GitHub Deck'])

    // Quick smoke of Dropbox, Google Drive, and WebDAV round-trips
    for (const [provider, cfg] of [
      ['dropbox', { accessToken: 'sl.test', path: '/learning-hub-sync.json' }],
      ['gdrive', { accessToken: 'ya29.test', space: 'appDataFolder' }],
      ['webdav', { url: 'https://dav.example.com/sync.json', username: 'u', password: 'p' }],
    ] as const) {
      saveSyncConfig({ provider, config: cfg, encryptionEnabled: false }, devA.raw)
      const syncRes = await executeCloudSync({
        action: 'sync',
        database: devA.raw,
        fetchFn: mockFetch,
      })
      expect(syncRes.pushed).toBe(true)

      const target = createDeviceDb()
      saveSyncConfig({ provider, config: cfg, encryptionEnabled: false }, target.raw)
      const pulled = await executeCloudSync({
        action: 'pull',
        database: target.raw,
        fetchFn: mockFetch,
      })
      expect(pulled.pulled).toBe(true)
      expect(target.db.select().from(schema.decks).all()).toHaveLength(1)
      target.sqlite.close()
    }

    devA.sqlite.close()
    devB.sqlite.close()
  })
})

/**
 * Backup API handler integration test (F-16)
 *
 * Verifies whole-database backup download (GET), destructive restore (POST ?mode=replace),
 * non-destructive Smart Merge (POST ?mode=merge), and round-trip restore fidelity.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-backup-test-')), 'backup.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  backup: typeof import('../src/server/handlers/backup/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const backupMod = await import('../src/server/handlers/backup/route')
  M = { backup: backupMod, db: dbMod }

  // Seed sample deck and cards
  const [deck] = M.db.db
    .insert(M.db.decks)
    .values({ name: 'Backup Test Deck', description: 'Sample deck for backup testing' })
    .returning()
    .all()

  M.db.db
    .insert(M.db.cards)
    .values({
      deckId: deck!.id,
      type: 'basic',
      content: { basic: { front: 'Backup Q1', back: 'Backup A1' } },
      due: new Date().toISOString(),
    })
    .run()
})

describe('Backup API Handler (/api/backup)', () => {
  it('GET /api/backup exports a complete sanitized backup envelope', async () => {
    const res = await M.backup.GET(new Request('http://localhost/api/backup'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('content-disposition')).toContain('attachment')

    const data = (await res.json()) as {
      version: number
      createdAt: string
      tables: Record<string, unknown[]>
    }
    expect(data.version).toBeDefined()
    expect(data.tables).toBeDefined()
    expect(Array.isArray(data.tables.decks)).toBe(true)
    expect(Array.isArray(data.tables.cards)).toBe(true)
    expect(
      data.tables.decks.some(
        (d) =>
          typeof d === 'object' &&
          d !== null &&
          (d as Record<string, unknown>).name === 'Backup Test Deck',
      ),
    ).toBe(true)
  })

  it('POST /api/backup?mode=replace restores the database envelope atomically', async () => {
    // 1. Export current backup
    const exportRes = await M.backup.GET(new Request('http://localhost/api/backup'))
    const backupData = await exportRes.json()

    // 2. Add an extra deck that should be removed by replace
    M.db.db.insert(M.db.decks).values({ name: 'Temporary Deck To Be Replaced' }).run()
    expect(
      M.db.db
        .select()
        .from(M.db.decks)
        .all()
        .some((d) => d.name === 'Temporary Deck To Be Replaced'),
    ).toBe(true)

    // 3. Restore with mode=replace
    const req = new Request('http://localhost/api/backup?mode=replace', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(backupData),
    })

    const restoreRes = await M.backup.POST(req)
    expect(restoreRes.status).toBe(200)
    const result = (await restoreRes.json()) as { ok: boolean; mode: string }
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('replace')

    // 4. Verify temporary deck is gone, original deck is intact
    const currentDecks = M.db.db.select().from(M.db.decks).all()
    expect(currentDecks.some((d) => d.name === 'Temporary Deck To Be Replaced')).toBe(false)
    expect(currentDecks.some((d) => d.name === 'Backup Test Deck')).toBe(true)
  })

  it('POST /api/backup?mode=merge runs non-destructive Smart Merge', async () => {
    // 1. Export current state
    const exportRes = await M.backup.GET(new Request('http://localhost/api/backup'))
    const backupData = (await exportRes.json()) as {
      version: number
      createdAt: string
      tables: Record<string, Record<string, unknown>[]>
    }

    // 2. Add a new deck to backup payload
    const mergedBackup = {
      ...backupData,
      tables: {
        ...backupData.tables,
        decks: [
          ...backupData.tables.decks,
          {
            id: 9999,
            name: 'Smart Merged Deck',
            description: 'Imported via merge',
            delayed_feedback: 0,
            created_at: new Date().toISOString(),
          },
        ],
      },
    }

    const req = new Request('http://localhost/api/backup?mode=merge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mergedBackup),
    })

    const mergeRes = await M.backup.POST(req)
    expect(mergeRes.status).toBe(200)
    const result = (await mergeRes.json()) as { ok: boolean; mode: string }
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('merge')

    // Both original and merged deck should exist
    const currentDecks = M.db.db.select().from(M.db.decks).all()
    expect(currentDecks.some((d) => d.name === 'Backup Test Deck')).toBe(true)
    expect(currentDecks.some((d) => d.name === 'Smart Merged Deck')).toBe(true)
  })

  it('rejects corrupt or non-object payloads with an error', async () => {
    const req = new Request('http://localhost/api/backup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify('not-a-valid-backup-envelope'),
    })

    const res = await M.backup.POST(req)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

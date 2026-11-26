import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'
import { backupAll } from '../src/backup'
import { mergeBackup } from '../src/sync'

function createDeviceDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  return { sqlite, raw, db: drizzle(sqlite, { schema }) }
}
type Dev = ReturnType<typeof createDeviceDb>

const counts = (d: Dev) => ({
  audits: d.db.select().from(schema.rifAudits).all().length,
  dismissals: d.db.select().from(schema.rifDismissals).all().length,
})

function seed(d: Dev, cardId: number, auditAt: string) {
  d.db.insert(schema.decks).values({ id: 1, name: 'Fruit' }).run()
  d.db
    .insert(schema.cards)
    .values({
      id: cardId,
      deckId: 1,
      type: 'basic',
      content: { basic: { front: 'Fruit that is red', back: 'apple' } },
      due: '2026-11-21T00:00:00.000Z',
    })
    .run()
  d.db.insert(schema.rifDismissals).values({ cardId, reason: 'deliberate' }).run()
  d.db
    .insert(schema.rifAudits)
    .values({
      windowDays: 21,
      scanned: 3,
      clustered: 3,
      atRisk: 1,
      watch: 0,
      meanRisk: 0.3,
      createdAt: auditAt,
    })
    .run()
}

describe('retrieval forgetting sync', () => {
  it('merging the same snapshot twice adds nothing', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, '2026-11-20T10:00:00.000Z')
    const snap = backupAll(a.raw)
    await mergeBackup(snap, b.raw)
    const first = counts(b)
    expect(first).toEqual({ audits: 1, dismissals: 1 })
    await mergeBackup(snap, b.raw)
    expect(counts(b)).toEqual(first)
  })
  it('unions audit history from two devices', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, '2026-11-20T10:00:00.000Z')
    seed(b, 1, '2026-11-21T10:00:00.000Z')
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(counts(b).audits).toBe(2)
    expect(counts(b).dismissals).toBe(1)
  })
  it('a restore on one device beats the older dismissal on another and survives re-merging', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, '2026-11-20T10:00:00.000Z')
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(b.db.select().from(schema.rifDismissals).get()?.active).toBe(true)
    // device A restores later
    a.db
      .update(schema.rifDismissals)
      .set({ active: false, updatedAt: '2099-01-01T00:00:00.000Z' })
      .run()
    const snap = backupAll(a.raw)
    await mergeBackup(snap, b.raw)
    expect(b.db.select().from(schema.rifDismissals).get()?.active).toBe(false)
    await mergeBackup(snap, b.raw)
    expect(counts(b).dismissals).toBe(1)
    // the old dismissal coming back from a stale snapshot does not undo it
    const stale = createDeviceDb()
    seed(stale, 1, '2026-11-19T10:00:00.000Z')
    await mergeBackup(backupAll(stale.raw), b.raw)
    expect(b.db.select().from(schema.rifDismissals).get()?.active).toBe(false)
  })
  it('remaps rif_audits.deck_id onto the local deck with the same name', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    a.db.insert(schema.decks).values({ id: 1, name: 'Fruit' }).run()
    a.db
      .insert(schema.rifAudits)
      .values({
        deckId: 1,
        windowDays: 21,
        scanned: 1,
        clustered: 0,
        atRisk: 0,
        watch: 0,
        meanRisk: 0,
        createdAt: '2026-11-20T10:00:00.000Z',
      })
      .run()
    b.db.insert(schema.decks).values({ id: 1, name: 'Other' }).run()
    b.db.insert(schema.decks).values({ id: 5, name: 'Fruit' }).run()
    await mergeBackup(backupAll(a.raw), b.raw)
    const row = b.db.select().from(schema.rifAudits).get()!
    expect(row.deckId).toBe(5)
  })
})

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
  pairs: d.db.select().from(schema.interferencePairs).all().length,
  drills: d.db.select().from(schema.interferenceDrills).all().length,
})

/** Two lookalike cards. `firstId` shifts ids so two devices disagree about them. */
function seed(d: Dev, firstId: number, status: 'confirmed' | 'dismissed' | 'cleared', at: string) {
  if (!d.db.select().from(schema.decks).all().length)
    d.db.insert(schema.decks).values({ id: 1, name: 'Bio' }).run()
  const mk = (id: number, front: string, back: string) =>
    d.db
      .insert(schema.cards)
      .values({
        id,
        deckId: 1,
        type: 'basic',
        content: { basic: { front, back } },
        due: '2026-11-21T00:00:00.000Z',
      })
      .run()
  mk(firstId, 'Enzyme that unwinds DNA', 'Helicase')
  mk(firstId + 1, 'Enzyme that unwinds RNA', 'Topoisomerase')
  d.db
    .insert(schema.interferencePairs)
    .values({ cardAId: firstId, cardBId: firstId + 1, status, createdAt: at, updatedAt: at })
    .run()
  d.db
    .insert(schema.interferenceDrills)
    .values({
      cardAId: firstId,
      cardBId: firstId + 1,
      day: '2026-11-20',
      correct: 3,
      total: 4,
      createdAt: at,
      updatedAt: at,
    })
    .run()
}

describe('interference sync', () => {
  it('merging the same snapshot twice adds nothing', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, 'confirmed', '2026-11-20T10:00:00.000Z')
    const snap = backupAll(a.raw)
    await mergeBackup(snap, b.raw)
    const first = counts(b)
    expect(first).toEqual({ pairs: 1, drills: 1 })
    await mergeBackup(snap, b.raw)
    expect(counts(b)).toEqual(first)
  })
  it('the same pair on two devices with different card ids is one row, pointing at local cards', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, 'confirmed', '2026-11-20T10:00:00.000Z')
    seed(b, 10, 'confirmed', '2026-11-20T11:00:00.000Z')
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(counts(b)).toEqual({ pairs: 1, drills: 1 })
    const row = b.db.select().from(schema.interferencePairs).get()!
    expect([row.cardAId, row.cardBId]).toEqual([10, 11])
  })
  it('a clear on one device beats the older confirmation and survives re-merging', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, 'confirmed', '2026-11-20T10:00:00.000Z')
    await mergeBackup(backupAll(a.raw), b.raw)
    a.db
      .update(schema.interferencePairs)
      .set({ status: 'cleared', updatedAt: '2099-01-01T00:00:00.000Z' })
      .run()
    const snap = backupAll(a.raw)
    await mergeBackup(snap, b.raw)
    expect(b.db.select().from(schema.interferencePairs).get()!.status).toBe('cleared')
    await mergeBackup(snap, b.raw)
    expect(counts(b).pairs).toBe(1)
    const stale = createDeviceDb()
    seed(stale, 1, 'confirmed', '2026-11-19T10:00:00.000Z')
    await mergeBackup(backupAll(stale.raw), b.raw)
    expect(b.db.select().from(schema.interferencePairs).get()!.status).toBe('cleared')
  })
  it('drill tallies for different days are kept as separate rows', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, 'confirmed', '2026-11-20T10:00:00.000Z')
    seed(b, 1, 'confirmed', '2026-11-20T10:30:00.000Z')
    b.db.update(schema.interferenceDrills).set({ day: '2026-11-21' }).run()
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(counts(b).drills).toBe(2)
  })
})

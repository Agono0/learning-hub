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
})

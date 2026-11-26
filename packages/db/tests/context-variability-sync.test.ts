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
  sessions: d.db.select().from(schema.contextSessions).all().length,
  goals: d.db.select().from(schema.contextGoals).all().length,
})

function seed(d: Dev, id: number, updatedAt: string, endedAt: string | null) {
  d.db
    .insert(schema.contextSessions)
    .values({
      id,
      startedAt: '2026-11-20T09:00:00.000Z',
      endedAt,
      place: 'library',
      createdAt: updatedAt,
      updatedAt,
    })
    .run()
  d.db
    .insert(schema.contextGoals)
    .values({
      id,
      label: 'Exam',
      place: 'exam hall',
      startHour: 9,
      endHour: 12,
      createdAt: updatedAt,
      updatedAt,
    })
    .run()
}

describe('context variability sync', () => {
  it('merging the same snapshot twice adds nothing', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, '2026-11-20T10:00:00.000Z', '2026-11-20T10:00:00.000Z')
    const snap = backupAll(a.raw)
    await mergeBackup(snap, b.raw)
    const first = counts(b)
    expect(first).toEqual({ sessions: 1, goals: 1 })
    await mergeBackup(snap, b.raw)
    expect(counts(b)).toEqual(first)
  })
  it('the same session made on two devices dedupes, and the newer write wins', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, '2026-11-20T10:00:00.000Z', null)
    seed(b, 7, '2026-11-20T11:00:00.000Z', '2026-11-20T11:00:00.000Z')
    await mergeBackup(backupAll(b.raw), a.raw)
    expect(counts(a)).toEqual({ sessions: 1, goals: 1 })
    expect(a.db.select().from(schema.contextSessions).get()!.endedAt).toBe(
      '2026-11-20T11:00:00.000Z',
    )
    // an older snapshot does not undo it
    const older = createDeviceDb()
    seed(older, 1, '2026-11-20T09:30:00.000Z', null)
    await mergeBackup(backupAll(older.raw), a.raw)
    expect(a.db.select().from(schema.contextSessions).get()!.endedAt).toBe(
      '2026-11-20T11:00:00.000Z',
    )
  })
  it('an archived goal stays archived after merging an older active copy', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, '2026-11-20T10:00:00.000Z', null)
    seed(b, 1, '2026-11-20T10:00:00.000Z', null)
    a.db
      .update(schema.contextGoals)
      .set({ archivedAt: '2026-11-21T00:00:00.000Z', updatedAt: '2026-11-21T00:00:00.000Z' })
      .run()
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(b.db.select().from(schema.contextGoals).get()!.archivedAt).toBe(
      '2026-11-21T00:00:00.000Z',
    )
    await mergeBackup(backupAll(b.raw), a.raw)
    expect(counts(a).goals).toBe(1)
    expect(a.db.select().from(schema.contextGoals).get()!.archivedAt).not.toBeNull()
  })
})

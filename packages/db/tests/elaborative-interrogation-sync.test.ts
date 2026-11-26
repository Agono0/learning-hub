import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
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

const STATEMENT =
  'Spaced practice improves retention because each retrieval strengthens the memory trace.'
const counts = (d: ReturnType<typeof createDeviceDb>) => ({
  facts: d.db.select().from(schema.eiFacts).all().length,
  states: d.db.select().from(schema.eiFactStates).all().length,
  attempts: d.db.select().from(schema.eiAttempts).all().length,
})

function seed(
  d: ReturnType<typeof createDeviceDb>,
  factId: number,
  opts: { updatedAt: string; level: number; attemptAt: string },
) {
  d.db
    .insert(schema.eiFacts)
    .values({
      id: factId,
      statement: STATEMENT,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    })
    .run()
  d.db
    .insert(schema.eiFactStates)
    .values({
      factId,
      level: opts.level,
      attempts: 1,
      bestScore: 70,
      lastScore: 70,
      dueDay: 20000,
      updatedAt: opts.updatedAt,
    })
    .run()
  d.db
    .insert(schema.eiAttempts)
    .values({
      factId,
      style: 'why-true',
      answer: 'a',
      score: 70,
      band: 'solid',
      fsrsRating: 3,
      createdAt: opts.attemptAt,
    })
    .run()
}

describe('elaborative interrogation sync', () => {
  it('merging the same snapshot twice adds nothing the second time', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, {
      updatedAt: '2026-11-02T00:00:00.000Z',
      level: 2,
      attemptAt: '2026-11-02T00:00:00.000Z',
    })
    const snap = backupAll(a.raw)
    await mergeBackup(snap, b.raw)
    const first = counts(b)
    expect(first).toEqual({ facts: 1, states: 1, attempts: 1 })
    await mergeBackup(snap, b.raw)
    expect(counts(b)).toEqual(first)
  })

  it('dedupes the same fact created independently on two devices and unions attempts', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, {
      updatedAt: '2026-11-02T00:00:00.000Z',
      level: 2,
      attemptAt: '2026-11-02T00:00:00.000Z',
    })
    seed(b, 7, {
      updatedAt: '2026-11-03T00:00:00.000Z',
      level: 3,
      attemptAt: '2026-11-03T00:00:00.000Z',
    })
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(counts(b)).toEqual({ facts: 1, states: 1, attempts: 2 })
    await mergeBackup(backupAll(b.raw), a.raw)
    expect(counts(a)).toEqual({ facts: 1, states: 1, attempts: 2 })
  })

  it('newer remote state wins, older remote state does not overwrite', async () => {
    const a = createDeviceDb()
    const b = createDeviceDb()
    seed(a, 1, {
      updatedAt: '2026-11-05T00:00:00.000Z',
      level: 4,
      attemptAt: '2026-11-05T00:00:00.000Z',
    })
    seed(b, 1, {
      updatedAt: '2026-11-02T00:00:00.000Z',
      level: 1,
      attemptAt: '2026-11-02T00:00:00.000Z',
    })
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(
      b.db.select().from(schema.eiFactStates).where(eq(schema.eiFactStates.factId, 1)).get()?.level,
    ).toBe(4)
    await mergeBackup(backupAll(createOlder(a)), b.raw)
    expect(b.db.select().from(schema.eiFactStates).get()?.level).toBe(4)
  })
})

/** A snapshot source whose state is older than the one already merged. */
function createOlder(_a: ReturnType<typeof createDeviceDb>) {
  const old = createDeviceDb()
  seed(old, 1, {
    updatedAt: '2026-11-01T12:00:00.000Z',
    level: 1,
    attemptAt: '2026-11-01T12:00:00.000Z',
  })
  return old.raw
}

/**
 * Whole-DB backup/restore tests: backupAll envelope shape, restore round-trip
 * (row-for-row equality incl. append-only ids), zod validation and atomicity
 * (a restore that violates FKs must leave the database untouched).
 *
 * Uses throwaway :memory: databases built from the real schema DDL — the app
 * database itself is never opened for writing.
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { getRawDb } from '../src/index'
import { backupAll, restoreAll, BACKUP_VERSION, type BackupFile } from '../src/backup'
import { ValidationError } from '../src/review-service'

/** Fresh schema-complete :memory: database (DDL copied from the app DB). */
function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  // Regular tables only — FTS5 shadow tables are created by the 003 migration
  // (their internal _data/_idx/_content tables are reserved names that cannot
  // be cloned here; the source-table triggers rebuild them from the restored
  // rows).
  const ddls = getRawDb()
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%' AND sql IS NOT NULL",
    )
    .all() as { sql: string }[]
  for (const { sql } of ddls) sqlite.exec(sql)
  return sqlite
}

const TABLES = (db: Database.Database): string[] =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((r) => r.name)

/** Seed a representative slice: content tables, FK chain, append-only events. */
function seed(db: Database.Database): void {
  db.prepare(
    "INSERT INTO user_settings (id, theme, desired_retention, updated_at) VALUES ('default', 'dark', 0.9, '2026-01-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO decks (id, name, description, created_at) VALUES (1, 'Backup Deck', 'seeded', '2026-01-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO cards (id, deck_id, type, content, tags, due, created_at) VALUES (1, 1, 'basic', ?, ?, '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
  ).run(JSON.stringify({ basic: { front: 'Q1', back: 'A1' } }), JSON.stringify(['geo']))
  db.prepare(
    "INSERT INTO cards (id, deck_id, type, content, tags, due, created_at) VALUES (2, 1, 'cloze', ?, '[]', '2026-01-03T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
  ).run(
    JSON.stringify({ cloze: { text: 'The {{c1::sun}} is hot.', answers: ['sun'], mode: 'basic' } }),
  )
  // append-only events with meaningful ids
  db.prepare(
    "INSERT INTO revlog (id, card_id, rating, state, elapsed_days, scheduled_days, time_ms, confidence, reviewed_at) VALUES (1700000000001, 1, 3, 2, 1, 3, 4200, 1, '2026-01-02T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO xp_events (id, source, amount, created_at) VALUES (101, 'review', 10, '2026-01-02T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO elo_events (id, skill_id, rating_before, rating_after, outcome, created_at) VALUES (7, NULL, 1000, 1016, 1.0, '2026-01-02T00:00:00.000Z')",
  ).run()
  // FK chain track → course → unit → lesson, and habit_logs (FK without cascade)
  db.prepare(
    "INSERT INTO tracks (id, title, created_at) VALUES (1, 'Math', '2026-01-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO courses (id, track_id, title, created_at) VALUES (1, 1, 'Algebra', '2026-01-01T00:00:00.000Z')",
  ).run()
  db.prepare("INSERT INTO units (id, course_id, title) VALUES (1, 1, 'Linear equations')").run()
  db.prepare(
    "INSERT INTO lessons (id, unit_id, title, type, created_at) VALUES (1, 1, 'Solve for x', 'concept', '2026-01-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO habits (id, name, created_at) VALUES (1, 'Read 20 pages', '2026-01-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO habit_logs (id, habit_id, date, created_at) VALUES (1, 1, '2026-01-02', '2026-01-02T00:00:00.000Z')",
  ).run()
}

/** Snapshot every table as raw rows (independent of backupAll for comparison). */
function rawSnapshot(db: Database.Database): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {}
  for (const name of TABLES(db)) {
    out[name] = db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[]
  }
  return out
}

describe('backupAll', () => {
  it('produces the {version, exportedAt, tables} envelope covering every table', () => {
    const db = createTestDb()
    seed(db)
    const backup = backupAll(db)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(new Date(backup.exportedAt).toString()).not.toBe('Invalid Date')
    expect(Object.keys(backup.tables).sort()).toEqual(TABLES(db).sort())
    expect(backup.tables['decks']).toHaveLength(1)
    expect(backup.tables['cards']).toHaveLength(2)
    // JSON columns come back as their stored TEXT — lossless for reinsertion
    expect(backup.tables['cards']![0]).toMatchObject({ id: 1, deck_id: 1, type: 'basic' })
    expect(backup.tables['cards']![0]!['content']).toBe(
      JSON.stringify({ basic: { front: 'Q1', back: 'A1' } }),
    )
    db.close()
  })

  it('works on an empty database (all tables present, all empty)', () => {
    const db = createTestDb()
    const backup = backupAll(db)
    expect(Object.keys(backup.tables).sort()).toEqual(TABLES(db).sort())
    expect(Object.values(backup.tables).every((rows) => rows.length === 0)).toBe(true)
    db.close()
  })
})

describe('restoreAll (round-trip)', () => {
  it('restores row-for-row into an empty database, preserving ids of append-only tables', () => {
    const source = createTestDb()
    seed(source)
    const backup: BackupFile = backupAll(source)

    const target = createTestDb()
    const result = restoreAll(backup, target)
    expect(result.tables).toBe(Object.keys(backup.tables).length)
    expect(result.rows).toBe(Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0))

    // every table matches the source byte-for-byte
    const expected = rawSnapshot(source)
    expect(rawSnapshot(target)).toEqual(expected)

    // append-only ids preserved explicitly
    const revlogIds = (
      target.prepare('SELECT id FROM revlog ORDER BY id').all() as { id: number }[]
    ).map((r) => r.id)
    expect(revlogIds).toEqual([1700000000001])
    expect((target.prepare('SELECT id FROM xp_events').get() as { id: number }).id).toBe(101)
    expect((target.prepare('SELECT id FROM elo_events').get() as { id: number }).id).toBe(7)
    // AUTOINCREMENT counters continue after the restored max(id)
    target
      .prepare(
        "INSERT INTO xp_events (source, amount, created_at) VALUES ('review', 5, '2026-01-03T00:00:00.000Z')",
      )
      .run()
    expect((target.prepare('SELECT max(id) as id FROM xp_events').get() as { id: number }).id).toBe(
      102,
    )

    source.close()
    target.close()
  })

  it('restores over an existing (dirty) database: truncate + reinsert', () => {
    const source = createTestDb()
    seed(source)
    const backup = backupAll(source)

    const target = createTestDb()
    seed(target)
    // corrupt the target
    target
      .prepare('UPDATE cards SET content = \'{"basic":{"front":"WRONG","back":"X"}}\' WHERE id = 1')
      .run()
    target
      .prepare(
        "INSERT INTO decks (name, created_at) VALUES ('Extra Deck', '2026-01-04T00:00:00.000Z')",
      )
      .run()

    restoreAll(backup, target)
    expect(rawSnapshot(target)).toEqual(rawSnapshot(source))
    source.close()
    target.close()
  })

  it('empties tables absent from the backup (whole-DB restore semantics)', () => {
    const db = createTestDb()
    seed(db)
    const backup = backupAll(db)
    const partial: BackupFile = {
      version: backup.version,
      exportedAt: backup.exportedAt,
      tables: { decks: backup.tables['decks']! },
    }
    restoreAll(partial, db)
    expect(db.prepare('SELECT count(*) as c FROM cards').get() as { c: number }).toEqual({ c: 0 })
    expect(db.prepare('SELECT count(*) as c FROM revlog').get() as { c: number }).toEqual({ c: 0 })
    expect(db.prepare('SELECT count(*) as c FROM decks').get() as { c: number }).toEqual({ c: 1 })
    db.close()
  })

  it('rejects malformed envelopes, unknown tables and unknown columns (ValidationError)', () => {
    const db = createTestDb()
    expect(() => restoreAll({ version: 1, exportedAt: 'x' }, db)).toThrow(ValidationError)
    expect(() =>
      restoreAll({ version: 1, exportedAt: 'x', tables: { not_a_table: [] } }, db),
    ).toThrow(/unknown table/)
    expect(() =>
      restoreAll(
        { version: 1, exportedAt: 'x', tables: { decks: [{ id: 1, name: 'D', bogus_col: 1 }] } },
        db,
      ),
    ).toThrow(/unknown column/)
    db.close()
  })

  it('is atomic: an FK-violating backup rolls back and leaves the database untouched', () => {
    const db = createTestDb()
    seed(db)
    const backup = backupAll(db)
    const before = rawSnapshot(db)

    // hand-craft a card referencing a deck id that does not exist in the backup
    const bad = structuredClone(backup)
    ;(bad.tables['cards'] as Record<string, unknown>[])[0]!['deck_id'] = 9999
    expect(() => restoreAll(bad, db)).toThrow(/FOREIGN KEY/)

    expect(rawSnapshot(db)).toEqual(before)
    db.close()
  })
})

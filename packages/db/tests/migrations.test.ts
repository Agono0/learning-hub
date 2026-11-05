import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { MIGRATIONS, assertMigrationOrder, runMigrations, type Migration } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'

const open = () => new Database(':memory:') as unknown as RawSqliteHandle

const columns = (raw: RawSqliteHandle, table: string) =>
  (raw.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name)

describe('migration runner', () => {
  it('applies pending migrations once, in order, and records them', () => {
    const raw = open()
    raw.exec('CREATE TABLE things (id INTEGER PRIMARY KEY);')
    const calls: number[] = []
    const migrations: Migration[] = [
      { id: 1, name: 'one', up: (ctx) => (calls.push(1), ctx.addColumn('things', 'a', 'TEXT')) },
      {
        id: 2,
        name: 'two',
        up: (ctx) => (calls.push(2), ctx.createIndex('things_a_idx', 'things', ['a'])),
      },
    ]

    const first = runMigrations(raw, migrations)
    expect(first.applied.map((m) => m.id)).toEqual([1, 2])
    expect(first.version).toBe(2)
    expect(columns(raw, 'things')).toContain('a')

    const second = runMigrations(raw, migrations)
    expect(second.applied).toEqual([])
    expect(calls).toEqual([1, 2])
  })

  it('addColumn is a no-op when the column already exists (fresh drizzle-kit DB)', () => {
    const raw = open()
    raw.exec('CREATE TABLE things (id INTEGER PRIMARY KEY, a TEXT);')
    const report = runMigrations(raw, [
      {
        id: 1,
        name: 'add-a',
        up: (ctx) => expect(ctx.addColumn('things', 'a', 'TEXT')).toBe(false),
      },
    ])
    expect(report.applied).toHaveLength(1)
  })

  it('skips steps on tables that do not exist yet', () => {
    const raw = open()
    expect(() =>
      runMigrations(raw, [
        {
          id: 1,
          name: 'missing',
          up: (ctx) => {
            ctx.addColumn('nope', 'x', 'TEXT')
            ctx.createIndex('nope_idx', 'nope', ['x'])
          },
        },
      ]),
    ).not.toThrow()
  })

  it('rolls back a failing migration and does not record it', () => {
    const raw = open()
    raw.exec('CREATE TABLE things (id INTEGER PRIMARY KEY);')
    const boom: Migration = {
      id: 1,
      name: 'boom',
      up: (ctx) => {
        ctx.addColumn('things', 'a', 'TEXT')
        throw new Error('boom')
      },
    }
    expect(() => runMigrations(raw, [boom])).toThrow('boom')
    expect(columns(raw, 'things')).not.toContain('a')
    expect(raw.prepare('SELECT count(*) AS c FROM schema_migrations').get()).toEqual({ c: 0 })
  })

  it('rejects unordered or duplicate ids', () => {
    const m = (id: number): Migration => ({ id, name: `m${id}`, up: () => {} })
    expect(() => assertMigrationOrder([m(1), m(1)])).toThrow(/strictly increasing/)
    expect(() => assertMigrationOrder([m(2), m(1)])).toThrow(/strictly increasing/)
  })

  it('ships a well-formed registry', () => {
    expect(() => assertMigrationOrder(MIGRATIONS)).not.toThrow()
    expect(MIGRATIONS[0]?.id).toBe(1)
  })
})

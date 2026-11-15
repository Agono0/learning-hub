/**
 * Unit tests for the ONE canonical XP path (rule 7): awardXp (repos/xp.ts).
 * Pins the canonical amounts (derived from core XP_REWARDS — the golden
 * behavior), the explicit-amount requirement for dynamic sources, and the
 * insert-only surface (rule 8).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../src/schema'
import { initDb, type RawSqliteHandle } from '../src/index'
import { awardXp, XP_SOURCES } from '../src/repos/xp'
import { withTransaction } from '../src/transaction'
import { XP_REWARDS } from '@learning-hub/core'

let ddlSource: RawSqliteHandle
beforeAll(async () => {
  ddlSource = (await initDb({ path: ':memory:' })).$client
})

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const ddls = ddlSource
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%' AND sql IS NOT NULL",
    )
    .all()
    .map((r) => (r as { sql: string }).sql)
  for (const ddl of ddls) sqlite.exec(ddl)
  return drizzle(sqlite, { schema })
}

describe('awardXp (rule 7: one canonical XP path)', () => {
  it('canonical amounts derive from core XP_REWARDS (no re-derived numbers)', () => {
    expect(XP_SOURCES.review).toBe(XP_REWARDS.review)
    expect(XP_SOURCES.lesson).toBe(XP_REWARDS.lesson)
    expect(XP_SOURCES.teachback).toBe(XP_REWARDS.teachback)
    expect(XP_SOURCES.focus).toBe(XP_REWARDS.focusSession)
    expect(XP_SOURCES.quest).toBe(XP_REWARDS.quest)
    expect(XP_SOURCES.habit).toBe(XP_REWARDS.habit)
    expect(XP_SOURCES.journal).toBe(XP_REWARDS.journal)
    expect(XP_SOURCES.idea).toBe(XP_REWARDS.ideaEvolve)
    expect(XP_SOURCES.achievement).toBe(XP_REWARDS.achievement)
    expect(XP_SOURCES.debate).toBe(XP_REWARDS.debate)
  })

  it('each source inserts one row with its canonical amount', () => {
    const db = createTestDb()
    for (const source of Object.keys(XP_SOURCES) as (keyof typeof XP_SOURCES)[]) {
      withTransaction((tx) => awardXp(tx, { source, meta: { probe: source } }), db)
    }
    for (const source of Object.keys(XP_SOURCES) as (keyof typeof XP_SOURCES)[]) {
      const row = db.select().from(schema.xpEvents).where(eq(schema.xpEvents.source, source)).get()
      expect(row?.amount, source).toBe(XP_SOURCES[source])
      expect(row?.meta, source).toEqual({ probe: source })
    }
  })

  it('explicit amount override is honored (dynamic sources: quest row, boss bounty)', () => {
    const db = createTestDb()
    withTransaction(
      (tx) => awardXp(tx, { source: 'quest', amount: 77, meta: { date: '2026-11-08' } }),
      db,
    )
    const row = db.select().from(schema.xpEvents).where(eq(schema.xpEvents.source, 'quest')).get()
    expect(row?.amount).toBe(77)
  })

  it('dynamic source without an amount throws (boss bounty must be explicit)', () => {
    const db = createTestDb()
    expect(() => withTransaction((tx) => awardXp(tx, { source: 'boss', meta: {} }), db)).toThrow(
      /explicit amount/,
    )
  })

  it('insert-only surface: the module exports no update/delete helpers (rule 8)', async () => {
    // The xp repo is intentionally minimal; if someone grows an update/delete
    // helper onto it, this contract breaks loudly.
    const xpModule = (await import('../src/repos/xp')) as unknown as Record<string, unknown>
    const exported = Object.keys(xpModule)
    for (const key of exported) {
      expect(key, 'xp repo export').not.toMatch(/update|delete|remove/i)
    }
  })

  it('atMs sets the row timestamp; omitted uses the schema default', () => {
    const db = createTestDb()
    withTransaction((tx) => awardXp(tx, { source: 'focus', atMs: 1_700_000_000_000 }), db)
    withTransaction((tx) => awardXp(tx, { source: 'focus' }), db)
    const rows = db.select().from(schema.xpEvents).where(eq(schema.xpEvents.source, 'focus')).all()
    expect(rows).toHaveLength(2)
    expect(rows[0].createdAt).toBe(new Date(1_700_000_000_000).toISOString())
    expect(rows[1].createdAt).toBeTruthy()
  })
})

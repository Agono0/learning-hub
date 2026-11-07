import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, createMigrationContext, runMigrations } from '../src/migrations'
import { deckDelayedFeedback } from '../src/migrations/023-deck-delayed-feedback'
import type { RawSqliteHandle } from '../src/index'
import { listDelayedFeedbackCorrections } from '../src/repos/delayed-feedback'

function createInMemoryDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}

const columns = (raw: RawSqliteHandle, table: string) =>
  (raw.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name)

describe('023 deck-delayed-feedback', () => {
  // a pre-023 decks table, as shipped by the baseline migration
  const createPre023Decks = (raw: RawSqliteHandle) =>
    raw.exec(`CREATE TABLE decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      emoji TEXT,
      desired_retention REAL,
      fsrs_weights TEXT,
      created_at TEXT NOT NULL
    );`)

  it('adds delayed_feedback to an existing decks table, defaulting existing decks to off', () => {
    const raw = new Database(':memory:') as unknown as RawSqliteHandle
    createPre023Decks(raw)
    raw.exec(`INSERT INTO decks (name, created_at) VALUES ('Biology', '2026-01-01T00:00:00Z');`)

    const report = runMigrations(raw, [deckDelayedFeedback])
    expect(report.applied).toEqual([{ id: 23, name: 'deck-delayed-feedback' }])
    expect(columns(raw, 'decks')).toContain('delayed_feedback')
    // existing rows survive with the flag OFF (0)
    const row = raw.prepare('SELECT name, delayed_feedback FROM decks').get() as {
      name: string
      delayed_feedback: number
    }
    expect(row).toEqual({ name: 'Biology', delayed_feedback: 0 })
  })

  it('is idempotent — re-running adds nothing and fails nowhere', () => {
    const raw = new Database(':memory:') as unknown as RawSqliteHandle
    createPre023Decks(raw)
    runMigrations(raw, [deckDelayedFeedback])
    const second = runMigrations(raw, [deckDelayedFeedback])
    expect(second.applied).toEqual([]) // recorded once; up() not re-run
    expect(() => deckDelayedFeedback.up(createMigrationContext(raw))).not.toThrow() // even forced
  })

  it('round-trips through drizzle as a boolean defaulting to false', () => {
    const { db } = createInMemoryDb()
    const [deck] = db
      .insert(schema.decks)
      .values({ name: 'Fresh', createdAt: '2026-06-01T00:00:00.000Z' })
      .returning()
      .all()
    expect(deck?.delayedFeedback).toBe(false)
    db.update(schema.decks)
      .set({ delayedFeedback: true })
      .where(eq(schema.decks.id, deck!.id))
      .run()
    const updated = db.select().from(schema.decks).where(eq(schema.decks.id, deck!.id)).get()
    expect(updated?.delayedFeedback).toBe(true)
  })
})

describe('listDelayedFeedbackCorrections', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createInMemoryDb>['db']

  // the "session" clock; the corrections window is the 24h before it.
  // revlog ids are epoch ms and unique, so every offset below is distinct.
  const NOW = new Date('2026-06-01T12:00:00.000Z')
  const hour = 3_600_000
  const hoursAgo = (h: number) => NOW.getTime() - h * hour

  /** card content helper — basic front/back so the JSON round-trip is observable */
  const basic = (front: string) => ({ basic: { front, back: `${front} — answer` } })

  const entry = (cardId: number, rating: number, agoMs: number) => ({
    id: agoMs,
    cardId,
    rating,
    state: 2,
    elapsedDays: 0,
    scheduledDays: 1,
    timeMs: 2000,
    reviewedAt: new Date(agoMs).toISOString(),
  })

  beforeEach(() => {
    const ctx = createInMemoryDb()
    sqlite = ctx.sqlite
    db = ctx.db
    db.insert(schema.decks)
      .values([
        { id: 1, name: 'Blind deck', delayedFeedback: true, createdAt: NOW.toISOString() },
        { id: 2, name: 'Other deck', createdAt: NOW.toISOString() },
      ])
      .run()
    db.insert(schema.cards)
      .values(
        [1, 2, 3, 4, 5, 6, 8].map((id) => ({
          id,
          deckId: 1,
          type: 'basic' as const,
          content: basic(`Q${id}`),
          due: NOW.toISOString(),
          createdAt: NOW.toISOString(),
        })),
      )
      .run()
    db.insert(schema.cards)
      .values({
        id: 7,
        deckId: 2,
        type: 'basic',
        content: basic('Q7'),
        due: NOW.toISOString(),
        createdAt: NOW.toISOString(),
      })
      .run()

    // card 1: graded Again 1h ago → corrected
    // card 2: graded Hard 2h ago → corrected (after the Agains)
    // card 3: graded Good 3h ago → NOT a miss
    // card 4: graded Again 25h ago → outside the 24h window
    // card 5: Again 26h ago, then Good 2.2h ago → latest review is a pass
    // card 6: Good 3.4h ago, then Again 0.5h ago → latest review is a fresh miss
    // card 8: Again 4h ago, UNDONE, Good 5h ago → latest ACTIVE review is a pass
    // card 7: lives in deck 2 — never leaks into deck 1's corrections
    db.insert(schema.revlog)
      .values([
        entry(1, 1, hoursAgo(1)),
        entry(2, 2, hoursAgo(2)),
        entry(3, 3, hoursAgo(3)),
        entry(4, 1, hoursAgo(25)),
        entry(5, 1, hoursAgo(26)),
        entry(5, 3, hoursAgo(2.2)),
        entry(6, 3, hoursAgo(3.4)),
        entry(6, 1, hoursAgo(0.5)),
        entry(8, 1, hoursAgo(4)),
        entry(8, 3, hoursAgo(5)),
        entry(7, 1, hoursAgo(1.6)),
      ])
      .run()
    db.insert(schema.revlogUndos)
      .values({ revlogId: hoursAgo(4), cardId: 8, undoneAt: new Date(hoursAgo(2)).toISOString() })
      .run()
  })

  it('returns the deck’s last-24h rating 1–2 misses with front+back, worst first', () => {
    const corrections = listDelayedFeedbackCorrections({ deckId: 1, now: NOW, db: db as never })
    // Again (newest first), then Hard
    expect(corrections.map((c) => c.id)).toEqual([6, 1, 2])
    const first = corrections[0]!
    expect(first.rating).toBe(1)
    expect(first.type).toBe('basic')
    expect(first.content.basic?.front).toBe('Q6')
    expect(first.content.basic?.back).toBe('Q6 — answer') // JSON column round-trips
    expect(new Date(first.reviewedAt).getTime()).toBe(hoursAgo(0.5))
  })

  it('excludes passes, stale misses, newer passes and undone reviews', () => {
    const ids = listDelayedFeedbackCorrections({ deckId: 1, now: NOW, db: db as never }).map(
      (c) => c.id,
    )
    expect(ids).not.toContain(3) // passed 3h ago
    expect(ids).not.toContain(4) // miss is 25h old (window is 24h)
    expect(ids).not.toContain(5) // latest review is a pass
    expect(ids).not.toContain(8) // latest ACTIVE review is a pass (Again undone)
  })

  it('never leaks another deck’s misses, and counts never-reviewed cards as clean', () => {
    const corrections = listDelayedFeedbackCorrections({ deckId: 1, now: NOW, db: db as never })
    expect(corrections.map((c) => c.id)).not.toContain(7) // deck 2
    expect(
      listDelayedFeedbackCorrections({ deckId: 2, now: NOW, db: db as never }).map((c) => c.id),
    ).toEqual([7])
  })

  it('honours a narrower window (withinMs)', () => {
    const corrections = listDelayedFeedbackCorrections({
      deckId: 1,
      now: NOW,
      withinMs: 1.5 * hour,
      db: db as never,
    })
    expect(corrections.map((c) => c.id)).toEqual([6, 1]) // Hard at −2h falls out
  })

  it('defaults to the process clock when now is omitted', () => {
    const t = Date.now() - 60_000 // a real miss one minute before "now"
    db.insert(schema.cards)
      .values({
        id: 9,
        deckId: 1,
        type: 'basic',
        content: basic('Q9'),
        due: new Date(t).toISOString(),
        createdAt: new Date(t).toISOString(),
      })
      .run()
    db.insert(schema.revlog)
      .values(entry(9, 1, t))
      .run()
    expect(
      listDelayedFeedbackCorrections({ deckId: 1, db: db as never }).map((c) => c.id),
    ).toContain(9)
  })

  it('leaves the revlog untouched (append-only) after querying', () => {
    listDelayedFeedbackCorrections({ deckId: 1, now: NOW, db: db as never })
    expect(db.select().from(schema.revlog).all()).toHaveLength(11)
    expect(db.select().from(schema.revlogUndos).all()).toHaveLength(1)
    sqlite.close()
  })
})

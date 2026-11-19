/**
 * Host-parity repository tests — the NEW shared query functions that MCP, CLI
 * and web hosts consume instead of carrying their own inline SQL
 * (repos/ideas.ideaSearch, repos/cards, repos/focus-lock standard-session
 * lifecycle, repos/fsrs.dueQueue, repos/stats.dailyReviewsSeries,
 * repos/knowledge-graph.graphOverview, repos/workload).
 *
 * The in-memory fixture mirrors fsrs-repo.test.ts; derived views are created
 * with the exact ensureViews DDL so the v_daily_reviews assertions hold.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { LearningHubDB, RawSqliteHandle } from '../src/index'
import { executeReview } from '../src/review-service'
import {
  abandonFocusSession,
  applyWorkloadShifts,
  createBasicCards,
  createIdea,
  createPomodoroSession,
  dailyReviewsSeries,
  dueQueue,
  findOrCreateDeck,
  finishFocusSession,
  frictionByTrigger,
  getIdea,
  graphOverview,
  ideaSearch,
  listCardsByStability,
  listRecentFocusSessions,
  parseBasicCards,
  recentReviewEvents,
  startFocusSession,
  sumFocusMinutes,
  undoCardReview,
  updateIdea,
  workloadCards,
} from '../src/index'

function createInMemoryDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  // Derived views — verbatim ensureViews DDL (packages/db/src/index.ts).
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_true_retention AS
    SELECT count(*) AS total,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS retained,
           round(100.0 * sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) / count(*), 1) AS retention_pct
    FROM revlog
    WHERE state >= 2
      AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)`)
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_daily_reviews AS
    SELECT substr(reviewed_at, 1, 10) AS day, count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog
    WHERE NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
    GROUP BY substr(reviewed_at, 1, 10)`)
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_xp_daily AS
    SELECT substr(created_at, 1, 10) AS day, sum(amount) AS xp
    FROM xp_events GROUP BY substr(created_at, 1, 10)`)
  const db = drizzle(sqlite, { schema }) as unknown as LearningHubDB
  return { sqlite, db }
}

/** Minimal FSRS-review-state card for grading paths (deckId always passed). */
function reviewableCard(
  overrides: Partial<typeof schema.cards.$inferInsert> = {},
): typeof schema.cards.$inferInsert {
  const base = {
    type: 'basic' as const,
    content: { basic: { front: 'Q', back: 'A' } },
    due: daysAgoIso(1),
    stability: 5,
    difficulty: 5,
    reps: 2,
    state: 2,
    lastReview: '2026-06-01T12:00:00.000Z',
  }
  return { ...base, ...overrides } as typeof schema.cards.$inferInsert
}

const T0 = new Date('2026-06-10T12:00:00.000Z')
const daysAgoIso = (n: number, from: Date = T0) =>
  new Date(from.getTime() - n * 86_400_000).toISOString()

describe('repos/ideas ideaSearch', () => {
  let db: LearningHubDB

  beforeEach(() => {
    db = createInMemoryDb().db
  })

  it('matches LIKE on title and content, newest-updated first, honoring limit', () => {
    const a = createIdea({ title: 'Spaced repetition in VR' }, { db })
    createIdea({ title: 'Guild economics', content: 'about spaced practice' }, { db })
    const c = createIdea({ title: 'Circadian naps' }, { db })
    updateIdea(c.id, { content: 'updated body mentions spaced too' }, { db })

    const hits = ideaSearch('spaced', { db })
    expect(hits).toHaveLength(2)
    expect(hits[0]!.id).toBe(c.id) // most recently updated first
    expect(hits.map((h) => h.id)).toContain(a.id)

    expect(ideaSearch('spaced', { limit: 1, db })).toHaveLength(1)
    expect(ideaSearch('nonexistent-term', { db })).toHaveLength(0)
  })

  it('is exposed through getIdea for the resource detail path', () => {
    const idea = createIdea({ title: 'Detail me' }, { db })
    expect(getIdea(idea.id, { db })?.title).toBe('Detail me')
  })
})

describe('repos/cards — decks, basic card generation, cognitive projections', () => {
  let db: LearningHubDB

  beforeEach(() => {
    db = createInMemoryDb().db
  })

  it('findOrCreateDeck is idempotent by name and honors emoji on create', () => {
    const first = findOrCreateDeck('Inbox', { db })
    const second = findOrCreateDeck('Inbox', { db })
    expect(second.id).toBe(first.id)
    // A DIFFERENT name with the same emoji still creates its own deck row.
    const named = findOrCreateDeck('Emoji deck', { emoji: '🧠', db })
    expect(named.emoji).toBe('🧠')
    expect(named.id).not.toBe(first.id)
    expect(findOrCreateDeck('Emoji deck', { db }).id).toBe(named.id)
  })

  it('parseBasicCards handles Q:/A: pairs, "::" and " | " separators and continuations', () => {
    expect(parseBasicCards('Q: What is FSRS?\nA: A scheduler')).toEqual([
      { front: 'What is FSRS?', back: 'A scheduler' },
    ])
    expect(parseBasicCards('front :: back')).toEqual([{ front: 'front', back: 'back' }])
    expect(parseBasicCards('left | right')).toEqual([{ front: 'left', back: 'right' }])
    expect(parseBasicCards('Question: one\nAnswer: two')).toEqual([{ front: 'one', back: 'two' }])
    expect(parseBasicCards('Q: tell me\nmore\nA: ok')).toEqual([
      { front: 'tell me more', back: 'ok' },
    ])
    expect(parseBasicCards('Q: unmatched')).toEqual([{ front: 'unmatched', back: '' }])
  })

  it('createBasicCards inserts due basic cards transactionally and counts skips', () => {
    const deck = findOrCreateDeck('Inbox', { db })
    const { cardIds, skipped } = createBasicCards(
      deck.id,
      'Q1: alpha\nA1: beta\norphan ::\ntheta :: omega',
      { db },
    )
    expect(cardIds).toHaveLength(2)
    expect(skipped).toBe(1)
    const rows = cardIds.map((id) =>
      db.select().from(schema.cards).where(eq(schema.cards.id, id)).get()!,
    )
    for (const row of rows) {
      expect(row.type).toBe('basic')
      expect(row.source).toBe('manual')
      expect(row.due).toBeTruthy()
      expect(row.state).toBe(0)
    }
    expect(rows[0]!.content).toEqual({ basic: { front: 'alpha', back: 'beta' } })
    expect(rows[1]!.content).toEqual({ basic: { front: 'theta', back: 'omega' } })

    const withSource = createBasicCards(deck.id, 'x :: y', { source: 'mcp', db })
    expect(
      db.select().from(schema.cards).where(eq(schema.cards.id, withSource.cardIds[0]!)).get()!
        .source,
    ).toBe('mcp')
  })

  it('createBasicCards propagates write failures and leaves no partial rows', () => {
    // cards.deck_id references decks (FK enforced by the fixture) — a
    // nonexistent deck fails the inserts and the empty transaction commits
    // nothing (withTransaction rollback semantics, mirroring transaction.test.ts).
    expect(() => createBasicCards(99999, 'a :: b\nc :: d', { db })).toThrow()
    expect(db.select().from(schema.cards).all()).toHaveLength(0)
  })

  it('listCardsByStability orders weakest-first, filters suspended, honors deckId and limit', () => {
    const deck = findOrCreateDeck('D', { db })
    const other = findOrCreateDeck('Other', { db })
    db.insert(schema.cards)
      .values([
        {
          deckId: deck.id,
          type: 'basic',
          content: { basic: { front: 's3', back: '' } },
          due: daysAgoIso(1),
          stability: 3,
        },
        {
          deckId: deck.id,
          type: 'basic',
          content: { basic: { front: 's1', back: '' } },
          due: daysAgoIso(1),
          stability: 1,
        },
        {
          deckId: deck.id,
          type: 'basic',
          content: { basic: { front: 's2', back: '' } },
          due: daysAgoIso(1),
          stability: 2,
          suspended: true,
        },
        {
          deckId: other.id,
          type: 'basic',
          content: { basic: { front: 's0', back: '' } },
          due: daysAgoIso(1),
          stability: 0.5,
        },
      ])
      .run()

    const rows = listCardsByStability({ deckId: deck.id, db })
    expect(rows.map((r) => r.content.basic!.front)).toEqual(['s1', 's3'])
    expect(listCardsByStability({ deckId: deck.id, limit: 1, db })).toHaveLength(1)
    expect(listCardsByStability({ db }).map((r) => r.content.basic!.front)).toEqual([
      's0',
      's1',
      's3',
    ])
  })

  it('recentReviewEvents excludes undone reviews and returns newest first', () => {
    const deck = findOrCreateDeck('D', { db })
    const card = db
      .insert(schema.cards)
      .values({
        deckId: deck.id,
        type: 'basic',
        content: { basic: { front: 'Q', back: 'A' } },
        due: daysAgoIso(1),
      })
      .returning()
      .all()[0]!
    db.insert(schema.revlog)
      .values([
        {
          id: 1001,
          cardId: card.id,
          rating: 1,
          state: 2,
          elapsedDays: 0,
          scheduledDays: 1,
          timeMs: 100,
          confidence: 1,
          reviewedAt: T0.toISOString(),
        },
        {
          id: 1002,
          cardId: card.id,
          rating: 3,
          state: 1,
          elapsedDays: 0,
          scheduledDays: 1,
          timeMs: 200,
          confidence: 1,
          reviewedAt: daysAgoIso(1),
        },
      ])
      .run()
    db.insert(schema.revlogUndos).values({ revlogId: 1001, cardId: card.id }).run()

    const events = recentReviewEvents({ db })
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ cardId: card.id, grade: 3, createdAt: daysAgoIso(1) })
  })
})

describe('repos/focus-lock — standard session lifecycle, friction, focus minutes', () => {
  let db: LearningHubDB

  beforeEach(() => {
    db = createInMemoryDb().db
  })

  it('starts pomodoro/standard sessions and computes actualMinutes on finish with canonical XP + streak', () => {
    const pomodoro = createPomodoroSession(25, { now: T0, db })
    expect(pomodoro.type).toBe('pomodoro')
    expect(pomodoro.startedAt).toBe(T0.toISOString())
    expect(pomodoro.completed).toBe(false)
    const deep = startFocusSession(
      { plannedMinutes: 50, type: 'deep', task: '  read paper  ' },
      { db },
    )
    expect(deep.task).toBe('read paper')
    expect(deep.type).toBe('deep')

    const finished = finishFocusSession(pomodoro.id, { actualMinutes: 25, now: T0, db })
    expect(finished.xpAwarded).toBe(40) // XP_REWARDS.focusSession
    expect(finished.session.completed).toBe(true)
    expect(finished.session.endedAt).toBeTruthy()
    const xpRows = db.select().from(schema.xpEvents).all()
    expect(xpRows).toHaveLength(1)
    expect(xpRows[0]!.source).toBe('focus')
    expect(db.select().from(schema.streaks).all()[0]!.current).toBe(1)

    // Idempotent: re-finishing an ended session neither re-pays XP nor edits the end time.
    const again = finishFocusSession(pomodoro.id, { actualMinutes: 99, db })
    expect(again.xpAwarded).toBe(0)
    expect(again.session.actualMinutes).toBe(25)
    expect(db.select().from(schema.xpEvents).all()).toHaveLength(1)
  })

  it('abandonFocusSession logs a leak without XP and is a no-op when already ended', () => {
    const session = createPomodoroSession(10, { now: T0, db })
    const abandoned = abandonFocusSession(session.id, { actualMinutes: 3.5, now: T0, db })
    expect(abandoned.completed).toBe(false)
    expect(abandoned.leaks).toBe(1)
    expect(abandoned.endedAt).toBe(T0.toISOString())
    expect(abandoned.actualMinutes).toBe(3.5)
    expect(db.select().from(schema.xpEvents).all()).toHaveLength(0)

    const repeat = abandonFocusSession(session.id, { actualMinutes: 9, db })
    expect(repeat.actualMinutes).toBe(3.5)
    expect(repeat.leaks).toBe(1)
  })

  it('computes actualMinutes from startedAt when not passed and trims empty tasks', () => {
    const blank = startFocusSession({ plannedMinutes: 25, task: '   ', now: T0 }, { db })
    expect(blank.task).toBeNull()
    const session = createPomodoroSession(25, { now: T0, db })
    const finished = finishFocusSession(session.id, {
      now: new Date(T0.getTime() + 25 * 60_000),
      db,
    })
    expect(finished.session.actualMinutes).toBe(25)
    expect(finished.session.completed).toBe(true)
    expect(finished.xpAwarded).toBe(40)
  })

  it('lists recent sessions newest-first and aggregates friction by trigger', () => {
    createPomodoroSession(5, { now: new Date(daysAgoIso(2)), db })
    createPomodoroSession(15, { now: T0, db })
    const sessions = listRecentFocusSessions({ db })
    expect(sessions).toHaveLength(2)
    expect(sessions[0]!.startedAt).toBe(T0.toISOString())

    db.insert(schema.frictionEvents)
      .values([
        { trigger: 'distraction', proceeded: true, createdAt: T0.toISOString() },
        { trigger: 'distraction', proceeded: false, createdAt: T0.toISOString() },
        { trigger: 'break_focus', proceeded: false, createdAt: T0.toISOString() },
      ])
      .run()
    const friction = frictionByTrigger({ db }).sort((a, b) => a.trigger.localeCompare(b.trigger))
    expect(friction).toEqual([
      { trigger: 'break_focus', count: 1, proceeded: 0 },
      { trigger: 'distraction', count: 2, proceeded: 1 },
    ])
    expect(frictionByTrigger({ limit: 1, db })).toHaveLength(1)
  })

  it('sumFocusMinutes counts completed sessions only inside the window', () => {
    db.insert(schema.focusSessions)
      .values([
        { startedAt: daysAgoIso(3), plannedMinutes: 25, actualMinutes: 25, completed: true },
        { startedAt: daysAgoIso(1), plannedMinutes: 40, actualMinutes: 40, completed: false }, // abandoned leak
        { startedAt: daysAgoIso(10), plannedMinutes: 10, actualMinutes: 10, completed: true }, // outside 7d
        { startedAt: daysAgoIso(2), plannedMinutes: 5, actualMinutes: null, completed: true },
      ])
      .run()
    expect(sumFocusMinutes({ days: 7, now: T0, db })).toBe(25)
    expect(sumFocusMinutes({ days: 30, now: T0, db })).toBe(35)
  })
})

describe('repos/fsrs dueQueue — the shared review session queue', () => {
  let db: LearningHubDB

  beforeEach(() => {
    db = createInMemoryDb().db
    db.insert(schema.userSettings)
      .values({ id: 'default', desiredRetention: 0.9, updatedAt: '2026-01-01T00:00:00.000Z' })
      .run()
  })

  it('orders most-overdue first and puts an ACTIVE confident-wrong review at the front', () => {
    const deck = findOrCreateDeck('D', { db })
    const plain = db
      .insert(schema.cards)
      .values(reviewableCard({ deckId: deck.id, due: daysAgoIso(1) }))
      .returning()
      .all()[0]!
    const oldest = db
      .insert(schema.cards)
      .values(reviewableCard({ deckId: deck.id, due: daysAgoIso(5) }))
      .returning()
      .all()[0]!
    // Active confident-wrong history (rating 1 + sure) while the card is still due.
    const hot = db
      .insert(schema.cards)
      .values(reviewableCard({ deckId: deck.id, due: daysAgoIso(3) }))
      .returning()
      .all()[0]!
    db.insert(schema.revlog)
      .values({
        id: T0.getTime() - 3_600_000,
        cardId: hot.id,
        rating: 1,
        state: 2,
        elapsedDays: 0,
        scheduledDays: 1,
        timeMs: 1000,
        confidence: 1,
        reviewedAt: daysAgoIso(0.05),
      })
      .run()

    const queue = dueQueue({ now: T0, db })
    expect(queue.map((c) => c.id)).toEqual([hot.id, oldest.id, plain.id])
  })

  it('excludes undone (erased) reviews from the hypercorrection signal', async () => {
    const deck = findOrCreateDeck('D', { db })
    const plain = db
      .insert(schema.cards)
      .values(reviewableCard({ deckId: deck.id, due: daysAgoIso(1) }))
      .returning()
      .all()[0]!
    const oldest = db
      .insert(schema.cards)
      .values(reviewableCard({ deckId: deck.id, due: daysAgoIso(5) }))
      .returning()
      .all()[0]!
    const undoneCard = db
      .insert(schema.cards)
      .values(reviewableCard({ deckId: deck.id, due: daysAgoIso(2) }))
      .returning()
      .all()[0]!

    const reviewed = await executeReview(
      { cardId: undoneCard.id, grade: 1, confidence: 1, timeMs: 2000 },
      { db, now: T0 },
    )
    const undone = undoCardReview(
      { cardId: undoneCard.id, revlogId: reviewed.revlog.id, preReview: reviewed.preReview },
      { db },
    )
    expect(undone.revlogUndone).toBe(true)

    // The erased review must NOT pull the card to the front: plain most-overdue
    // ordering (oldest → undoneCard → plain) proves the NOT EXISTS revlog_undos
    // exclusion — without it the restored card would lead as confident-wrong.
    const queue = dueQueue({ now: T0, db })
    expect(queue.map((c) => c.id)).toEqual([oldest.id, undoneCard.id, plain.id])
  })

  it('honors limit and deckId', () => {
    const deck = findOrCreateDeck('D', { db })
    const other = findOrCreateDeck('Other', { db })
    for (let i = 1; i <= 3; i++) {
      db.insert(schema.cards)
        .values(reviewableCard({ deckId: deck.id, due: daysAgoIso(i) }))
        .run()
    }
    db.insert(schema.cards)
      .values(reviewableCard({ deckId: other.id, due: daysAgoIso(1) }))
      .run()
    expect(dueQueue({ now: T0, db })).toHaveLength(3)
    expect(dueQueue({ now: T0, limit: 2, db })).toHaveLength(2)
    expect(dueQueue({ now: T0, deckId: other.id, db })).toHaveLength(1)
  })

  it('excludes cards buried into the future but returns cards whose bury expired', () => {
    const deck = findOrCreateDeck('D', { db })
    db.insert(schema.cards)
      .values([
        // sibling-burying: not available until buryUntil passes (core buildSession)
        reviewableCard({
          deckId: deck.id,
          due: daysAgoIso(1),
          buryUntil: new Date(T0.getTime() + 86_400_000).toISOString(),
        }),
        reviewableCard({ deckId: deck.id, due: daysAgoIso(2), buryUntil: daysAgoIso(1) }),
        reviewableCard({ deckId: deck.id, due: daysAgoIso(3) }),
      ])
      .run()
    const queue = dueQueue({ now: T0, db })
    expect(queue.map((c) => c.due)).toEqual([daysAgoIso(3), daysAgoIso(2)])
  })
})

describe('repos/stats dailyReviewsSeries', () => {
  let db: LearningHubDB

  beforeEach(() => {
    db = createInMemoryDb().db
  })

  it('reads v_daily_reviews ascending, respecting the days window and undo tombstones', () => {
    const deck = findOrCreateDeck('D', { db })
    const card = db
      .insert(schema.cards)
      .values({
        deckId: deck.id,
        type: 'basic',
        content: { basic: { front: 'Q', back: 'A' } },
        due: T0.toISOString(),
      })
      .returning()
      .all()[0]!
    const revlogRow = (id: number, reviewedAt: string, rating: number) => ({
      id,
      cardId: card.id,
      rating,
      state: 2,
      elapsedDays: 0,
      scheduledDays: 1,
      timeMs: 1000,
      confidence: 1 as const,
      reviewedAt,
    })
    const today = T0.toISOString()
    const tomorrow = new Date(T0.getTime() + 86_400_000).toISOString()
    db.insert(schema.revlog)
      .values([
        revlogRow(2001, today, 3),
        revlogRow(2002, today, 1), // erased below — must not count
        revlogRow(2003, daysAgoIso(2), 4),
        revlogRow(2004, daysAgoIso(40), 3), // outside the 7-day window
        revlogRow(2005, tomorrow, 4), // future-dated clock skew — outside any window ending today
      ])
      .run()
    db.insert(schema.revlogUndos).values({ revlogId: 2002, cardId: card.id }).run()

    // 7-day window = [T0-6, T0]: the 40-day-old AND the future-dated rows are
    // filtered out (a LIMIT without WHERE would leak them in).
    const series = dailyReviewsSeries({ days: 7, now: T0, database: db })
    expect(series.map((p) => p.day)).toEqual([daysAgoIso(2).slice(0, 10), today.slice(0, 10)])
    expect(series[0]).toMatchObject({ reviews: 1, correct: 1 })
    expect(series[1]).toMatchObject({ reviews: 1, correct: 1 }) // the undone Again is excluded
    expect(series[1]!.avgTimeMs).toBe(1000)

    // days=1 clamps to today only; days wide enough to reach back 40 days
    // still never crosses the window's upper bound into the future row.
    expect(dailyReviewsSeries({ days: 1, now: T0, database: db }).map((p) => p.day)).toEqual([
      today.slice(0, 10),
    ])
    const wide = dailyReviewsSeries({ days: 60, now: T0, database: db })
    expect(wide.map((p) => p.day)).toEqual([
      daysAgoIso(40).slice(0, 10),
      daysAgoIso(2).slice(0, 10),
      today.slice(0, 10),
    ])
  })
})

describe('repos/knowledge-graph graphOverview', () => {
  it('counts nodes/links and ranks the most-connected notes and ideas', () => {
    const { db } = createInMemoryDb()
    const noteA = db.insert(schema.notes).values({ title: 'A' }).returning().all()[0]!
    const noteB = db.insert(schema.notes).values({ title: 'B' }).returning().all()[0]!
    const noteC = db.insert(schema.notes).values({ title: 'C' }).returning().all()[0]!
    const deck = findOrCreateDeck('D', { db })
    db.insert(schema.cards)
      .values([
        {
          deckId: deck.id,
          type: 'basic',
          content: { basic: { front: '1', back: '' } },
          due: T0.toISOString(),
        },
        {
          deckId: deck.id,
          type: 'basic',
          content: { basic: { front: '2', back: '' } },
          due: T0.toISOString(),
        },
      ])
      .run()
    const ideaHub = createIdea({ title: 'Hub' }, { db })
    const ideaLeaf = createIdea({ title: 'Leaf' }, { db })
    db.insert(schema.noteLinks)
      .values([
        { fromNoteId: noteA.id, toNoteId: noteB.id },
        { fromNoteId: noteA.id, toNoteId: noteC.id },
      ])
      .run()
    db.insert(schema.ideaLinks)
      .values({ fromIdeaId: ideaHub.id, toIdeaId: ideaLeaf.id, type: 'parent-of' })
      .run()

    const overview = graphOverview({ db })
    expect(overview.counts).toEqual({ notes: 3, ideas: 2, cards: 2, noteLinks: 2, ideaLinks: 1 })
    expect(overview.topNotes[0]).toMatchObject({ id: noteA.id, title: 'A', links: 2 })
    expect(overview.topNotes).toHaveLength(3)
    expect(overview.topIdeas).toHaveLength(2)
    expect(overview.topIdeas[0]).toMatchObject({ id: ideaHub.id, links: 1 })
  })
})

describe('repos/workload — projection and transactional due shifts', () => {
  let db: LearningHubDB

  beforeEach(() => {
    db = createInMemoryDb().db
  })

  it('workloadCards projects the WorkloadCardItem shape, filtering suspended cards', () => {
    const deck = findOrCreateDeck('D', { db })
    const other = findOrCreateDeck('Other', { db })
    db.insert(schema.cards)
      .values([
        {
          deckId: deck.id,
          type: 'basic' as const,
          content: { basic: { front: 'a', back: '' } },
          due: daysAgoIso(1),
          stability: 4.2,
          scheduledDays: 3,
          state: 2,
          lapses: 1,
        },
        {
          deckId: deck.id,
          type: 'basic' as const,
          content: { basic: { front: 'b', back: '' } },
          due: daysAgoIso(1),
          suspended: true,
        },
        {
          deckId: other.id,
          type: 'basic' as const,
          content: { basic: { front: 'c', back: '' } },
          due: daysAgoIso(1),
        },
      ])
      .run()

    const items = workloadCards({ deckId: deck.id, db })
    expect(items).toEqual([
      {
        id: items[0]!.id,
        due: daysAgoIso(1),
        stability: 4.2,
        intervalDays: 3,
        state: 2,
        lapses: 1,
      },
    ])
    // Fresh card: unset FSRS numbers project as zeros.
    const fresh = workloadCards({ deckId: other.id, db })[0]!
    expect(fresh).toMatchObject({ stability: 0, intervalDays: 0, state: 0, lapses: 0 })
    expect(workloadCards({ db })).toHaveLength(2)
    expect(workloadCards({ limit: 1, db })).toHaveLength(1)
  })

  it('applyWorkloadShifts writes absolute due dates in one transaction', () => {
    const deck = findOrCreateDeck('D', { db })
    const a = db
      .insert(schema.cards)
      .values({
        deckId: deck.id,
        type: 'basic',
        content: { basic: { front: 'a', back: '' } },
        due: daysAgoIso(1),
      })
      .returning()
      .all()[0]!
    const b = db
      .insert(schema.cards)
      .values({
        deckId: deck.id,
        type: 'basic',
        content: { basic: { front: 'b', back: '' } },
        due: daysAgoIso(2),
      })
      .returning()
      .all()[0]!

    const targetA = daysAgoIso(0)
    const targetB = daysAgoIso(3)
    expect(
      applyWorkloadShifts(
        [
          { cardId: a.id, newDue: targetA },
          { cardId: b.id, newDue: targetB },
        ],
        { db },
      ),
    ).toBe(2)
    expect(db.select().from(schema.cards).where(eq(schema.cards.id, a.id)).get()!.due).toBe(targetA)
    expect(db.select().from(schema.cards).where(eq(schema.cards.id, b.id)).get()!.due).toBe(targetB)
    expect(applyWorkloadShifts([], { db })).toBe(0)
  })

  it('rolls back the whole shift batch when one write violates a constraint', () => {
    const deck = findOrCreateDeck('D', { db })
    const a = db
      .insert(schema.cards)
      .values({
        deckId: deck.id,
        type: 'basic',
        content: { basic: { front: 'a', back: '' } },
        due: daysAgoIso(1),
      })
      .returning()
      .all()[0]!
    const b = db
      .insert(schema.cards)
      .values({
        deckId: deck.id,
        type: 'basic',
        content: { basic: { front: 'b', back: '' } },
        due: daysAgoIso(2),
      })
      .returning()
      .all()[0]!

    // cards.due is NOT NULL: the second write fails and the first write must
    // roll back with it (withTransaction BEGIN IMMEDIATE semantics).
    expect(() =>
      applyWorkloadShifts(
        [
          { cardId: a.id, newDue: daysAgoIso(0) },
          { cardId: b.id, newDue: null as unknown as string },
        ],
        { db },
      ),
    ).toThrow()
    expect(db.select().from(schema.cards).where(eq(schema.cards.id, a.id)).get()!.due).toBe(
      daysAgoIso(1),
    )
    expect(db.select().from(schema.cards).where(eq(schema.cards.id, b.id)).get()!.due).toBe(
      daysAgoIso(2),
    )
  })
})

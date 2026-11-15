import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeLevel, dayKey } from '@learning-hub/core'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addFriend,
  bossBattles,
  deleteFriend,
  friends,
  generateUserStatsEnvelope,
  getActiveBossBattle,
  initDb,
  listFriends,
  onlineIdentity,
  revlog,
  revlogUndos,
  setDb,
  startBossBattle,
  streaks,
  syncBossBattleProgress,
  updateFriendSync,
  xpEvents,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
let nextRevId = 1_000

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-social-'))
  db = await initDb({ path: join(tmp, 'social.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(revlogUndos).run()
  db.delete(revlog).run()
  db.delete(bossBattles).run()
  db.delete(xpEvents).run()
  db.delete(streaks).run()
  db.delete(friends).run()
  db.delete(onlineIdentity).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

/** Appends a review; returns its revlog id. */
function review(rating: number, timeMs: number, elapsedDays = 0): number {
  const id = nextRevId++
  db.insert(revlog)
    .values({
      id,
      cardId: 1,
      rating,
      state: 2,
      elapsedDays,
      scheduledDays: 1,
      timeMs,
      reviewedAt: new Date().toISOString(),
    })
    .run()
  return id
}

describe('boss battles', () => {
  it('starts a battle at full HP, ignoring earlier reviews, and replaces an active one', () => {
    review(4, 1000)
    const a = startBossBattle('chronos')
    expect(a).toMatchObject({ status: 'active', currentHp: a.maxHp, playerHp: 100 })
    expect(syncBossBattleProgress().battle?.currentHp).toBe(a.maxHp)

    const b = startBossBattle('chronos')
    expect(getActiveBossBattle()?.id).toBe(b.id)
    expect(db.select().from(bossBattles).where(eq(bossBattles.id, a.id)).get()?.status).toBe(
      'defeat',
    )
  })

  it('applies the speed bonus from answer time, not elapsed days (regression)', () => {
    const b = startBossBattle('chronos')
    review(3, 10_000, 2) // slow answer to a card last seen 2 days ago → no bonus
    expect(b.maxHp - syncBossBattleProgress().battle!.currentHp).toBe(20)
    review(3, 2_000, 0) // fast answer to a new card → +5
    expect(b.maxHp - syncBossBattleProgress().battle!.currentHp).toBe(20 + 25)
  })

  it('does not count undone reviews', () => {
    const b = startBossBattle('chronos')
    const undone = review(4, 10_000)
    db.insert(revlogUndos)
      .values({ revlogId: undone, cardId: 1, undoneAt: new Date().toISOString() } as never)
      .run()
    review(2, 10_000)
    expect(b.maxHp - syncBossBattleProgress().battle!.currentHp).toBe(10)
  })

  it('pays the victory bounty exactly once', () => {
    startBossBattle('chronos')
    for (let i = 0; i < 10; i++) review(4, 10_000)
    const first = syncBossBattleProgress()
    expect(first.battle?.status).toBe('victory')
    syncBossBattleProgress()
    syncBossBattleProgress()
    expect(db.select().from(xpEvents).where(eq(xpEvents.source, 'boss')).all()).toHaveLength(1)
    expect(getActiveBossBattle()).toBeNull()
    expect(syncBossBattleProgress()).toEqual({ battle: null })
  })

  it('ends in defeat when the boss lands enough counterattacks', () => {
    startBossBattle('chronos')
    for (let i = 0; i < 9; i++) review(1, 5_000)
    expect(syncBossBattleProgress().battle).toMatchObject({ status: 'defeat', playerHp: 0 })
    expect(db.select().from(xpEvents).all()).toHaveLength(0)
  })
})

describe('friends', () => {
  it('adds, syncs, lists newest first and deletes', () => {
    const a = addFriend('Ada', 'https://gist.github.com/a')
    const b = addFriend('Alan', 'https://gist.github.com/b')
    updateFriendSync(a.id, '{"v":1}')
    const rows = listFriends()
    expect(rows.map((f) => f.id)).toEqual([b.id, a.id])
    expect(rows[1]).toMatchObject({ lastDataJson: '{"v":1}' })
    expect(rows[1]!.lastSyncedAt).not.toBeNull()
    expect(deleteFriend(a.id)).toBe(true)
    expect(deleteFriend(a.id)).toBe(false)
  })
})

describe('stats envelope', () => {
  it('uses the app level curve, the live streak, the alias, and skips undone reviews', () => {
    db.insert(xpEvents).values({ source: 'review', amount: 5_000 }).run()
    db.insert(streaks)
      .values({ current: 9, best: 9, lastActiveDate: dayKey(new Date()), freezes: 0 })
      .run()
    db.insert(onlineIdentity)
      .values({ mode: 'offline', userId: 'u1', alias: 'Ada' } as never)
      .run()
    review(3, 1000)
    const undone = review(3, 1000)
    db.insert(revlogUndos)
      .values({ revlogId: undone, cardId: 1, undoneAt: new Date().toISOString() } as never)
      .run()

    const env = generateUserStatsEnvelope()
    expect(env.level).toBe(computeLevel(5_000).level)
    expect(env.streak).toBe(9)
    expect(env.username).toBe('Ada')
    expect(env.totalReviews).toBe(1)
    expect(env.weeklyXp).toBe(5_000)
  })

  it('reads a lapsed streak as 0 and never creates an identity', () => {
    db.insert(streaks)
      .values({ current: 30, best: 30, lastActiveDate: '2020-01-01', freezes: 0 })
      .run()
    const env = generateUserStatsEnvelope()
    expect(env.streak).toBe(0)
    expect(env.username).toBe('Learner')
    expect(db.select().from(onlineIdentity).all()).toHaveLength(0)
  })
})

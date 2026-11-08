import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  checkinHabit,
  commitments,
  createCommitment,
  createHabit,
  deleteCommitment,
  deleteHabit,
  getHabit,
  habitLogs,
  habits,
  initDb,
  listCommitments,
  listHabits,
  setDb,
  updateCommitment,
  updateHabit,
  xpEvents,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-habits-commitments-'))
  db = await initDb({ path: join(tmp, 'habits.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(habitLogs).run()
  db.delete(habits).run()
  db.delete(commitments).run()
  db.delete(xpEvents).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('Habits repository (B2)', () => {
  it('creates habits and sequences their stack chain ordering', () => {
    const h1 = createHabit({ name: 'Morning Espresso', cue: 'Wake up' }, { db })
    const h2 = createHabit(
      { name: 'Read 5 pages', cue: 'After Espresso', anchor: 'Morning Espresso' },
      { db },
    )

    expect(h1.order).toBe(1)
    expect(h2.order).toBe(2)

    const list = listHabits({ db })
    expect(list.habits).toHaveLength(2)
    // Anchored habits lead the chain (Clear 2018 habit stacking view)
    expect(list.habits[0]!.name).toBe('Read 5 pages')
    expect(list.habits[1]!.name).toBe('Morning Espresso')
  })

  it('checks in habit idempotently, awarding XP on first checkin of day only', () => {
    const habit = createHabit({ name: 'Meditation' }, { db })
    const date = '2026-11-09'

    // First checkin
    const res1 = checkinHabit({ habitId: habit.id, date, db })
    expect(res1.alreadyDone).toBe(false)
    expect(res1.xpAwarded).toBe(10)

    // Repeat checkin on same day
    const res2 = checkinHabit({ habitId: habit.id, date, db })
    expect(res2.alreadyDone).toBe(true)
    expect(res2.xpAwarded).toBe(0)

    const list = listHabits({ now: new Date(date + 'T12:00:00Z'), db })
    expect(list.habits[0]!.todayDone).toBe(true)
    expect(list.habits[0]!.logDates).toContain(date)
  })

  it('updates habit definitions and archives if logs exist on delete', () => {
    const habit = createHabit({ name: 'Cold Shower' }, { db })

    const updated = updateHabit(habit.id, { reward: 'Feeling energetic' }, { db })
    expect(updated?.reward).toBe('Feeling energetic')

    // Add log
    checkinHabit({ habitId: habit.id, date: '2026-11-09', db })

    // Delete should archive because habit_logs references this habit
    const delRes = deleteHabit(habit.id, { db })
    expect(delRes.ok).toBe(true)
    expect(delRes.archived).toBe(true)

    const fetched = getHabit(habit.id, { db })
    expect(fetched?.archived).toBe(true)
  })
})

describe('Commitments repository (B2)', () => {
  it('creates, lists with honest weekly tracking report, updates, and deletes commitments', () => {
    const created = createCommitment(
      {
        title: 'Complete 100 Flashcards This Week',
        metric: 'reviews',
        threshold: 100,
        stakes: '$10 charity pledge',
      },
      { db },
    )

    expect(created.id).toBeDefined()
    expect(created.metric).toBe('reviews')
    expect(created.threshold).toBe(100)

    const list = listCommitments({ db })
    expect(list.commitments).toHaveLength(1)
    expect(list.report).toHaveLength(1)
    expect(list.report[0]!.threshold).toBe(100)
    expect(list.report[0]!.met).toBe(false)

    // Update commitment status
    const updated = updateCommitment(created.id, { status: 'kept' }, { db })
    expect(updated?.status).toBe('kept')

    // Delete commitment
    const deleted = deleteCommitment(created.id, { db })
    expect(deleted).toBe(true)

    const listAfter = listCommitments({ db })
    expect(listAfter.commitments).toHaveLength(0)
  })
})

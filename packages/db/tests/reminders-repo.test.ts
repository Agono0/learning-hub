import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dayKey } from '@learning-hub/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  collectUserFacts,
  focusSessions,
  getReminderSettings,
  initDb,
  logReminderSent,
  recordReminderClick,
  setDb,
  streaks,
  updateReminderSettings,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
const DAY = 86_400_000
const daysAgoKey = (n: number) => dayKey(new Date(Date.now() - n * DAY))
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-reminders-'))
  db = await initDb({ path: join(tmp, 'reminders.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(streaks).run()
  db.delete(focusSessions).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

function setStreak(current: number, lastActiveDate: string | null, freezes = 0) {
  db.insert(streaks).values({ current, best: current, lastActiveDate, freezes }).run()
}

describe('reminder settings', () => {
  it('creates defaults lazily and applies partial updates', () => {
    const before = getReminderSettings()
    expect(typeof before.enabled).toBe('boolean')
    const after = updateReminderSettings({ dailyCap: 2, enabled: false })
    expect(after).toMatchObject({ dailyCap: 2, enabled: false })
    expect(after.quietStart).toBe(before.quietStart)
  })
})

describe('collectUserFacts streak (regression: was "distinct days ever")', () => {
  it('is 0 with no streak row', () => {
    expect(collectUserFacts().currentStreak).toBe(0)
  })

  it('reports a streak that is still alive (active today or yesterday)', () => {
    setStreak(12, daysAgoKey(1))
    expect(collectUserFacts().currentStreak).toBe(12)
    db.delete(streaks).run()
    setStreak(12, daysAgoKey(0))
    expect(collectUserFacts().currentStreak).toBe(12)
  })

  it('reports 0 once the gap can no longer be bridged', () => {
    setStreak(30, daysAgoKey(10))
    expect(collectUserFacts().currentStreak).toBe(0)
  })

  it('keeps a one-day gap alive while a freeze is available', () => {
    setStreak(5, daysAgoKey(2), 1)
    expect(collectUserFacts().currentStreak).toBe(5)
    db.delete(streaks).run()
    setStreak(5, daysAgoKey(2), 0)
    // without a freeze it survives only via the weekend amulet (off here)
    expect(collectUserFacts().currentStreak).toBe(0)
  })
})

describe('collectUserFacts focus minutes (regression: abandoned sessions counted)', () => {
  it('ignores sessions that already ended', () => {
    db.insert(focusSessions)
      .values({
        startedAt: minutesAgo(60 * 24 * 3),
        plannedMinutes: 25,
        endedAt: minutesAgo(60 * 24 * 3 - 5),
      })
      .run()
    expect(collectUserFacts().continuousFocusMinutes).toBe(0)
  })

  it('measures the session still running', () => {
    db.insert(focusSessions)
      .values({ startedAt: minutesAgo(42), plannedMinutes: 50 })
      .run()
    const m = collectUserFacts().continuousFocusMinutes
    expect(m).toBeGreaterThanOrEqual(41)
    expect(m).toBeLessThanOrEqual(43)
  })
})

describe('reminder audit trail', () => {
  it("logs sends and clicks into today's facts", () => {
    const sent = logReminderSent({
      kind: 'daily_review',
      title: 't',
      body: 'b',
      actionUrl: '/review',
    })
    recordReminderClick({ reminderLogId: sent.id, kind: 'daily_review' })
    const facts = collectUserFacts()
    expect(facts.sentToday.some((s) => s.kind === 'daily_review')).toBe(true)
    expect(facts.clickedToday?.some((c) => c.kind === 'daily_review')).toBe(true)
  })
})

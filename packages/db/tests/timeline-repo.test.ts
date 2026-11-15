import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  focusSessions,
  forestPlots,
  frictionEvents,
  getActivityTimeline,
  humanize,
  initDb,
  setDb,
  studyCoinLedger,
  xpEvents,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-timeline-'))
  db = await initDb({ path: join(tmp, 'timeline.db') })
  setDb(db)

  const [done] = db
    .insert(focusSessions)
    .values({
      startedAt: ago(60),
      endedAt: ago(35),
      plannedMinutes: 25,
      actualMinutes: 25,
      completed: true,
      task: 'Essay',
    })
    .returning()
    .all()
  db.insert(xpEvents)
    .values({ source: 'focus', amount: 20, meta: { sessionId: done!.id }, createdAt: ago(35) })
    .run()
  // still running: must not appear (no end time yet)
  db.insert(focusSessions)
    .values({ startedAt: ago(5), plannedMinutes: 25 })
    .run()
  // too old for a 14-day window
  db.insert(focusSessions)
    .values({ startedAt: ago(60 * 24 * 30), endedAt: ago(60 * 24 * 30 - 25), plannedMinutes: 25 })
    .run()

  db.insert(xpEvents)
    .values({ source: 'review', amount: 2, createdAt: ago(20) })
    .run()
  db.insert(xpEvents)
    .values({ source: 'achievement', amount: 50, createdAt: ago(15) })
    .run()
  db.insert(forestPlots)
    .values({ treeType: 'tree_cherry_blossom', durationMinutes: 50, createdAt: ago(10) })
    .run()
  db.insert(studyCoinLedger)
    .values({
      amount: 5,
      balanceAfter: 5,
      reason: 'focus_session_bonus',
      signature: 's',
      createdAt: ago(8),
    })
    .run()
  db.insert(studyCoinLedger)
    .values({
      amount: 100,
      balanceAfter: 105,
      reason: 'welcome_bonus',
      signature: 's',
      createdAt: ago(7),
    })
    .run()
  db.insert(frictionEvents)
    .values({ trigger: 'max_focus_exit', createdAt: ago(3) })
    .run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('activity timeline', () => {
  it('merges ledgers newest-first with no null timestamps', () => {
    const t = getActivityTimeline()
    expect(t.every((e) => typeof e.at === 'string' && e.at.length > 0)).toBe(true)
    const ats = t.map((e) => e.at)
    expect([...ats].sort().reverse()).toEqual(ats)
    expect(t.map((e) => e.kind)).toEqual(['friction', 'coin', 'tree', 'achievement', 'xp', 'focus'])
  })

  it('shows each focus session once, carrying its XP', () => {
    const focus = getActivityTimeline().filter((e) => e.kind === 'focus')
    expect(focus).toHaveLength(1)
    expect(focus[0]).toMatchObject({
      title: 'Focus session completed',
      detail: '25 min · Essay · +20 XP',
    })
  })

  it('humanizes every underscore and hides the welcome bonus', () => {
    const t = getActivityTimeline()
    expect(t.find((e) => e.kind === 'tree')?.title).toBe('Planted a cherry blossom')
    expect(t.find((e) => e.kind === 'coin')?.detail).toBe('focus session bonus')
    expect(t.find((e) => e.kind === 'friction')?.detail).toBe('max focus exit')
    expect(t.filter((e) => e.kind === 'coin')).toHaveLength(1)
    expect(humanize('a__b_c_')).toBe('a b c')
  })

  it('respects the day window and limit', () => {
    expect(getActivityTimeline(14, 2)).toHaveLength(2)
    expect(getActivityTimeline(1 / 24 / 12)).toHaveLength(1) // last ~5 min → friction only
  })
})

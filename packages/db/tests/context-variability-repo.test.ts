import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  ContextLimitError,
  ContextValidationError,
  addContextGoal,
  archiveContextGoal,
  contextGoals,
  contextSessions,
  endContextSession,
  getOpenContextSession,
  initDb,
  listContextGoals,
  listContextSessions,
  logContextSession,
  revlog,
  revlogUndos,
  runContextAuditDb,
  setDb,
  startContextSession,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB
const NOW = new Date('2026-11-20T12:00:00.000Z')
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 10, day, hour)).toISOString()

beforeAll(async () => {
  db = await initDb({ path: join(mkdtempSync(join(tmpdir(), 'lh-ctx-')), 'ctx.db') })
  setDb(db)
})
beforeEach(() => {
  db.delete(revlogUndos).run()
  db.delete(revlog).run()
  db.delete(contextGoals).run()
  db.delete(contextSessions).run()
})

describe('sessions', () => {
  it('starts, dedupes the same open place and closes the previous session on a new place', () => {
    const a = startContextSession({ place: ' Library ', now: NOW })
    expect(a.created).toBe(true)
    expect(a.session.place).toBe('library')
    const again = startContextSession({ place: 'library', now: new Date(NOW.getTime() + 60_000) })
    expect(again.created).toBe(false)
    expect(again.session.id).toBe(a.session.id)
    const b = startContextSession({ place: 'home', now: new Date(NOW.getTime() + 3_600_000) })
    expect(b.created).toBe(true)
    const list = listContextSessions()
    expect(list).toHaveLength(2)
    expect(list.find((s) => s.place === 'library')!.endedAt).toBe(b.session.startedAt)
    expect(getOpenContextSession(new Date(NOW.getTime() + 3_700_000))!.place).toBe('home')
  })
  it('ends the open session and does nothing when none is open', () => {
    startContextSession({ place: 'cafe', now: NOW })
    const ended = endContextSession(undefined, new Date(NOW.getTime() + 1_800_000))
    expect(ended!.endedAt).toBe(new Date(NOW.getTime() + 1_800_000).toISOString())
    expect(endContextSession(undefined, NOW)).toBeNull()
  })
  it('an open session older than the cutoff no longer counts as open', () => {
    startContextSession({ place: 'cafe', now: NOW })
    expect(getOpenContextSession(new Date(NOW.getTime() + 4 * 3_600_000))).toBeNull()
  })
  it('closes a forgotten open session at its cap, not at the later time', () => {
    startContextSession({ place: 'cafe', now: NOW })
    const much = new Date(NOW.getTime() + 20 * 3_600_000)
    const next = startContextSession({ place: 'library', now: much })
    expect(next.created).toBe(true)
    const old = listContextSessions().find((s) => s.place === 'cafe')!
    expect(old.endedAt).toBe(new Date(NOW.getTime() + 3 * 3_600_000).toISOString())
  })
  it('ending a forgotten session also stops at the cap', () => {
    startContextSession({ place: 'cafe', now: NOW })
    const ended = endContextSession(undefined, new Date(NOW.getTime() + 30 * 3_600_000))
    expect(ended!.endedAt).toBe(new Date(NOW.getTime() + 3 * 3_600_000).toISOString())
  })
  it('validates place, noise and time ranges', () => {
    expect(() => startContextSession({ place: ' ! ' })).toThrow(ContextValidationError)
    expect(() => startContextSession({ place: 'home', noise: 'deafening' })).toThrow(
      ContextValidationError,
    )
    const base = { place: 'home', now: NOW }
    expect(() => logContextSession({ ...base, startedAt: at(19, 9), endedAt: at(19, 8) })).toThrow(
      /after it starts/,
    )
    expect(() => logContextSession({ ...base, startedAt: at(19, 0), endedAt: at(19, 20) })).toThrow(
      /12 hours/,
    )
    expect(() =>
      logContextSession({ ...base, startedAt: at(20, 11), endedAt: at(20, 20) }),
    ).toThrow(/future/)
    expect(() => logContextSession({ ...base, startedAt: 'x', endedAt: 'y' })).toThrow(
      /valid times/,
    )
  })
  it('logging the same past session twice stores one row', () => {
    const input = { place: 'Home', startedAt: at(19, 9), endedAt: at(19, 10), now: NOW }
    const a = logContextSession(input)
    const b = logContextSession({ ...input, place: 'home' })
    expect(a.created).toBe(true)
    expect(b.created).toBe(false)
    expect(listContextSessions()).toHaveLength(1)
  })
  it('refuses new sessions past the cap', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      startedAt: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
      endedAt: null,
      place: 'x place',
    }))
    for (let i = 0; i < rows.length; i += 500)
      db.insert(contextSessions)
        .values(rows.slice(i, i + 500))
        .run()
    expect(() => startContextSession({ place: 'home', now: NOW })).toThrow(ContextLimitError)
    expect(() =>
      logContextSession({ place: 'home', startedAt: at(19, 9), endedAt: at(19, 10), now: NOW }),
    ).toThrow(ContextLimitError)
  })
})

describe('goals', () => {
  const goal = {
    label: 'Final exam',
    place: 'Exam Hall',
    startHour: 9,
    endHour: 12,
    noise: 'quiet',
    now: NOW,
  }
  it('adds, updates in place, archives and re-adds', () => {
    const a = addContextGoal(goal)
    expect(a.created).toBe(true)
    expect(a.goal.place).toBe('exam hall')
    const b = addContextGoal({ ...goal, endHour: 13 })
    expect(b.created).toBe(false)
    expect(b.goal.id).toBe(a.goal.id)
    expect(b.goal.endHour).toBe(13)
    expect(archiveContextGoal(a.goal.id, NOW)).toBe(true)
    expect(archiveContextGoal(a.goal.id, NOW)).toBe(false)
    expect(listContextGoals()).toEqual([])
    const c = addContextGoal(goal)
    expect(c.goal.id).toBe(a.goal.id)
    expect(listContextGoals()).toHaveLength(1)
  })
  it('matches a goal label case-insensitively', () => {
    const a = addContextGoal(goal)
    const b = addContextGoal({ ...goal, label: 'FINAL EXAM' })
    expect(b.created).toBe(false)
    expect(b.goal.id).toBe(a.goal.id)
    expect(listContextGoals()).toHaveLength(1)
  })
  it('validates hours and caps active goals', () => {
    expect(() => addContextGoal({ ...goal, startHour: 24 })).toThrow(ContextValidationError)
    expect(() => addContextGoal({ ...goal, endHour: 9 })).toThrow(/empty/)
    expect(() => addContextGoal({ ...goal, label: 'x' })).toThrow(ContextValidationError)
    for (let i = 0; i < 20; i++) addContextGoal({ ...goal, label: `Goal ${i}` })
    expect(() => addContextGoal({ ...goal, label: 'Goal 20' })).toThrow(ContextLimitError)
    expect(addContextGoal({ ...goal, label: 'Goal 3', endHour: 14 }).created).toBe(false)
  })
})

describe('audit on live data', () => {
  let rid = 1_700_000_000_000
  const review = (cardId: number, rating: number, when: string) =>
    db
      .insert(revlog)
      .values({
        id: rid++,
        cardId,
        rating,
        state: 2,
        elapsedDays: 1,
        scheduledDays: 2,
        timeMs: 3000,
        reviewedAt: when,
      })
      .run()
  function seed() {
    for (const d of [1, 2, 3, 4])
      logContextSession({ place: 'home', startedAt: at(d, 8), endedAt: at(d, 11), now: NOW })
    logContextSession({ place: 'cafe', startedAt: at(7, 18), endedAt: at(7, 20), now: NOW })
    for (let c = 1; c <= 4; c++) {
      review(c, 3, at(1, 9))
      review(c, 3, at(2, 9))
      review(c, 3, at(3, 9))
      review(c, 3, at(4, 9))
    }
  }
  it('joins reviews to sessions and ignores undone reviews', () => {
    seed()
    const run = runContextAuditDb({ now: NOW, tzOffsetMinutes: 0 })
    expect(run.audit.reviews).toBe(16)
    expect(run.audit.attributedShare).toBe(1)
    expect(run.audit.byPlace[0]!.key).toBe('home')
    const all = db.select().from(revlog).all()
    for (const r of all) db.insert(revlogUndos).values({ revlogId: r.id, cardId: r.cardId }).run()
    expect(runContextAuditDb({ now: NOW, tzOffsetMinutes: 0 }).audit.reviews).toBe(0)
  })
  it('respects the window and counts goal matches in local hours', () => {
    seed()
    addContextGoal({ label: 'Exam', place: 'home', startHour: 9, endHour: 10, now: NOW })
    const run = runContextAuditDb({ now: NOW, tzOffsetMinutes: 0 })
    expect(run.audit.goals[0]!.matched).toBe(16)
    expect(runContextAuditDb({ now: NOW, windowDays: 3, tzOffsetMinutes: 0 }).audit.reviews).toBe(0)
    // shifting the timezone moves the hours out of the 09:00 window
    expect(runContextAuditDb({ now: NOW, tzOffsetMinutes: 180 }).audit.goals[0]!.matched).toBe(0)
  })
})

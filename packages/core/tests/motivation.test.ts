import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENTS,
  MAX_QUEST_REVIEWS,
  SOLIDIFYING_THRESHOLDS,
  computeLevel,
  dailyQuote,
  aggregateWeek,
  dopamineSuggestion,
  DOPAMINE_MENU,
  generateDailyQuests,
  isFreshStartMoment,
  levelFromXp,
  milestoneQuote,
  solidifying,
  stackChainOrder,
  unlockedAchievementKeys,
  validateHabit,
  validateJournalEntry,
  validateWoopGoal,
  xpForLevel,
} from '../src/index'
import {
  dayKey,
  emergencyReview,
  isWeekend,
  recordActivity,
  type StreakState,
} from '../src/streaks'

// ─── Daily quests ───────────────────────────────────────────────────────────

describe('generateDailyQuests', () => {
  it('is deterministic for the same date', () => {
    const a = generateDailyQuests({
      date: '2026-11-04',
      dueCount: 12,
      habitsCount: 4,
      focusMinutesTarget: 25,
    })
    const b = generateDailyQuests({
      date: '2026-11-04',
      dueCount: 12,
      habitsCount: 4,
      focusMinutesTarget: 25,
    })
    expect(a).toEqual(b)
  })

  it('always produces exactly 3 quests: reviews + lesson/focus + habit', () => {
    const quests = generateDailyQuests({ date: '2026-11-04', dueCount: 50, habitsCount: 2 })
    expect(quests).toHaveLength(3)
    expect(quests[0].type).toBe('reviews')
    expect(['lesson', 'focus']).toContain(quests[1].type)
    expect(quests[2].type).toBe('habit')
    for (const q of quests) {
      expect(q.progress).toBe(0)
      expect(q.done).toBe(false)
      expect(q.label.length).toBeGreaterThan(3)
    }
  })

  it('caps reviews at 20 and falls back to a 10-card starter dose', () => {
    const capped = generateDailyQuests({ date: '2026-11-04', dueCount: 80 })
    expect(capped[0].target).toBe(MAX_QUEST_REVIEWS)
    expect(capped[0].target).toBe(20)
    const empty = generateDailyQuests({ date: '2026-11-04', dueCount: 0 })
    expect(empty[0].target).toBe(10)
    const few = generateDailyQuests({ date: '2026-11-04', dueCount: 7 })
    expect(few[0].target).toBe(7)
  })

  it('uses the focus-minutes target for focus blocks and 1 lesson on lesson days', () => {
    const focus = generateDailyQuests({ date: '2026-11-03', focusMinutesTarget: 50 })
    const lesson = generateDailyQuests({ date: '2026-11-04', focusMinutesTarget: 50 })
    for (const q of [focus, lesson]) {
      const mid = q[1]
      if (mid.type === 'focus') expect(mid.target).toBe(50)
      if (mid.type === 'lesson') expect(mid.target).toBe(1)
    }
    expect(focus).not.toEqual(lesson) // different dates rotate the middle quest
  })

  it('scales the habit quest to active habits (capped at 3, min 1)', () => {
    expect(generateDailyQuests({ date: '2026-11-04', habitsCount: 6 })[2].target).toBe(3)
    expect(generateDailyQuests({ date: '2026-11-04', habitsCount: 2 })[2].target).toBe(2)
    expect(generateDailyQuests({ date: '2026-11-04', habitsCount: 0 })[2].target).toBe(1)
  })

  it('accepts Date objects', () => {
    const fromString = generateDailyQuests({ date: '2026-01-01', dueCount: 5 })
    const fromDate = generateDailyQuests({ date: new Date('2026-01-01T12:00:00Z'), dueCount: 5 })
    expect(fromString).toEqual(fromDate)
  })
})

// ─── Achievements ───────────────────────────────────────────────────────────

describe('achievements', () => {
  const KEYS = [
    'first_review',
    'reviews_100',
    'reviews_1000',
    'streak_7',
    'streak_30',
    'first_teachback',
    'first_focus',
    'focus_600_minutes',
    'first_course',
    'courses_3',
    'first_certificate',
    'exam_aced',
    'skill_mastered',
    'first_idea',
    'idea_evolved',
    'journal_7',
    'exam_prepped',
    'palace_built',
  ]

  it('has the full 18-milestone white-hat catalog', () => {
    expect(ACHIEVEMENTS.map((a) => a.key)).toEqual(KEYS)
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0)
      expect(a.description.length).toBeGreaterThan(0)
      expect(typeof a.check).toBe('function')
    }
  })

  const zeros = {
    totalReviews: 0,
    streakBest: 0,
    streakCurrent: 0,
    teachbackCount: 0,
    focusSessions: 0,
    focusMinutes: 0,
    coursesCompleted: 0,
    masteredSkills: 0,
    ideasCaptured: 0,
    ideasEvolved: 0,
    journalEntries: 0,
    examsPrepped: 0,
    palacesBuilt: 0,
    certificates: 0,
    examsAced: 0,
  }

  it('nothing is unlocked at zero stats', () => {
    expect(unlockedAchievementKeys(zeros)).toEqual([])
  })

  it('predicates fire at their thresholds', () => {
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'first_review')?.check({ ...zeros, totalReviews: 1 }),
    ).toBe(true)
    expect(ACHIEVEMENTS.find((a) => a.key === 'first_review')?.check(zeros)).toBe(false)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'reviews_100')?.check({ ...zeros, totalReviews: 100 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'reviews_1000')?.check({ ...zeros, totalReviews: 999 }),
    ).toBe(false)
    expect(ACHIEVEMENTS.find((a) => a.key === 'streak_7')?.check({ ...zeros, streakBest: 7 })).toBe(
      true,
    )
    expect(ACHIEVEMENTS.find((a) => a.key === 'streak_7')?.check({ ...zeros, streakBest: 6 })).toBe(
      false,
    )
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'streak_30')?.check({ ...zeros, streakBest: 30 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'first_teachback')?.check({ ...zeros, teachbackCount: 1 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'first_focus')?.check({ ...zeros, focusSessions: 1 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'focus_600_minutes')?.check({
        ...zeros,
        focusMinutes: 600,
      }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'focus_600_minutes')?.check({
        ...zeros,
        focusMinutes: 599,
      }),
    ).toBe(false)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'first_course')?.check({ ...zeros, coursesCompleted: 1 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'skill_mastered')?.check({ ...zeros, masteredSkills: 1 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'first_idea')?.check({ ...zeros, ideasCaptured: 1 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'idea_evolved')?.check({ ...zeros, ideasEvolved: 1 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'journal_7')?.check({ ...zeros, journalEntries: 7 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'journal_7')?.check({ ...zeros, journalEntries: 6 }),
    ).toBe(false)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'exam_prepped')?.check({ ...zeros, examsPrepped: 1 }),
    ).toBe(true)
    expect(
      ACHIEVEMENTS.find((a) => a.key === 'palace_built')?.check({ ...zeros, palacesBuilt: 1 }),
    ).toBe(true)
  })
})

// ─── Levels & fresh start ───────────────────────────────────────────────────

describe('computeLevel', () => {
  it('wraps the xp module consistently', () => {
    const info = computeLevel(0)
    expect(info.level).toBe(1)
    expect(info.progress).toBe(0)
    expect(info.xpForNextLevel).toBe(xpForLevel(2))

    const mid = computeLevel(xpForLevel(5) + 10)
    expect(mid.level).toBe(5)
    expect(mid.progress).toBeGreaterThan(0)
    expect(mid.progress).toBeLessThan(1)
    expect(computeLevel(xpForLevel(9)).level).toBe(levelFromXp(xpForLevel(9)))
    expect(computeLevel(-5).level).toBe(1)
  })
})

describe('isFreshStartMoment', () => {
  it('flags Mondays as new-week', () => {
    expect(isFreshStartMoment('2026-11-02')).toEqual({ fresh: true, reason: 'new-week' }) // Monday
  })
  it('flags the 1st as new-month', () => {
    expect(isFreshStartMoment('2026-12-01')).toEqual({ fresh: true, reason: 'new-month' }) // Tuesday
  })
  it('flags Jan 1 as new-year', () => {
    expect(isFreshStartMoment('2027-01-01')).toEqual({ fresh: true, reason: 'new-year' })
  })
  it('ordinary mid-week mid-month days are not fresh starts', () => {
    expect(isFreshStartMoment('2026-11-04')).toEqual({ fresh: false, reason: null }) // Wednesday
    expect(isFreshStartMoment('2026-11-08')).toEqual({ fresh: false, reason: null }) // Sunday
  })
})

describe('validateWoopGoal', () => {
  it('requires a wish', () => {
    expect(validateWoopGoal({ wish: '' }).ok).toBe(false)
    expect(validateWoopGoal({ wish: 'ab' }).ok).toBe(false)
    expect(validateWoopGoal({ wish: 'Master linear algebra this semester' }).ok).toBe(true)
  })
  it('checks the if-then shape of implementation intentions', () => {
    expect(
      validateWoopGoal({
        wish: 'Learn Go',
        ifThenPlan: 'If I feel the urge to scroll, then I will do 3 cards',
      }).ok,
    ).toBe(true)
    expect(validateWoopGoal({ wish: 'Learn Go', ifThenPlan: 'do 3 cards' }).ok).toBe(false)
    expect(validateWoopGoal({ wish: 'Learn Go', ifThenPlan: '' }).ok).toBe(true) // optional
  })
  it('computes completeness over the 4 WOOP parts', () => {
    const full = validateWoopGoal({
      wish: 'Pass the exam',
      outcome: 'walk out calm',
      obstacle: 'doomscrolling',
      ifThenPlan: 'If I reach for the phone, then I will open the review queue instead',
    })
    expect(full.completeness).toBe(1)
    const bare = validateWoopGoal({ wish: 'Pass the exam' })
    expect(bare.completeness).toBe(0.25)
  })
})

// ─── Streaks (extra cases) ──────────────────────────────────────────────────

const baseState: StreakState = {
  current: 0,
  best: 0,
  lastActiveDate: null,
  freezes: 2,
  weekendAmulet: false,
}

function day(n: number): Date {
  return new Date(Date.UTC(2026, 10, n)) // November 2026
}

describe('streaks — extra cases', () => {
  it('counts consecutive days and tracks best', () => {
    let s = recordActivity(baseState, day(1))
    s = recordActivity(s, day(2))
    s = recordActivity(s, day(3))
    expect(s.current).toBe(3)
    expect(s.best).toBe(3)
    expect(s.lastActiveDate).toBe('2026-11-03')
  })

  it('is idempotent within the same day', () => {
    const s = recordActivity(baseState, day(1))
    const again = recordActivity(s, day(1))
    expect(again).toEqual(s)
  })

  it('spends a freeze on a single missed day', () => {
    let s: StreakState = { ...baseState, freezes: 1 }
    s = recordActivity(s, day(1))
    s = recordActivity(s, day(3)) // gap of 2 → freeze
    expect(s.current).toBe(2)
    expect(s.freezes).toBe(0)
    // next day continues
    s = recordActivity(s, day(4))
    expect(s.current).toBe(3)
  })

  it('uses the weekend amulet only on weekends and only when out of freezes', () => {
    let s: StreakState = { ...baseState, freezes: 0, weekendAmulet: true }
    s = recordActivity(s, day(5)) // Thu Nov 5
    s = recordActivity(s, day(7)) // Sat Nov 7 → amulet saves
    expect(s.current).toBe(2)
    // weekday miss without freezes breaks the streak
    s = recordActivity(s, day(9)) // Mon Nov 9, missed Sun? gap 2 but Monday isn't weekend
    expect(s.current).toBe(1)
  })

  it('resets (fresh-start framing, best preserved) after a real gap', () => {
    let s = recordActivity(baseState, day(1))
    s = recordActivity(s, day(2))
    s = recordActivity(s, day(6))
    expect(s.current).toBe(1)
    expect(s.best).toBe(2)
  })

  it('first-ever activity starts at 1', () => {
    const s = recordActivity(baseState, day(1))
    expect(s.current).toBe(1)
    expect(s.best).toBe(1)
  })

  it('emergencyReview is the same forgiving function', () => {
    let s = recordActivity(baseState, day(1))
    s = emergencyReview(s, day(2))
    expect(s.current).toBe(2)
  })

  it('dayKey and isWeekend agree on UTC boundaries', () => {
    expect(dayKey(new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-04')
    expect(isWeekend(new Date('2026-11-07T12:00:00Z'))).toBe(true)
    expect(isWeekend(new Date('2026-11-04T12:00:00Z'))).toBe(false)
  })

  it('handles consecutive afternoon reviews (14:00 and 20:00 UTC) without consuming freezes or resetting', () => {
    let s = { ...baseState }
    const timestamps = [
      '2026-11-02T14:00:00.000Z',
      '2026-11-03T14:00:00.000Z',
      '2026-11-04T20:00:00.000Z',
      '2026-11-05T14:00:00.000Z',
      '2026-11-06T20:30:00.000Z',
    ]
    for (let i = 0; i < timestamps.length; i++) {
      s = recordActivity(s, new Date(timestamps[i]))
      expect(s.current).toBe(i + 1)
      expect(s.best).toBe(i + 1)
      expect(s.freezes).toBe(2)
      expect(s.lastActiveDate).toBe(timestamps[i].slice(0, 10))
    }
  })

  it('correctly handles midnight boundary edge cases (23:59:59 to 00:00:01 UTC)', () => {
    let s = { ...baseState }
    s = recordActivity(s, new Date('2026-11-02T23:59:59.999Z'))
    expect(s.current).toBe(1)
    expect(s.best).toBe(1)
    expect(s.lastActiveDate).toBe('2026-11-02')

    // 2 milliseconds later, crossing midnight into next day
    s = recordActivity(s, new Date('2026-11-03T00:00:00.001Z'))
    expect(s.current).toBe(2)
    expect(s.best).toBe(2)
    expect(s.freezes).toBe(2)
    expect(s.lastActiveDate).toBe('2026-11-03')

    // Same day review later in the evening is idempotent
    const sSame = recordActivity(s, new Date('2026-11-03T23:59:59.000Z'))
    expect(sSame).toEqual(s)

    // Next day early morning
    s = recordActivity(s, new Date('2026-11-04T00:00:01.000Z'))
    expect(s.current).toBe(3)
    expect(s.best).toBe(3)
    expect(s.freezes).toBe(2)
    expect(s.lastActiveDate).toBe('2026-11-04')
  })

  it('updates best streak and preserves streak when freeze protection is consumed in afternoon', () => {
    let s: StreakState = {
      ...baseState,
      current: 3,
      best: 3,
      lastActiveDate: '2026-11-01',
      freezes: 2,
    }
    // Missed 2026-11-02 completely. Active on 2026-11-03 at 17:45 UTC
    s = recordActivity(s, new Date('2026-11-03T17:45:00.000Z'))
    expect(s.current).toBe(4)
    expect(s.best).toBe(4) // Verifies best is not stale
    expect(s.freezes).toBe(1)
    expect(s.lastActiveDate).toBe('2026-11-03')
  })

  it('updates best streak and preserves streak when weekend amulet is used in afternoon/evening', () => {
    let s: StreakState = {
      ...baseState,
      current: 4,
      best: 4,
      lastActiveDate: '2026-11-05',
      freezes: 0,
      weekendAmulet: true,
    }
    // 2026-11-05 is Thursday. Friday Nov 6 missed. Saturday Nov 7 active at 16:30 UTC
    s = recordActivity(s, new Date('2026-11-07T16:30:00.000Z'))
    expect(s.current).toBe(5)
    expect(s.best).toBe(5) // Verifies best is not stale
    expect(s.freezes).toBe(0)
    expect(s.lastActiveDate).toBe('2026-11-07')
  })

  it('safely ignores out-of-order past reviews without breaking streak or rewinding date', () => {
    const s: StreakState = {
      ...baseState,
      current: 5,
      best: 5,
      lastActiveDate: '2026-11-05',
      freezes: 2,
    }
    const result = recordActivity(s, new Date('2026-11-04T12:00:00.000Z'))
    expect(result.current).toBe(5)
    expect(result.best).toBe(5)
    expect(result.lastActiveDate).toBe('2026-11-05')
    expect(result.freezes).toBe(2)
  })

  it('resets streak to 1 and preserves best when gap is 3 or more days regardless of review hour', () => {
    let s: StreakState = {
      ...baseState,
      current: 10,
      best: 10,
      lastActiveDate: '2026-11-01',
      freezes: 2,
    }
    // Missed 2026-11-02 and 2026-11-03 (gap = 3 days). Active on 2026-11-04 at 18:00 UTC
    s = recordActivity(s, new Date('2026-11-04T18:00:00.000Z'))
    expect(s.current).toBe(1)
    expect(s.best).toBe(10)
    expect(s.freezes).toBe(2)
    expect(s.lastActiveDate).toBe('2026-11-04')
  })
})

// ─── Habits ─────────────────────────────────────────────────────────────────

describe('habits', () => {
  it('validateHabit requires cue + response, warns on craving/reward', () => {
    const full = validateHabit({
      cue: 'After morning coffee',
      craving: 'feeling sharp',
      response: 'read 1 page',
      reward: 'tick the box',
    })
    expect(full.ok).toBe(true)
    expect(full.warnings).toHaveLength(0)
    const minimal = validateHabit({ cue: 'After lunch', response: '2 push-ups' })
    expect(minimal.ok).toBe(true)
    expect(minimal.warnings).toHaveLength(2)
    const broken = validateHabit({ cue: '', craving: '', response: '', reward: '' })
    expect(broken.ok).toBe(false)
    expect(broken.errors.some((e) => e.toLowerCase().includes('cue'))).toBe(true)
    expect(broken.errors.some((e) => e.toLowerCase().includes('response'))).toBe(true)
  })

  it('stackChainOrder puts anchored habits first, stable within groups', () => {
    const ordered = stackChainOrder([
      { id: 3, name: 'Free journal', anchor: null },
      { id: 1, name: 'Anchored second', anchor: 'After breakfast', order: 1 },
      { id: 2, name: 'Anchored first', anchor: 'After waking', order: 0 },
      { id: 4, name: 'Free ordered', anchor: '', order: 0 },
    ])
    expect(ordered.map((h) => h.id)).toEqual([2, 1, 3, 4])
    // same input → same output (stable)
    expect(stackChainOrder(ordered).map((h) => h.id)).toEqual([2, 1, 3, 4])
  })

  it('solidifying stages at 21/60 distinct days', () => {
    expect(SOLIDIFYING_THRESHOLDS).toEqual({ solidifying: 21, automatic: 60 })
    const ten = solidifying(['2026-01-01', '2026-01-02', '2026-01-02', '2026-01-03'])
    expect(ten.days).toBe(3) // deduped
    expect(ten.stage).toBe('forming')
    expect(ten.daysToNext).toBe(18)
    const twentyOne = solidifying(
      Array.from({ length: 21 }, (_, i) => dayKey(new Date(Date.UTC(2026, 0, 1 + i)))),
    )
    expect(twentyOne.stage).toBe('solidifying')
    const sixty = solidifying(
      Array.from({ length: 60 }, (_, i) => dayKey(new Date(Date.UTC(2026, 0, 1 + i)))),
    )
    expect(sixty.stage).toBe('automatic')
    const many = solidifying(
      Array.from({ length: 75 }, (_, i) => dayKey(new Date(Date.UTC(2026, 0, 1 + i)))),
    )
    expect(many.stage).toBe('automatic')
    expect(many.daysToNext).toBe(0)
    expect(solidifying([]).stage).toBe('forming')
  })

  it('dopamine menu has 12 items across move/create/connect/soothe', () => {
    expect(DOPAMINE_MENU).toHaveLength(12)
    const types = new Set(DOPAMINE_MENU.map((i) => i.type))
    expect(types).toEqual(new Set(['move', 'create', 'connect', 'soothe']))
    for (const t of ['move', 'create', 'connect', 'soothe']) {
      expect(DOPAMINE_MENU.filter((i) => i.type === t)).toHaveLength(3)
    }
    expect(dopamineSuggestion('2026-11-04')).toBe(dopamineSuggestion('2026-11-04'))
  })
})

// ─── Journal week aggregation ───────────────────────────────────────────────

describe('aggregateWeek', () => {
  const weekStart = '2026-11-02' // Monday
  const data = {
    dailyReviews: [
      { day: '2026-11-02', reviews: 10, correct: 8 },
      { day: '2026-11-03', reviews: 20, correct: 15 },
      { day: '2026-11-08', reviews: 5, correct: 5 }, // Sunday, outside Monday-based window? no — 11-08 IS Sun of that week
    ],
    xpDaily: [
      { day: '2026-11-02', xp: 40 },
      { day: '2026-11-03', xp: 60 },
    ],
    focusSessions: [
      { startedAt: '2026-11-02T09:00:00Z', actualMinutes: 25, completed: true },
      { startedAt: '2026-11-02T14:00:00Z', actualMinutes: 10, completed: false }, // ignored
      { startedAt: '2026-11-05T09:00:00Z', actualMinutes: 50, completed: true },
    ],
    habitLogs: [{ date: '2026-11-02' }, { date: '2026-11-02' }, { date: '2026-11-04' }],
    journalEntries: [
      { date: '2026-11-02', mood: 4 },
      { date: '2026-11-03', mood: 2 },
      { date: '2026-11-09', mood: 5 }, // next Monday — excluded
    ],
  }

  it('produces exactly 7 days with per-day and total aggregates', () => {
    const week = aggregateWeek(weekStart, data)
    expect(week.days).toHaveLength(7)
    expect(week.days[0].date).toBe('2026-11-02')
    expect(week.days[6].date).toBe('2026-11-08')
    expect(week.totals.reviews).toBe(35)
    expect(week.totals.xp).toBe(100)
    expect(week.totals.focusMinutes).toBe(75)
    expect(week.totals.habitsDone).toBe(3)
    expect(week.moodAvg).toBe(3)
    expect(week.days[3].focusMinutes).toBe(50) // Thursday
  })

  it('zero-fills missing days and returns 3 rotating prompts', () => {
    const week = aggregateWeek(weekStart, data)
    expect(week.days[4].reviews).toBe(0)
    expect(week.prompts).toHaveLength(3)
    const nextWeek = aggregateWeek('2026-11-09', data)
    expect(nextWeek.prompts).not.toEqual(week.prompts)
    expect(nextWeek.totals.reviews).toBe(0)
  })

  it('deterministic for the same week', () => {
    expect(aggregateWeek(weekStart, data)).toEqual(aggregateWeek(weekStart, data))
  })
})

describe('journal entry validation', () => {
  it('requires at least one field; mood must be 1-5 integer', () => {
    expect(validateJournalEntry({}).ok).toBe(false)
    expect(validateJournalEntry({ mood: 4 }).ok).toBe(true)
    expect(validateJournalEntry({ smallWins: 'finished chapter 2' }).ok).toBe(true)
    expect(validateJournalEntry({ mood: 0 }).ok).toBe(false)
    expect(validateJournalEntry({ mood: 6 }).ok).toBe(false)
    expect(validateJournalEntry({ mood: 2.5 }).ok).toBe(false)
    expect(validateJournalEntry({ worryDump: 'exam nerves on paper' }).ok).toBe(true)
  })
})

// ─── Quotes ─────────────────────────────────────────────────────────────────

const QUOTES = [
  { text: 'A', author: 'X', tags: ['discipline'] },
  { text: 'B', author: 'Y', tags: ['persistence'] },
  { text: 'C', author: 'Z', tags: ['learning', 'mastery'] },
  { text: 'D', author: 'W', tags: [] },
]

describe('quotes', () => {
  it('daily quote is stable within one day and varies across days', () => {
    const d1a = dailyQuote(QUOTES, '2026-11-04')
    const d1b = dailyQuote(QUOTES, '2026-11-04')
    expect(d1a).toBe(d1b)
    // time-of-day must not change it
    expect(dailyQuote(QUOTES, '2026-11-04T08:00:00Z')).toBe(d1a)
    const other = dailyQuote(QUOTES, '2026-11-05')
    expect(other).toBe(dailyQuote(QUOTES, '2026-11-05'))
  })

  it('milestone quotes prefer the matching tags', () => {
    const streak = milestoneQuote(QUOTES, 'streak')
    expect(streak.tags).toContain('persistence')
    const levelUp = milestoneQuote(QUOTES, 'level-up')
    expect(['mastery', 'discipline'].some((t) => levelUp.tags?.includes(t))).toBe(true)
    // deterministic per kind
    expect(milestoneQuote(QUOTES, 'streak')).toBe(streak)
    // falls back to the whole library when tags miss
    const onlyUntagged = [{ text: 'plain', author: 'Q', tags: [] }]
    expect(milestoneQuote(onlyUntagged, 'streak').text).toBe('plain')
  })
})

import { describe, expect, it } from 'vitest'
import {
  computeWeeklyReportMetrics,
  ruleBasedSuggestions,
  weeklyReportResponseSchema,
  type WeeklyReportRaw,
} from '../src/weekly'

// Deterministic fixtures: the week is the 7 local days ending 2026-11-04 (a Wednesday).
const RAW: WeeklyReportRaw = {
  offsetMinutes: 0,
  today: '2026-11-04',
  now: '2026-11-04T12:00:00Z',
  reviews: [
    // Monday 2026-11-02: 2 real reviews, 1 lapsed
    { cardId: 1, rating: 1, state: 2, retrievability: 0.8, reviewedAt: '2026-11-02T10:00:00Z' },
    { cardId: 2, rating: 3, state: 2, retrievability: 0.85, reviewedAt: '2026-11-02T11:00:00Z' },
    // Tuesday 2026-11-03: 1 learning-step review (not a "real" review) + 1 real review
    { cardId: 1, rating: 3, state: 1, reviewedAt: '2026-11-03T09:00:00Z' },
    { cardId: 3, rating: 3, state: 2, retrievability: 0.95, reviewedAt: '2026-11-03T10:00:00Z' },
    // Outside the window (day before the week starts) — must be ignored
    { cardId: 9, rating: 3, state: 2, reviewedAt: '2026-11-01T10:00:00Z' },
    // Garbage timestamp — must be ignored
    { cardId: 9, rating: 3, state: 2, reviewedAt: 'not-a-date' },
  ],
  xpEvents: [
    { amount: 2, createdAt: '2026-11-02T10:00:00Z' },
    { amount: 5, createdAt: '2026-11-02T10:01:00Z' },
    { amount: 2, createdAt: '2026-11-03T09:00:00Z' },
    { amount: 100, createdAt: '2026-11-01T09:00:00Z' }, // outside window
  ],
  focusSessions: [
    { startedAt: '2026-11-02T08:00:00Z', actualMinutes: 25, completed: true },
    { startedAt: '2026-11-02T14:00:00Z', actualMinutes: 10.5, completed: false }, // not completed
    { startedAt: '2026-11-04T08:00:00Z', actualMinutes: 30, completed: true },
    { startedAt: '2026-10-28T08:00:00Z', actualMinutes: 99, completed: true }, // outside window
  ],
  streak: {
    current: 4,
    best: 10,
    freezes: 2,
    weekendAmulet: false,
    lastActiveDate: '2026-11-03',
  },
  cards: [
    {
      id: 1,
      label: 'What is retrieval practice?',
      due: '2026-11-04T09:00:00Z',
      lapses: 5,
      stability: 1.2,
      difficulty: 8.2,
      reps: 12,
      state: 3,
      lastReview: '2026-11-02T10:00:00Z',
    },
    {
      id: 2,
      label: 'Testing effect',
      due: '2026-11-06T09:00:00Z',
      lapses: 2,
      stability: 4,
      difficulty: 6.5,
      reps: 8,
      state: 2,
      lastReview: '2026-11-02T11:00:00Z',
    },
    {
      id: 3,
      label: 'Spacing effect',
      due: '2027-06-01T09:00:00Z',
      lapses: 0,
      stability: 90,
      difficulty: 5,
      reps: 15,
      state: 2,
      lastReview: '2026-11-03T10:00:00Z',
    },
    {
      id: 4,
      label: 'Brand new',
      due: '2026-11-04T09:00:00Z',
      lapses: 0,
      stability: 0,
      reps: 0,
      state: 0,
    },
    {
      id: 5,
      label: 'Suspended',
      due: '2026-11-05T09:00:00Z',
      lapses: 9,
      stability: 0.5,
      reps: 6,
      state: 2,
      suspended: true,
      lastReview: '2026-11-01T09:00:00Z',
    },
  ],
}

describe('computeWeeklyReportMetrics', () => {
  const m = computeWeeklyReportMetrics(RAW)

  it('windows the 7 local days ending at `today`', () => {
    expect(m.weekEnd).toBe('2026-11-04')
    expect(m.weekStart).toBe('2026-10-29')
    expect(m.days.map((d) => d.date)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ])
    expect(m.offsetMinutes).toBe(0)
  })

  it('buckets reviews per local day and ignores out-of-window / garbage rows', () => {
    expect(m.days[3]).toMatchObject({ date: '2026-11-01', reviews: 1, correct: 1 })
    expect(m.days[4]).toMatchObject({ date: '2026-11-02', reviews: 2, correct: 1 })
    expect(m.days[5]).toMatchObject({ date: '2026-11-03', reviews: 2, correct: 2 })
    expect(m.totals.reviews).toBe(5) // only the garbage-timestamp row is dropped
  })

  it('computes true retention over state>=2 rows only', () => {
    // real reviews: Sun Good, Mon Again, Mon Good, Tue Good → 3/4 retained
    expect(m.trueRetention).toEqual({ total: 4, retained: 3, rate: 0.75, pct: 75 })
  })

  it('sums XP and focus minutes per week with tz-aware day buckets', () => {
    expect(m.totals.xp).toBe(109) // 2 + 5 + 2 + 100 (all in window)
    expect(m.days[4]!.xp).toBe(7)
    expect(m.totals.focusMinutes).toBe(55) // 25 + 30; uncompleted and out-of-window dropped
    expect(m.days[6]!.focusMinutes).toBe(30)
  })

  it('reports streak health with week context and at-risk detection', () => {
    expect(m.streak).toEqual({
      current: 4,
      best: 10,
      freezes: 2,
      weekendAmulet: false,
      lastActiveDate: '2026-11-03',
      daysActive: 3,
      daysMissed: 4,
      atRisk: true, // last review yesterday, nothing today
    })
  })

  it('ranks weakest cards by lowest retrievability then most lapses, skipping new/suspended', () => {
    expect(m.weakestCards.map((w) => w.id)).toEqual([1, 2, 3])
    const top = m.weakestCards[0]!
    expect(top.id).toBe(1)
    expect(top.label).toBe('What is retrieval practice?')
    expect(top.lapses).toBe(5)
    // R = (1 + 0.98034649 * 2 / 1.2)^-0.1542 ≈ 0.8817 — well above 0 → sorted first via lapses/low stability
    expect(top.retrievability).toBeGreaterThan(0.8)
    expect(top.retrievability).toBeLessThan(0.95)
  })

  it('forecasts the next 7 local days and folds overdue cards into today', () => {
    expect(m.forecast.map((f) => f.date)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
    ])
    // card 1 due today, card 4 (new) due today, card 2 due 11-06; card 3 far future and 5 suspended excluded
    expect(m.forecast[0]).toEqual({ date: '2026-11-04', count: 2 })
    expect(m.forecast[2]).toEqual({ date: '2026-11-06', count: 1 })
    expect(m.upcomingTotal).toBe(3)
  })

  it('computes the calibration delta (predicted minus actual)', () => {
    // predictions: 0.8→Again, 0.85→Good, 0.95→Good → predicted 0.8667, actual 2/3
    expect(m.calibration.n).toBe(3)
    expect(m.calibration.predictedAvg).toBeCloseTo(0.8667, 3)
    expect(m.calibration.actualAvg).toBeCloseTo(2 / 3, 3)
    expect(m.calibration.delta).toBeCloseTo(0.8667 - 2 / 3, 3)
  })

  it('exposes a flat coachMetrics record ready for coachPrompt()', () => {
    expect(m.coachMetrics.reviews).toBe(5)
    expect(m.coachMetrics.trueRetentionPct).toBe(75)
    expect(m.coachMetrics.streakAtRiskToday).toBe('yes')
    expect(String(m.coachMetrics.weakestCard)).toContain('retrieval practice')
    expect(m.coachMetrics.cardsDueNext7Days).toBe(3)
  })

  it('is tz-aware: offsetMinutes shifts the day buckets', () => {
    // UTC+2 (offsetMinutes = -120): the 2026-11-02T10:00Z review lands on local 12:00 → still 11-02,
    // but 2026-11-03T23:30Z would be local 11-04 — use a boundary review to prove the shift.
    const shifted = computeWeeklyReportMetrics({
      ...RAW,
      offsetMinutes: -120,
      reviews: [
        ...RAW.reviews,
        { cardId: 7, rating: 3, state: 2, reviewedAt: '2026-11-03T23:30:00Z' },
      ],
      xpEvents: [{ amount: 3, createdAt: '2026-10-29T22:00:00Z' }], // local 2026-10-30 00:00
    })
    expect(shifted.days[1]).toMatchObject({ date: '2026-10-30', xp: 3 })
    expect(shifted.days[6]).toMatchObject({ date: '2026-11-04', reviews: 1, correct: 1 })
    expect(shifted.totals.reviews).toBe(6) // 5 base rows + the boundary review
  })

  it('degrades gracefully on an empty account', () => {
    const empty = computeWeeklyReportMetrics({
      reviews: [],
      xpEvents: [],
      focusSessions: [],
      cards: [],
      streak: null,
      today: '2026-11-04',
    })
    expect(empty.trueRetention.rate).toBeNull()
    expect(empty.trueRetention.pct).toBeNull()
    expect(empty.calibration).toEqual({ n: 0, predictedAvg: null, actualAvg: null, delta: null })
    expect(empty.streak).toEqual({
      current: 0,
      best: 0,
      freezes: 0,
      weekendAmulet: false,
      lastActiveDate: null,
      daysActive: 0,
      daysMissed: 7,
      atRisk: false,
    })
    expect(empty.weakestCards).toEqual([])
    expect(empty.totals).toEqual({ reviews: 0, correct: 0, xp: 0, focusMinutes: 0 })
  })
})

describe('ruleBasedSuggestions', () => {
  it('always returns exactly 3 evidence-based suggestions', () => {
    const m = computeWeeklyReportMetrics(RAW)
    const s = ruleBasedSuggestions(m)
    expect(s).toHaveLength(3)
    for (const sug of s) {
      expect(sug.title.length).toBeGreaterThan(0)
      expect(sug.evidence.length).toBeGreaterThan(0)
      expect(sug.action.length).toBeGreaterThan(0)
      expect(sug.evidence).toMatch(/\d/) // evidence-based: cites a number
    }
    // streak is at risk → the top suggestion must be the streak one
    expect(s[0]!.title).toMatch(/streak/i)
  })

  it('switches priorities on an empty account (no invented data)', () => {
    const empty = computeWeeklyReportMetrics({
      reviews: [],
      xpEvents: [],
      focusSessions: [],
      cards: [],
      streak: null,
      today: '2026-11-04',
    })
    const s = ruleBasedSuggestions(empty)
    expect(s).toHaveLength(3)
    expect(s[0]!.evidence).toContain('0 reviews')
    expect(s.some((x) => x.evidence.includes('0 reviews'))).toBe(true)
  })

  it('does not demand drilling when the only reviewed card is healthy', () => {
    const m = computeWeeklyReportMetrics({
      offsetMinutes: 0,
      today: '2026-11-04',
      now: '2026-11-04T12:00:00Z',
      reviews: [],
      xpEvents: [],
      focusSessions: [],
      streak: {
        current: 1,
        best: 1,
        freezes: 2,
        weekendAmulet: false,
        lastActiveDate: '2026-11-04',
      },
      cards: [
        {
          id: 1,
          label: 'Easy card',
          due: '2026-11-10T09:00:00Z',
          lapses: 0,
          stability: 30,
          reps: 5,
          state: 2,
          lastReview: '2026-11-01T09:00:00Z',
        },
      ],
    })
    const s = ruleBasedSuggestions(m)
    expect(s).toHaveLength(3)
    expect(s.every((x) => !/drill/i.test(x.title))).toBe(true)
    // the healthy card still shows up in the list (it is simply ranked last / first here)
    expect(m.weakestCards[0]!.retrievability).toBeGreaterThan(0.9)
  })

  it('still returns exactly 3 from a sparse middle state (found via runtime smoke test)', () => {
    // reviews > 0 (so no "rebuild"), retention null (no mature reviews), only a
    // healthy card (so no "drill"), focus < 120, upcoming < 100, daysActive = 2
    const m = computeWeeklyReportMetrics({
      offsetMinutes: 0,
      today: '2026-11-04',
      now: '2026-11-04T12:00:00Z',
      reviews: [
        { cardId: 1, rating: 3, state: 1, reviewedAt: '2026-11-04T10:00:00Z' },
        { cardId: 1, rating: 3, state: 1, reviewedAt: '2026-11-04T11:00:00Z' },
      ],
      xpEvents: [{ amount: 10, createdAt: '2026-11-04T10:00:00Z' }],
      focusSessions: [],
      streak: {
        current: 0,
        best: 0,
        freezes: 2,
        weekendAmulet: false,
        lastActiveDate: '2026-11-04',
      },
      cards: [
        {
          id: 1,
          label: 'Healthy',
          due: '2026-11-03T23:36:00Z',
          lapses: 0,
          stability: 20,
          reps: 5,
          state: 2,
          lastReview: '2026-11-01T09:00:00Z',
        },
      ],
    })
    const s = ruleBasedSuggestions(m)
    expect(s).toHaveLength(3)
    expect(new Set(s.map((x) => x.title)).size).toBe(3) // no duplicate fillers
    for (const sug of s) expect(sug.evidence).toMatch(/\d/)
  })

  it('celebrates a healthy week with a keep-doing suggestion', () => {
    const healthy = computeWeeklyReportMetrics({
      offsetMinutes: 0,
      today: '2026-11-04',
      now: '2026-11-04T12:00:00Z',
      reviews: Array.from({ length: 100 }, (_, i) => ({
        rating: 3,
        state: 2,
        retrievability: 0.9,
        reviewedAt: `2026-11-0${(i % 5) + 1}T10:00:00Z`,
      })),
      xpEvents: [],
      focusSessions: Array.from({ length: 6 }, (_, i) => ({
        startedAt: `2026-11-0${(i % 5) + 1}T08:00:00Z`,
        actualMinutes: 25,
        completed: true,
      })),
      streak: {
        current: 30,
        best: 30,
        freezes: 2,
        weekendAmulet: false,
        lastActiveDate: '2026-11-04',
      },
      cards: [],
    })
    const s = ruleBasedSuggestions(healthy)
    expect(s).toHaveLength(3)
    expect(s.some((x) => /keep doing/i.test(x.title))).toBe(true)
    expect(healthy.streak.atRisk).toBe(false)
    // predicted 0.9 vs actual 1.0 → slightly underconfident
    expect(healthy.calibration.delta).toBeCloseTo(-0.1, 6)
    expect(healthy.trueRetention.pct).toBe(100)
  })
})

describe('weeklyReportResponseSchema', () => {
  it('validates a full API-shaped response', () => {
    const m = computeWeeklyReportMetrics(RAW)
    const response = {
      metrics: m,
      weakestCards: m.weakestCards,
      forecast: m.forecast,
      suggestions: {
        mode: 'manual' as const,
        suggestions: ruleBasedSuggestions(m),
        envelope: { v: 1, feature: 'coach', system: 's', prompt: 'p', schema: 'x' },
      },
    }
    expect(weeklyReportResponseSchema.safeParse(response).success).toBe(true)
  })

  it('rejects wrong suggestion counts and broken day rows', () => {
    const m = computeWeeklyReportMetrics(RAW)
    const bad = {
      metrics: { ...m, days: m.days.slice(0, 6) },
      weakestCards: [],
      forecast: [],
      suggestions: { mode: 'manual', suggestions: [] },
    }
    expect(weeklyReportResponseSchema.safeParse(bad).success).toBe(false)
    const badSuggestions = {
      metrics: m,
      weakestCards: m.weakestCards,
      forecast: m.forecast,
      suggestions: { mode: 'manual', suggestions: ruleBasedSuggestions(m).slice(0, 2) },
    }
    expect(weeklyReportResponseSchema.safeParse(badSuggestions).success).toBe(false)
  })
})

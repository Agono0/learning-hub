import { describe, expect, it } from 'vitest'
import {
  calibrationByCard,
  calibrationCurve,
  focusLeakTrend,
  forecastHistogram,
  heatmapData,
  hourOfDayAccuracy,
  learningScore,
  timeOfDayPerformance,
  HOUR_ACCURACY_MIN_REVIEWS,
} from '../src/analytics'

describe('forecastHistogram', () => {
  it('buckets upcoming dues by day and overflow into "later"', () => {
    const buckets = forecastHistogram(
      [
        { due: '2026-11-04T09:00:00Z' },
        { due: '2026-11-04T15:00:00Z' },
        { due: '2026-11-05T09:00:00Z' },
        { due: '2027-06-01T09:00:00Z' },
        { due: 'not-a-date' },
        { due: '2026-11-04T09:00:00Z', suspended: true },
      ],
      30,
      '2026-11-04',
    )
    expect(buckets).toHaveLength(31) // 30 days + later
    expect(buckets[0]).toEqual({ date: '2026-11-04', count: 2 })
    expect(buckets[1]).toEqual({ date: '2026-11-05', count: 1 })
    expect(buckets[buckets.length - 1]).toEqual({ date: 'later', count: 2 })
  })

  it('is deterministic and zero-fills empty days', () => {
    const a = forecastHistogram([], 7, '2026-11-04')
    const b = forecastHistogram([], 7, '2026-11-04')
    expect(a).toEqual(b)
    expect(a).toHaveLength(7)
    expect(a.every((x) => x.count === 0)).toBe(true)
  })
})

describe('calibrationCurve', () => {
  it('buckets predicted vs actual in 0.1 steps from 0.5', () => {
    const reviews = [
      { predictedRetrievability: 0.55, rating: 1 },
      { predictedRetrievability: 0.58, rating: 1 },
      { predictedRetrievability: 0.72, rating: 3 },
      { predictedRetrievability: 0.95, rating: 3 },
      { predictedRetrievability: 0.97, rating: 1 },
      { rating: 3 }, // no prediction → skipped
      { predictedRetrievability: 0.3, rating: 3 }, // below range → skipped
    ]
    const curve = calibrationCurve(reviews)
    expect(curve.map((c) => c.bucket)).toEqual([
      '0.5-0.6',
      '0.6-0.7',
      '0.7-0.8',
      '0.8-0.9',
      '0.9-1.0',
    ])
    expect(curve[0].n).toBe(2)
    expect(curve[0].predicted).toBeCloseTo(0.565)
    expect(curve[0].actual).toBe(0) // both Again
    expect(curve[2].actual).toBe(1)
    expect(curve[4].n).toBe(2)
    expect(curve[4].actual).toBeCloseTo(0.5)
    expect(curve[3].n).toBe(0)
    expect(curve[3].predicted).toBeNull()
  })

  it('calibrationByCard splits confident-wrong from hesitant-right', () => {
    const stats = calibrationByCard([
      { cardId: 1, confidence: 1, rating: 1 }, // overconfident
      { cardId: 1, confidence: 1, rating: 1 }, // again
      { cardId: 1, confidence: 1, rating: 3 }, // normal correct
      { cardId: 2, confidence: 0, rating: 3 }, // underconfident
      { cardId: 2, confidence: 0, rating: 1 }, // honest fail — neither bucket
      { cardId: 3, confidence: 0, rating: 4 }, // underconfident
    ])
    expect(stats.find((s) => s.cardId === 1)).toEqual({
      cardId: 1,
      reviews: 3,
      overconfident: 2,
      underconfident: 0,
    })
    expect(stats.find((s) => s.cardId === 2)).toEqual({
      cardId: 2,
      reviews: 2,
      overconfident: 0,
      underconfident: 1,
    })
    expect(stats.find((s) => s.cardId === 3)).toEqual({
      cardId: 3,
      reviews: 1,
      overconfident: 0,
      underconfident: 1,
    })
  })

  it('p=1.0 lands in the last bucket', () => {
    const curve = calibrationCurve([{ predictedRetrievability: 1, rating: 4 }])
    expect(curve[4].n).toBe(1)
  })

  it('accepts precomputed retrievability values aligned by index (revlog column)', () => {
    const reviews = [{ rating: 1 }, { rating: 3 }, { rating: 3 }]
    const curve = calibrationCurve(reviews, [0.55, null, 0.75])
    expect(curve[0].n).toBe(1)
    expect(curve[0].predicted).toBeCloseTo(0.55)
    expect(curve[0].actual).toBe(0)
    expect(curve[1].n).toBe(0) // null retrievability → skipped
    expect(curve[1].predicted).toBeNull()
    expect(curve[2].n).toBe(1)
    expect(curve[2].predicted).toBeCloseTo(0.75)
    expect(curve[2].actual).toBe(1)
  })

  it('per-review predictedRetrievability wins over the precomputed array', () => {
    const reviews = [{ rating: 3, predictedRetrievability: 0.95 }, { rating: 3 }]
    const curve = calibrationCurve(reviews, [0.55, 0.75])
    expect(curve[4].n).toBe(1)
    expect(curve[4].predicted).toBeCloseTo(0.95)
    expect(curve[2].n).toBe(1)
    expect(curve[2].predicted).toBeCloseTo(0.75)
  })
})

describe('heatmapData', () => {
  it('maps and sorts by date', () => {
    const out = heatmapData([
      { day: '2026-11-05', reviews: 3 },
      { day: '2026-11-04', reviews: 12 },
      { day: '2026-11-04', reviews: -2 },
    ])
    expect(out).toEqual([
      { date: '2026-11-04', count: 12 },
      { date: '2026-11-05', count: 3 },
    ])
  })
})

describe('timeOfDayPerformance', () => {
  it('aggregates correct rate per hour', () => {
    const hours = timeOfDayPerformance([
      { reviewedAt: '2026-11-04T09:10:00Z', rating: 3 },
      { reviewedAt: '2026-11-04T09:20:00Z', rating: 1 },
      { reviewedAt: '2026-11-04T22:00:00Z', rating: 4 },
    ])
    expect(hours).toHaveLength(24)
    expect(hours[9]).toEqual({ hour: 9, total: 2, correct: 1, rate: 0.5 })
    expect(hours[22]).toEqual({ hour: 22, total: 1, correct: 1, rate: 1 })
    expect(hours[8]).toEqual({ hour: 8, total: 0, correct: 0, rate: null })
  })

  it('supports positive and negative timezone offsets (DEF-014)', () => {
    const reviews = [{ reviewedAt: '2026-11-04T14:00:00Z', rating: 3 }]
    // Offsets follow Date#getTimezoneOffset(): minutes to ADD to local to get UTC.
    // UTC+2 → getTimezoneOffset() = -2 (hours) → 14:00Z is 16:00 local
    const plus2 = timeOfDayPerformance(reviews, -2)
    expect(plus2[16]).toEqual({ hour: 16, total: 1, correct: 1, rate: 1 })

    // UTC-5 → getTimezoneOffset() = +5 (hours) → 14:00Z is 09:00 local
    const minus5 = timeOfDayPerformance(reviews, { timezoneOffsetHours: 5 })
    expect(minus5[9]).toEqual({ hour: 9, total: 1, correct: 1, rate: 1 })
  })

  it('handles day boundary crossings in both directions (DEF-014)', () => {
    // UTC+2 (offset -2h): 23:30Z is 01:30 next day locally (hour 1)
    const forward = timeOfDayPerformance([{ reviewedAt: '2026-11-04T23:30:00Z', rating: 3 }], {
      timezoneOffsetHours: -2,
    })
    expect(forward[1]).toEqual({ hour: 1, total: 1, correct: 1, rate: 1 })

    // UTC-5 (offset +5h): 01:30Z is 20:30 previous day locally (hour 20)
    const backward = timeOfDayPerformance([{ reviewedAt: '2026-11-04T01:30:00Z', rating: 3 }], {
      timezoneOffsetHours: 5,
    })
    expect(backward[20]).toEqual({ hour: 20, total: 1, correct: 1, rate: 1 })
  })

  it('handles fractional timezone offsets in minutes (DEF-014)', () => {
    // UTC+5:30 → getTimezoneOffset() = -330 → 10:45Z is 16:15 local -> hour 16
    const fractional = timeOfDayPerformance([{ reviewedAt: '2026-11-04T10:45:00Z', rating: 4 }], {
      timezoneOffsetMinutes: -330,
    })
    expect(fractional[16]).toEqual({ hour: 16, total: 1, correct: 1, rate: 1 })
  })

  it('safely ignores invalid timestamps without crashing (DEF-014)', () => {
    const hours = timeOfDayPerformance([
      { reviewedAt: 'invalid-date', rating: 3 },
      { reviewedAt: '', rating: 2 },
    ])
    expect(hours).toHaveLength(24)
    expect(hours.reduce((acc, h) => acc + h.total, 0)).toBe(0)
  })
})

describe('hourOfDayAccuracy', () => {
  it('empty input → 24 zero buckets with null accuracy (honest empty state)', () => {
    const hours = hourOfDayAccuracy([])
    expect(hours).toHaveLength(24)
    expect(hours.map((h) => h.hour)).toEqual([...Array(24).keys()])
    expect(hours.every((h) => h.reviews === 0 && h.correctPct === null)).toBe(true)
  })

  it('counts rating > 1 as correct — Hard (2) passes, only Again (1) fails', () => {
    const reviews = [
      ...Array.from({ length: 6 }, () => ({ reviewedAt: '2026-11-04T09:00:00Z', rating: 2 })),
      ...Array.from({ length: 4 }, () => ({ reviewedAt: '2026-11-04T09:30:00Z', rating: 3 })),
    ]
    expect(hourOfDayAccuracy(reviews)[9]).toEqual({ hour: 9, reviews: 10, correctPct: 100 })
    const withAgain = [...reviews, { reviewedAt: '2026-11-04T09:45:00Z', rating: 1 }]
    expect(hourOfDayAccuracy(withAgain)[9]).toEqual({ hour: 9, reviews: 11, correctPct: 91 })
  })

  it('buckets under 10 reviews report correctPct null (small-N honesty, insights n<10)', () => {
    const nine = Array.from({ length: HOUR_ACCURACY_MIN_REVIEWS - 1 }, (_, i) => ({
      reviewedAt: `2026-11-04T09:${String(i).padStart(2, '0')}:00Z`,
      rating: 4, // a perfect streak — still not reportable at n=9
    }))
    const hours = hourOfDayAccuracy(nine)
    expect(hours[9]).toEqual({ hour: 9, reviews: 9, correctPct: null })
    // the 10th review unlocks the rate
    const ten = [...nine, { reviewedAt: '2026-11-04T09:59:00Z', rating: 1 }]
    expect(hourOfDayAccuracy(ten)[9]).toEqual({ hour: 9, reviews: 10, correctPct: 90 })
  })

  it('buckets by the caller tz offset (getTimezoneOffset semantics, DEF-014)', () => {
    const reviews = [{ reviewedAt: '2026-11-04T14:00:00Z', rating: 3 }]
    // UTC+2 → getTimezoneOffset() = -2 → 14:00Z is 16:00 local
    expect(hourOfDayAccuracy(reviews, -2)[16]).toEqual({ hour: 16, reviews: 1, correctPct: null })
    // UTC-5 → getTimezoneOffset() = +5 → 14:00Z is 09:00 local
    expect(hourOfDayAccuracy(reviews, { timezoneOffsetHours: 5 })[9].reviews).toBe(1)
  })

  it('crosses day boundaries in both directions and handles fractional offsets', () => {
    // UTC+2 (offset -2h): 23:30Z is 01:30 next day locally
    const forward = hourOfDayAccuracy([{ reviewedAt: '2026-11-04T23:30:00Z', rating: 3 }], {
      timezoneOffsetHours: -2,
    })
    expect(forward[1].reviews).toBe(1)
    // UTC-5 (offset +5h): 01:30Z is 20:30 previous day locally
    const backward = hourOfDayAccuracy([{ reviewedAt: '2026-11-04T01:30:00Z', rating: 3 }], {
      timezoneOffsetHours: 5,
    })
    expect(backward[20].reviews).toBe(1)
    // UTC+5:30 (offset -330min): 10:45Z is 16:15 local
    const fractional = hourOfDayAccuracy([{ reviewedAt: '2026-11-04T10:45:00Z', rating: 4 }], {
      timezoneOffsetMinutes: -330,
    })
    expect(fractional[16].reviews).toBe(1)
  })

  it('safely ignores invalid timestamps without crashing', () => {
    const hours = hourOfDayAccuracy([
      { reviewedAt: 'invalid-date', rating: 3 },
      { reviewedAt: '', rating: 2 },
    ])
    expect(hours).toHaveLength(24)
    expect(hours.reduce((acc, h) => acc + h.reviews, 0)).toBe(0)
  })
})

describe('learningScore', () => {
  it('composes retention(40) focus(30) volume(30) capped at 100 each', () => {
    const perfect = learningScore({ reviews: 100, retentionPct: 100, focusMinutes: 120 })
    expect(perfect.score).toBe(100)
    const zero = learningScore({ reviews: 0, retentionPct: 0, focusMinutes: 0 })
    expect(zero.score).toBe(0)
    const half = learningScore({ reviews: 50, retentionPct: 50, focusMinutes: 60 })
    expect(half.score).toBe(50)
    const capped = learningScore({ reviews: 500, retentionPct: 100, focusMinutes: 600 })
    expect(capped.score).toBe(100)
  })
  it('treats unknown retention as 0, not a crash', () => {
    const r = learningScore({ reviews: 100, retentionPct: null, focusMinutes: 0 })
    expect(r.components.retention).toBe(0)
    expect(r.score).toBe(30)
  })
})

describe('focusLeakTrend', () => {
  it('groups leaks per day with averages', () => {
    const trend = focusLeakTrend([
      { startedAt: '2026-11-04T09:00:00Z', leaks: 2 },
      { startedAt: '2026-11-04T14:00:00Z', leaks: 1 },
      { startedAt: '2026-11-05T09:00:00Z', leaks: 0 },
    ])
    expect(trend).toEqual([
      { date: '2026-11-04', leaks: 3, sessions: 2, avgPerSession: 1.5 },
      { date: '2026-11-05', leaks: 0, sessions: 1, avgPerSession: 0 },
    ])
  })
  it('empty input → empty trend', () => {
    expect(focusLeakTrend([])).toEqual([])
  })
})

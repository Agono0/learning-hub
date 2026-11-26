import { describe, expect, it } from 'vitest'
import {
  attributeReviews,
  bucketOfHour,
  cardProfiles,
  goalReadiness,
  inWindow,
  localHour,
  normalizePlace,
  normalizedEntropy,
  rateBy,
  rateOf,
  runContextAudit,
  suggestContext,
  summarizeContext,
  transferGap,
  wilson,
  type CtxGoal,
  type CtxReview,
  type CtxSession,
  type ReviewContext,
} from '../src/context-variability'

const NOW = new Date('2026-11-20T18:00:00.000Z')
const iso = (day: number, hour: number) =>
  new Date(Date.UTC(2026, 10, day, hour, 0, 0)).toISOString()

function session(id: number, place: string, start: string, end: string | null = null): CtxSession {
  return { id, startedAt: start, endedAt: end, place, noise: null, tags: [] }
}
const rv = (cardId: number, rating: number, at: string): CtxReview => ({
  cardId,
  rating,
  reviewedAt: at,
})

describe('helpers', () => {
  it('normalizes places', () => {
    expect(normalizePlace('  Main  Library! ')).toBe('main library')
    expect(normalizePlace('مكتبة الجامعة')).toBe('مكتبة الجامعة')
    expect(normalizePlace('x'.repeat(80))).toHaveLength(40)
  })
  it('buckets hours and applies the timezone offset', () => {
    expect(bucketOfHour(3)).toBe('night')
    expect(bucketOfHour(9)).toBe('morning')
    expect(bucketOfHour(13)).toBe('afternoon')
    expect(bucketOfHour(20)).toBe('evening')
    expect(bucketOfHour(23)).toBe('late')
    expect(localHour('2026-11-20T22:30:00.000Z', 120)).toBe(0)
    expect(localHour('2026-11-20T22:30:00.000Z', -300)).toBe(17)
    expect(localHour('garbage', 0)).toBe(0)
  })
  it('wraps goal windows over midnight', () => {
    expect(inWindow(10, 9, 12)).toBe(true)
    expect(inWindow(12, 9, 12)).toBe(false)
    expect(inWindow(23, 22, 2)).toBe(true)
    expect(inWindow(1, 22, 2)).toBe(true)
    expect(inWindow(5, 22, 2)).toBe(false)
    expect(inWindow(5, 5, 5)).toBe(false)
  })
})

describe('attribution', () => {
  const sessions = [
    session(1, 'home', iso(10, 8), iso(10, 10)),
    session(2, 'library', iso(11, 14), null),
  ]
  it('assigns reviews to the covering session and marks the rest unlogged', () => {
    const rows = attributeReviews(
      [rv(1, 3, iso(10, 9)), rv(1, 3, iso(10, 12)), rv(2, 1, iso(11, 15)), rv(2, 3, iso(11, 20))],
      sessions,
      { now: NOW },
    )
    expect(rows.map((r) => r.place)).toEqual(['home', 'unlogged', 'library', 'unlogged'])
    expect(rows[2]!.success).toBe(false)
  })
  it('cuts open sessions off after the configured hours', () => {
    const rows = attributeReviews([rv(1, 3, iso(11, 16)), rv(1, 3, iso(11, 18))], sessions, {
      openSessionHours: 3,
    })
    expect(rows.map((r) => r.place)).toEqual(['library', 'unlogged'])
  })
  it('labels weekday and weekend in local time', () => {
    const rows = attributeReviews([rv(1, 3, iso(21, 12)), rv(1, 3, iso(23, 12))], [])
    expect(rows.map((r) => r.dayType)).toEqual(['weekend', 'weekday'])
  })
  it('skips reviews with a bad timestamp', () => {
    expect(attributeReviews([rv(1, 3, 'nope')], [])).toEqual([])
  })
})

describe('statistics', () => {
  it('wilson interval is wide for small n and narrow for large n', () => {
    const small = wilson(4, 5)
    const big = wilson(800, 1000)
    expect(small.high - small.low).toBeGreaterThan(big.high - big.low)
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 })
  })
  it('hides rates for tiny groups', () => {
    expect(rateOf(3, 4).rate).toBeNull()
    expect(rateOf(8, 10).rate).toBe(0.8)
  })
  it('entropy is 0 for one value and 1 for an even split', () => {
    expect(normalizedEntropy([10])).toBe(0)
    expect(normalizedEntropy([5, 5])).toBe(1)
    expect(normalizedEntropy([9, 1])).toBeLessThan(0.6)
  })
  it('groups success rates by dimension, biggest group first', () => {
    const rows: ReviewContext[] = Array.from({ length: 12 }, (_, i) => ({
      cardId: 1,
      success: i % 3 !== 0,
      at: iso(10, 9),
      place: i < 9 ? 'home' : 'cafe',
      noise: null,
      bucket: 'morning',
      dayType: 'weekday',
      hour: 9,
    }))
    const by = rateBy(rows, 'place')
    expect(by[0]!.key).toBe('home')
    expect(by[0]!.n).toBe(9)
    expect(by[1]!.rate).toBeNull()
    expect(rateBy(rows, 'noise')[0]!.key).toBe('unlogged')
  })
})

/** A card learned at home that fails away from home. */
function boundHistory(cards: number): CtxReview[] {
  const out: CtxReview[] = []
  for (let c = 1; c <= cards; c++) {
    out.push(rv(c, 3, iso(1, 9)), rv(c, 3, iso(2, 9)))
    for (let d = 3; d <= 6; d++) out.push(rv(c, 3, iso(d, 9)))
    for (let d = 7; d <= 10; d++) out.push(rv(c, d % 2 === 0 ? 1 : 3, iso(d, 20)))
  }
  return out
}
const sess = [session(1, 'home', iso(1, 0), iso(6, 23)), session(2, 'cafe', iso(7, 0), iso(12, 23))]

describe('transfer gap and card profiles', () => {
  const rows = attributeReviews(boundHistory(5), sess, { now: NOW })
  it('flags a clear home-versus-away drop as context-bound', () => {
    const t = transferGap(rows)
    expect(t.verdict).toBe('context-bound')
    expect(t.homeRate).toBeGreaterThan(t.awayRate!)
    expect(t.gapLow).toBeGreaterThan(0.03)
    expect(t.cardsCompared).toBe(5)
  })
  it('says insufficient with little data', () => {
    expect(transferGap(rows.slice(0, 6)).verdict).toBe('insufficient')
  })
  it('says transfers when away reviews are as good as home reviews', () => {
    const flat = attributeReviews(
      Array.from({ length: 5 }, (_, i) => i + 1).flatMap((c) => [
        rv(c, 3, iso(1, 9)),
        rv(c, 3, iso(2, 9)),
        ...[3, 4, 5, 6].map((d) => rv(c, 3, iso(d, 9))),
        ...[7, 8, 9, 10].map((d) => rv(c, 3, iso(d, 20))),
      ]),
      sess,
    )
    expect(transferGap(flat).verdict).toBe('transfers')
  })
  it('is inconclusive when the interval spans the threshold', () => {
    // 5 cards, 3 reviews each way. Two cards fail away, three do not, so resampled cards give a wide interval.
    const mixed = attributeReviews(
      Array.from({ length: 5 }, (_, i) => i + 1).flatMap((c) => [
        rv(c, 3, iso(1, 9)),
        rv(c, 3, iso(2, 9)),
        ...[3, 4].map((d) => rv(c, 3, iso(d, 9))),
        rv(c, 3, iso(5, 9)),
        ...[7, 8].map((d) => rv(c, c <= 2 ? 1 : 3, iso(d, 20))),
        rv(c, 3, iso(9, 20)),
      ]),
      sess,
    )
    const t = transferGap(mixed)
    expect(t.verdict).toBe('inconclusive')
    expect(t.gapLow!).toBeLessThanOrEqual(0.03)
    expect(t.gapHigh!).toBeGreaterThanOrEqual(0.03)
  })
  it('ignores unlogged reviews instead of counting them as away', () => {
    const noSessions = attributeReviews(
      Array.from({ length: 5 }, (_, i) => i + 1).flatMap((c) => [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((d) => rv(c, d < 5 ? 3 : 1, iso(d, 9))),
      ]),
      [],
    )
    expect(transferGap(noSessions).verdict).toBe('insufficient')
    expect(cardProfiles(noSessions.filter((r) => r.place !== 'unlogged'))).toHaveLength(0)
  })
  it('uses whole-card resampling: the same data gives the same interval', () => {
    expect(transferGap(rows)).toEqual(transferGap(rows))
  })
  it('profiles cards by context share', () => {
    const p = cardProfiles(rows)
    expect(p).toHaveLength(5)
    expect(p[0]!.reviews).toBe(10)
    expect(cardProfiles(rows, 50)).toEqual([])
    const single = attributeReviews(
      Array.from({ length: 5 }, (_, i) => rv(9, 3, iso(i + 1, 9))),
      sess,
    )
    expect(cardProfiles(single)[0]!.bound).toBe(true)
    expect(cardProfiles(single)[0]!.entropy).toBe(0)
  })
})

describe('suggestions and goals', () => {
  it('suggests an unused logged place first, then a fresh time of day', () => {
    const rows = attributeReviews(
      Array.from({ length: 5 }, (_, i) => rv(9, 3, iso(i + 1, 9))),
      sess,
    )
    const p = cardProfiles(rows)[0]!
    const s = suggestContext(p, rows, ['home', 'cafe'])
    expect(s.place).toBe('cafe')
    expect(s.why).toContain('cafe')
    const t = suggestContext(p, rows, ['home'])
    expect(t.place).toBeNull()
    expect(t.bucket).not.toBe('morning')
  })
  const goal: CtxGoal = {
    id: 1,
    label: 'Final exam',
    place: 'exam hall',
    startHour: 9,
    endHour: 12,
    noise: 'quiet',
  }
  it('measures how much practice matched the goal context', () => {
    const rows = attributeReviews(
      [
        ...Array.from({ length: 4 }, (_, i) => rv(1, 3, iso(i + 1, 10))),
        ...Array.from({ length: 16 }, (_, i) => rv(1, 3, iso(i + 1, 20))),
      ],
      [session(1, 'exam hall', iso(1, 0), iso(5, 23)), session(2, 'home', iso(6, 0), iso(30, 23))],
    )
    const g = goalReadiness(goal, rows)
    expect(g.matched).toBeGreaterThan(0)
    expect(g.status).toBe(
      g.matchShare >= 0.25 ? 'familiar' : g.matchShare >= 0.1 ? 'partial' : 'unfamiliar',
    )
    expect(g.window).toBe('09:00 to 12:00')
    expect(g.reinstatement.join(' ')).toContain('exam hall')
    expect(g.reinstatement.join(' ')).toContain('near silence')
  })
  it('asks for more matching reviews when unfamiliar and none when ready', () => {
    const away = attributeReviews(
      Array.from({ length: 20 }, (_, i) => rv(1, 3, iso(i + 1, 20))),
      [session(1, 'home', iso(1, 0), iso(30, 23))],
    )
    const g = goalReadiness(goal, away)
    expect(g.status).toBe('unfamiliar')
    expect(g.reviewsToFamiliar).toBe(7)
    expect(goalReadiness(goal, []).reviewsToFamiliar).toBe(0)
  })
})

describe('audit and report', () => {
  const goal: CtxGoal = {
    id: 1,
    label: 'Exam',
    place: 'exam hall',
    startHour: 9,
    endHour: 12,
    noise: null,
  }
  it('runs end to end and finds the bound cards with suggestions', () => {
    const a = runContextAudit(boundHistory(5), sess, [goal], { now: NOW, windowDays: 60 })
    expect(a.reviews).toBe(50)
    expect(a.attributedShare).toBe(1)
    expect(a.transfer.verdict).toBe('context-bound')
    expect(a.byPlace.map((p) => p.key).sort()).toEqual(['cafe', 'home'])
    expect(a.goals[0]!.status).toBe('unfamiliar')
    expect(a.diversity).toBeGreaterThan(0)
    const r = summarizeContext(a)
    expect(r.headline).toMatch(/drops by about/)
    expect(r.caveats.join(' ')).toMatch(/not experiments/)
    expect(r.advice.join(' ')).toMatch(/Exam/)
  })
  it('ignores reviews outside the window', () => {
    const a = runContextAudit(boundHistory(5), sess, [], { now: NOW, windowDays: 3 })
    expect(a.reviews).toBe(0)
    expect(summarizeContext(a).headline).toMatch(/Not enough/)
  })
  it('asks to log sessions when few reviews are attributed', () => {
    const a = runContextAudit(boundHistory(5), [], [], { now: NOW })
    expect(a.attributedShare).toBe(0)
    expect(summarizeContext(a).advice.join(' ')).toMatch(/Log where you study/)
  })
  it('caps very large inputs and says so', () => {
    const big = Array.from({ length: 20_005 }, (_, i) => rv(i % 50, 3, iso(10, 9)))
    const a = runContextAudit(big, [], [], { now: NOW })
    expect(a.truncated).toBe(true)
    expect(a.reviews).toBe(20_000)
    expect(summarizeContext(a).caveats.join(' ')).toMatch(/20000/)
  })
})

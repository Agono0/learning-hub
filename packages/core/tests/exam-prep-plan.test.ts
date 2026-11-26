import { describe, expect, it } from 'vitest'
import {
  PREP_ASSUMPTIONS,
  PREP_DEFAULTS,
  planExamPrep,
  parseExamDate,
  plannedRecall,
} from '../src/index'
import { DAY, NOW, iso, mixedDeck, newCard, seenCard } from './readiness-fixtures'

const exam = (d: number) => new Date(NOW.getTime() + d * DAY)

describe('exam prep plan', () => {
  it('returns null for an invalid date and an empty plan when the exam has passed', async () => {
    expect(await planExamPrep([], NOW, new Date('nope'), 0.85)).toBeNull()
    const p = await planExamPrep(mixedDeck(10, 1), NOW, exam(-1), 0.85)
    expect(p!.expired).toBe(true)
    expect(p!.days).toEqual([])
    expect(p!.summary.plannedReviews).toBe(0)
    expect(p!.assumptions).toEqual([...PREP_ASSUMPTIONS])
  })

  it('plans only study days up to the day before the exam, newest info first', async () => {
    const p = (await planExamPrep(mixedDeck(40, 7), NOW, exam(10), 0.85))!
    expect(p.days.length).toBe(10)
    expect(p.days[0]!.date).toBe(iso(0).slice(0, 10))
    expect(p.days.at(-1)!.date).toBe(iso(9).slice(0, 10))
    expect(p.days.map((d) => d.date)).toEqual([...new Set(p.days.map((d) => d.date))])
  })

  it('never plans more than perDay and orders each day by gain', async () => {
    const p = (await planExamPrep(mixedDeck(80, 3), NOW, exam(14), 0.85, { perDay: 5 }))!
    for (const d of p.days) {
      expect(d.reviews.length).toBeLessThanOrEqual(5)
      const gains = d.reviews.map((r) => r.gain)
      expect([...gains].sort((a, b) => b - a)).toEqual(gains)
    }
    expect(p.summary.capacityBound).toBe(true)
  })

  it('leaves rest weekdays empty', async () => {
    const p = (await planExamPrep(mixedDeck(60, 5), NOW, exam(14), 0.85, { restWeekdays: [0, 6] }))!
    const rest = p.days.filter((d) => d.rest)
    expect(rest.length).toBeGreaterThan(0)
    for (const d of rest) {
      expect(d.reviews).toEqual([])
      expect([0, 6]).toContain(new Date(`${d.date}T00:00:00Z`).getUTCDay())
    }
    expect(p.summary.restDays).toBe(rest.length)
  })

  it('caps repeated reviews per card and records the nth review', async () => {
    const p = (await planExamPrep(mixedDeck(30, 9), NOW, exam(40), 0.85, {
      maxReviewsPerCard: 2,
      minGain: 0,
    }))!
    const counts = new Map<number, number>()
    for (const d of p.days)
      for (const r of d.reviews) {
        counts.set(r.cardId, (counts.get(r.cardId) ?? 0) + 1)
        expect(r.nth).toBe(counts.get(r.cardId))
      }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2)
  })

  it('does not drop below the no-review baseline and never lowers the running mean', async () => {
    const p = (await planExamPrep(mixedDeck(60, 11), NOW, exam(21), 0.85))!
    expect(p.summary.planned).toBeGreaterThanOrEqual(p.summary.baseline)
    let prev = p.summary.baseline - 0.001
    for (const d of p.days) {
      expect(d.meanExamRecallAfter).toBeGreaterThanOrEqual(prev - 0.001)
      prev = d.meanExamRecallAfter
    }
    expect(p.days.at(-1)!.meanExamRecallAfter).toBe(p.summary.planned)
  })

  it('a rest day carries the previous day figure and a study day never lowers it', async () => {
    const p = (await planExamPrep(mixedDeck(60, 31), NOW, exam(21), 0.85, {
      restWeekdays: [0, 6],
    }))!
    p.days.forEach((d, i) => {
      if (i > 0 && d.rest) expect(d.meanExamRecallAfter).toBe(p.days[i - 1]!.meanExamRecallAfter)
    })
    expect(p.days.some((d) => d.rest)).toBe(true)
  })

  it('with more cards than maxCards it plans only the weakest and says so', async () => {
    const cards = mixedDeck(60, 41)
    const full = (await planExamPrep(cards, NOW, exam(20), 0.85, { maxCards: 1000 }))!
    const cut = (await planExamPrep(cards, NOW, exam(20), 0.85, { maxCards: 10 }))!
    expect(full.summary.truncated).toBe(false)
    expect(cut.summary.truncated).toBe(true)
    expect(cut.summary.consideredCards).toBe(10)
    expect(
      new Set(cut.days.flatMap((d) => d.reviews.map((r) => r.cardId))).size,
    ).toBeLessThanOrEqual(10)
    expect(cut.summary.baseline).toBe(full.summary.baseline)
    expect(cut.summary.seenCards).toBe(full.summary.seenCards)
    expect(cut.summary.planned).toBeLessThanOrEqual(full.summary.planned + 0.001)
    const again = await planExamPrep(cards, NOW, exam(20), 0.85, { maxCards: 10 })
    expect(again).toEqual(cut)
  })

  it('refuses an exam farther than the horizon and accepts the last supported day', async () => {
    expect(
      await planExamPrep(mixedDeck(5, 1), NOW, exam(PREP_DEFAULTS.maxHorizonDays + 2), 0.85),
    ).toBeNull()
    expect(await planExamPrep(mixedDeck(5, 1), NOW, new Date('2200-01-01'), 0.85)).toBeNull()
    expect(
      await planExamPrep(mixedDeck(5, 1), NOW, exam(PREP_DEFAULTS.maxHorizonDays - 1), 0.85),
    ).not.toBeNull()
  })

  it('bounds cards x days and a caller cannot raise maxCards past the ceiling', async () => {
    const cards = mixedDeck(300, 51)
    const long = (await planExamPrep(cards, NOW, exam(300), 0.85, { maxCards: 1_000_000 }))!
    expect(long.options.maxCards).toBeLessThanOrEqual(PREP_DEFAULTS.maxCardsCeiling)
    expect(long.summary.consideredCards * long.days.length).toBeLessThanOrEqual(
      PREP_DEFAULTS.maxCardDays,
    )
    expect(long.options.maxCards).toBe(Math.floor(PREP_DEFAULTS.maxCardDays / 300))
    expect(long.summary.consideredCards).toBe(long.summary.seenCards)
    expect(long.summary.truncated).toBe(false) // 300 cards < 1000 allowed: nothing cut
    const hostile = (await planExamPrep(cards, NOW, exam(5), 0.85, { maxCards: -5 }))!
    expect(hostile.options.maxCards).toBe(1)
    const nan = (await planExamPrep(cards, NOW, exam(5), 0.85, { maxCards: Number.NaN }))!
    expect(nan.options.maxCards).toBe(PREP_DEFAULTS.maxCards)
  })

  it('breaks ties by card id and keeps the baseline over cards left out', async () => {
    const twins = Array.from({ length: 12 }, (_, i) =>
      seenCard(i + 1, { stability: 9, lastReview: iso(-3) }),
    )
    const p = (await planExamPrep(twins, NOW, exam(10), 0.85, { maxCards: 4, perDay: 2 }))!
    expect(p.summary.truncated).toBe(true)
    expect(new Set(p.days.flatMap((d) => d.reviews.map((r) => r.cardId))).size).toBeLessThanOrEqual(
      4,
    )
    expect(p.days.flatMap((d) => d.reviews.map((r) => r.cardId)).every((id) => id <= 4)).toBe(true)
    const none = (await planExamPrep(twins, NOW, exam(10), 0.85, { perDay: 0 }))!
    expect(p.summary.baseline).toBe(none.summary.baseline)
    expect(p.summary.planned).toBeGreaterThanOrEqual(p.summary.baseline)
  })

  it('stays finite and bounded with all rest days, past dates and non-finite inputs', async () => {
    const cards = mixedDeck(80, 61)
    const allRest = (await planExamPrep(cards, NOW, exam(30), 0.85, {
      restWeekdays: [0, 1, 2, 3, 4, 5, 6],
    }))!
    expect(allRest.summary.studyDays).toBe(0)
    expect(allRest.summary.plannedReviews).toBe(0)
    expect(allRest.summary.planned).toBe(allRest.summary.baseline)
    const past = (await planExamPrep(cards, NOW, exam(-400), 0.85))!
    expect(past.expired).toBe(true)
    expect(past.days).toEqual([])
    const bad = (await planExamPrep(cards, NOW, exam(10), Number.NaN, {
      perDay: Number.POSITIVE_INFINITY,
      minGain: Number.NaN,
      maxCards: Number.POSITIVE_INFINITY,
      maxReviewsPerCard: Number.NaN,
    }))!
    expect(bad.targetRecall).toBe(0.85)
    expect(bad.options).toMatchObject({
      perDay: 30,
      minGain: 0.01,
      maxReviewsPerCard: 3,
      maxCards: PREP_DEFAULTS.maxCards,
    })
    for (const v of [
      bad.summary.baseline,
      bad.summary.planned,
      ...bad.days.map((d) => d.meanExamRecallAfter),
    ])
      expect(Number.isFinite(v)).toBe(true)
    // the same-day exam has zero study days: no divide-by-zero in the card budget
    const same = (await planExamPrep(cards, NOW, new Date(NOW.getTime() + 1000), 0.85))!
    expect(same.options.maxCards).toBeGreaterThanOrEqual(1)
    expect(await planExamPrep(cards, new Date('x'), exam(5), 0.85)).toBeNull()
  })

  it('agrees with the readiness simulation about the baseline', async () => {
    const cards = mixedDeck(40, 13)
    const p = (await planExamPrep(cards, NOW, exam(20), 0.85, { perDay: 0 }))!
    const base = await plannedRecall(cards, NOW, exam(20), { kind: 'none' })
    const seen = cards.filter((c) => c.state !== 0)
    const mean = seen.reduce((s, c) => s + (base.get(c.id) ?? 0), 0) / seen.length
    expect(p.summary.baseline).toBeCloseTo(mean, 3)
    expect(p.summary.plannedReviews).toBe(0)
    expect(p.summary.planned).toBe(p.summary.baseline)
  })

  it('keeps new cards out of the plan and counts them separately', async () => {
    const cards = [seenCard(1, { stability: 4 }), newCard(2), newCard(3)]
    const p = (await planExamPrep(cards, NOW, exam(12), 0.85))!
    expect(p.summary.seenCards).toBe(1)
    expect(p.summary.unseenCards).toBe(2)
    const ids = p.days.flatMap((d) => d.reviews.map((r) => r.cardId))
    expect(ids.every((id) => id === 1)).toBe(true)
  })

  it('skips suspended cards', async () => {
    const cards = [seenCard(1, { stability: 3, suspended: true }), seenCard(2, { stability: 3 })]
    const p = (await planExamPrep(cards, NOW, exam(12), 0.85))!
    const ids = new Set(p.days.flatMap((d) => d.reviews.map((r) => r.cardId)))
    expect(ids.has(1)).toBe(false)
    expect(p.summary.seenCards).toBe(1)
  })

  it('is deterministic and does not change its input', async () => {
    const cards = mixedDeck(50, 21)
    const copy = JSON.stringify(cards)
    const a = await planExamPrep(cards, NOW, exam(18), 0.85, { perDay: 8 })
    const b = await planExamPrep(cards, NOW, exam(18), 0.85, { perDay: 8 })
    expect(a).toEqual(b)
    expect(JSON.stringify(cards)).toBe(copy)
  })

  it('clamps options and handles an empty deck', async () => {
    const p = (await planExamPrep([], NOW, exam(5), 0.85, {
      perDay: 99999,
      maxReviewsPerCard: 99,
    }))!
    expect(p.options.perDay).toBe(PREP_DEFAULTS.maxPerDay)
    expect(p.options.maxReviewsPerCard).toBe(10)
    expect(p.options.maxCards).toBe(PREP_DEFAULTS.maxCards)
    expect(p.days).toEqual([])
    expect(p.summary.baseline).toBe(0)
    const q = (await planExamPrep(mixedDeck(5, 2), NOW, exam(5), 5))!
    expect(q.targetRecall).toBe(0.99)
  })

  it('treats a bare exam date as the end of that day', () => {
    expect(parseExamDate('2026-11-10')!.toISOString()).toBe('2026-11-10T23:59:59.000Z')
  })

  it('a later exam date never plans fewer total gain than a sooner one with the same cards', async () => {
    const cards = mixedDeck(40, 17)
    const soon = (await planExamPrep(cards, NOW, exam(4), 0.85))!
    const later = (await planExamPrep(cards, NOW, exam(20), 0.85))!
    expect(soon.days.length).toBe(4)
    expect(later.days.length).toBe(20)
    expect(later.summary.plannedReviews).toBeGreaterThanOrEqual(soon.summary.plannedReviews)
  })
})

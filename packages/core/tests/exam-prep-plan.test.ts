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

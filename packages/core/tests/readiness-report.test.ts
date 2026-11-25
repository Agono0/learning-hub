import { describe, expect, it } from 'vitest'
import { assessConfidence, groupBy, summarizeGroup } from '../src/readiness/aggregate'
import { planBudget, rankReviewGains, reviewsNeededFor } from '../src/readiness/gap'
import { buildReadinessReport, parseExamDate } from '../src/readiness/report'
import type { CardForecast } from '../src/readiness/model'
import { DAY, mixedDeck, newCard, NOW, seenCard } from './readiness-fixtures'

const f = (over: Partial<CardForecast>): CardForecast => ({
  cardId: 1,
  deckId: 1,
  skillId: null,
  baseline: 0.5,
  planned: 0.5,
  unseen: false,
  ...over,
})

describe('summarizeGroup', () => {
  it('averages seen cards only and reports unseen separately', () => {
    const g = summarizeGroup(
      'd',
      'Deck',
      [
        f({ baseline: 0.4, planned: 0.8 }),
        f({ baseline: 0.6, planned: 1 }),
        f({ unseen: true, baseline: 0, planned: 0 }),
      ],
      0.85,
    )
    expect(g).toMatchObject({
      cards: 3,
      unseen: 1,
      baselineRecall: 0.5,
      plannedRecall: 0.9,
      atTarget: 0.5,
    })
  })

  it('an all-unseen group reads as zero recall with every card unseen, not as forgotten data', () => {
    const g = summarizeGroup('d', 'Deck', [f({ unseen: true }), f({ unseen: true })], 0.85)
    expect(g).toMatchObject({
      cards: 2,
      unseen: 2,
      baselineRecall: 0,
      plannedRecall: 0,
      atTarget: 0,
    })
  })

  it('an empty group does not divide by zero', () => {
    expect(summarizeGroup('d', 'Deck', [], 0.85)).toMatchObject({ cards: 0, plannedRecall: 0 })
  })
})

describe('groupBy', () => {
  it('buckets by key, skips null keys and sorts the weakest group first', () => {
    const groups = groupBy(
      [
        f({ deckId: 2, planned: 0.9 }),
        f({ deckId: 1, planned: 0.4 }),
        f({ deckId: 1, planned: 0.6 }),
        f({ deckId: 3, planned: 0.7, skillId: null }),
      ],
      (x) => x.deckId,
      (k) => `D${k}`,
      0.85,
    )
    expect(groups.map((g) => g.label)).toEqual(['D1', 'D3', 'D2'])
    const skills = groupBy(
      [f({ skillId: null }), f({ skillId: 5 })],
      (x) => x.skillId,
      (k) => `S${k}`,
      0.85,
    )
    expect(skills).toHaveLength(1)
    expect(skills[0]!.label).toBe('S5')
  })
})

describe('assessConfidence', () => {
  it('says insufficient below 20 studied cards and names the number', () => {
    const c = assessConfidence(Array.from({ length: 5 }, (_, i) => seenCard(i + 1)))
    expect(c.level).toBe('insufficient')
    expect(c.reason).toContain('5')
    expect(c.seenCards).toBe(5)
  })

  it('does not count new or suspended cards as history', () => {
    const cards = [
      ...Array.from({ length: 30 }, (_, i) => newCard(i + 1)),
      ...Array.from({ length: 30 }, (_, i) => seenCard(100 + i, { suspended: true })),
    ]
    expect(assessConfidence(cards).seenCards).toBe(0)
  })

  it('is low when most cards have a single review', () => {
    const cards = Array.from({ length: 40 }, (_, i) => seenCard(i + 1, { reps: 1 }))
    expect(assessConfidence(cards).level).toBe('low')
  })

  it('is moderate with decent history but fewer than 100 cards', () => {
    const cards = Array.from({ length: 50 }, (_, i) => seenCard(i + 1, { reps: 5 }))
    expect(assessConfidence(cards).level).toBe('moderate')
  })

  it('reaches good only with 100+ established cards and still says it is an estimate', () => {
    const cards = Array.from({ length: 120 }, (_, i) => seenCard(i + 1, { reps: 5 }))
    const c = assessConfidence(cards)
    expect(c.level).toBe('good')
    expect(c.reason).toMatch(/not a validated/i)
  })
})

describe('review gains', () => {
  const exam = new Date(NOW.getTime() + 20 * DAY)

  it('ranks the biggest gain first and never reports a negative gain', async () => {
    const gains = await rankReviewGains(mixedDeck(80, 3), NOW, exam)
    expect(gains.length).toBeGreaterThan(0)
    for (let i = 1; i < gains.length; i++)
      expect(gains[i - 1]!.gain).toBeGreaterThanOrEqual(gains[i]!.gain)
    for (const g of gains) expect(g.gain).toBeGreaterThanOrEqual(0)
  })

  it('leaves out new and suspended cards, and returns nothing once the exam has passed', async () => {
    const cards = [newCard(1), seenCard(2, { suspended: true }), seenCard(3)]
    const gains = await rankReviewGains(cards, NOW, exam)
    expect(gains.map((g) => g.cardId)).toEqual([3])
    expect(await rankReviewGains(cards, NOW, new Date(NOW.getTime() - DAY))).toEqual([])
  })

  it('a fading card gains more from a review than a solid one', async () => {
    const fading = seenCard(1, {
      stability: 3,
      lastReview: new Date(NOW.getTime() - 5 * DAY).toISOString(),
    })
    const solid = seenCard(2, {
      stability: 120,
      lastReview: new Date(NOW.getTime() - 1 * DAY).toISOString(),
    })
    const gains = await rankReviewGains([solid, fading], NOW, exam)
    expect(gains[0]!.cardId).toBe(1)
  })

  it('planBudget lifts mean recall as the budget grows and caps at 1', async () => {
    const gains = await rankReviewGains(mixedDeck(80, 5), NOW, exam)
    const small = planBudget(gains, 5)
    const large = planBudget(gains, 40)
    expect(small.before).toBe(large.before)
    expect(large.after).toBeGreaterThanOrEqual(small.after)
    expect(small.after).toBeGreaterThanOrEqual(small.before)
    expect(planBudget(gains, 10_000).after).toBeLessThanOrEqual(1)
    expect(planBudget([], 5)).toEqual({ budget: 5, chosen: [], before: 0, after: 0 })
    expect(planBudget(gains, -3).chosen).toEqual([])
  })

  it('reviewsNeededFor finds the smallest budget, 0 when already there, null when unreachable', async () => {
    const gains = await rankReviewGains(mixedDeck(60, 9), NOW, exam)
    const mean = gains.reduce((s, g) => s + g.baseline, 0) / gains.length
    expect(reviewsNeededFor(gains, mean - 0.01)).toBe(0)
    const needed = reviewsNeededFor(gains, Math.min(0.99, mean + 0.02))
    if (needed !== null) {
      expect(needed).toBeGreaterThan(0)
      expect(planBudget(gains, needed).after).toBeGreaterThanOrEqual(
        Math.min(0.99, mean + 0.02) - 0.002,
      )
      if (needed > 1)
        expect(planBudget(gains, needed - 1).after).toBeLessThan(Math.min(0.99, mean + 0.02))
    }
    expect(reviewsNeededFor(gains, 1.5)).toBeNull()
    expect(reviewsNeededFor([], 0.8)).toBeNull()
  })
})

describe('parseExamDate', () => {
  it('treats a bare date as the end of that day so the exam day itself counts', () => {
    expect(parseExamDate('2026-12-01')!.toISOString()).toBe('2026-12-01T23:59:59.000Z')
  })
  it('keeps full timestamps and rejects junk', () => {
    expect(parseExamDate('2026-12-01T09:00:00.000Z')!.toISOString()).toBe(
      '2026-12-01T09:00:00.000Z',
    )
    expect(parseExamDate('')).toBeNull()
    expect(parseExamDate('not a date')).toBeNull()
  })
})

describe('buildReadinessReport', () => {
  const cards = mixedDeck(120, 21)

  it('returns null for an unusable exam date', async () => {
    expect(
      await buildReadinessReport({ target: { title: 'x', date: 'soon' }, cards, now: NOW }),
    ).toBeNull()
  })

  it('reports both baseline and planned, and planned is not below baseline on schedule', async () => {
    const r = (await buildReadinessReport({
      target: { title: 'Final', date: '2026-11-21' },
      cards,
      now: NOW,
    }))!
    expect(r.overall.cards).toBe(120)
    expect(r.overall.plannedRecall).toBeGreaterThanOrEqual(r.overall.baselineRecall - 1e-9)
    // Nov 1 12:00 to the end of Nov 21 is 20.5 days, rounded up.
    expect(r.daysLeft).toBe(21)
    expect(r.expired).toBe(false)
    expect(r.plan).toEqual({ kind: 'on-schedule' })
    expect(r.confidence.seenCards).toBeGreaterThan(0)
  })

  it('the none plan makes planned equal baseline everywhere', async () => {
    const r = (await buildReadinessReport({
      target: { title: 'F', date: '2026-11-21' },
      cards,
      now: NOW,
      plan: { kind: 'none' },
    }))!
    expect(r.overall.plannedRecall).toBe(r.overall.baselineRecall)
    for (const d of r.decks) expect(d.plannedRecall).toBe(d.baselineRecall)
  })

  it('marks an exam in the past as expired with zero days left', async () => {
    const r = (await buildReadinessReport({
      target: { title: 'Old', date: '2026-10-01' },
      cards,
      now: NOW,
    }))!
    expect(r.expired).toBe(true)
    expect(r.daysLeft).toBe(0)
  })

  it('clamps the target recall into a sane range and uses custom labels', async () => {
    const r = (await buildReadinessReport({
      target: { title: 'F', date: '2026-11-21' },
      cards,
      now: NOW,
      targetRecall: 5,
      deckLabel: (id) => `Biology ${id}`,
    }))!
    expect(r.targetRecall).toBe(0.99)
    expect(r.decks[0]!.label.startsWith('Biology')).toBe(true)
    const low = (await buildReadinessReport({
      target: { title: 'F', date: '2026-11-21' },
      cards,
      now: NOW,
      targetRecall: 0.1,
    }))!
    expect(low.targetRecall).toBe(0.5)
  })

  it('a deck of only new cards reads as not started, not as forgotten', async () => {
    const fresh = Array.from({ length: 30 }, (_, i) => newCard(i + 1))
    const r = (await buildReadinessReport({
      target: { title: 'F', date: '2026-11-21' },
      cards: fresh,
      now: NOW,
    }))!
    expect(r.overall).toMatchObject({ cards: 30, unseen: 30, plannedRecall: 0 })
    expect(r.confidence.level).toBe('insufficient')
  })
})

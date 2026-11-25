import { describe, expect, it } from 'vitest'
import {
  daysBetween,
  forecastCards,
  isSeen,
  plannedRecall,
  recallAt,
} from '../src/readiness/forecast'
import { DAY, iso, mixedDeck, newCard, NOW, seenCard } from './readiness-fixtures'

const EXAM = new Date(NOW.getTime() + 30 * DAY)

describe('isSeen and recallAt', () => {
  it('treats new and stateless cards as unseen with zero recall', () => {
    expect(isSeen(newCard(1))).toBe(false)
    expect(recallAt(newCard(1), EXAM)).toBe(0)
    expect(isSeen(seenCard(2, { lastReview: null }))).toBe(false)
    expect(isSeen(seenCard(3, { stability: 0 }))).toBe(false)
  })

  it('is 1 at the moment of review and falls as time passes', () => {
    const c = seenCard(1, { stability: 10, lastReview: NOW.toISOString() })
    expect(recallAt(c, NOW)).toBe(1)
    let prev = 1
    for (const d of [1, 5, 10, 30, 90]) {
      const r = recallAt(c, new Date(NOW.getTime() + d * DAY))
      expect(r).toBeLessThan(prev)
      expect(r).toBeGreaterThan(0)
      prev = r
    }
  })

  it('is about 0.9 one stability-length after review (FSRS definition of stability)', () => {
    const c = seenCard(1, { stability: 12, lastReview: NOW.toISOString() })
    const r = recallAt(c, new Date(NOW.getTime() + 12 * DAY))
    expect(r).toBeGreaterThan(0.89)
    expect(r).toBeLessThan(0.91)
  })

  it('higher stability always recalls better at the same age', () => {
    const at = EXAM
    const low = recallAt(seenCard(1, { stability: 5 }), at)
    const high = recallAt(seenCard(2, { stability: 50 }), at)
    expect(high).toBeGreaterThan(low)
  })

  it('never returns a time-travel result: a past exam date counts zero elapsed days', () => {
    expect(daysBetween(EXAM, NOW)).toBe(0)
    const c = seenCard(1, { lastReview: NOW.toISOString() })
    expect(recallAt(c, new Date(NOW.getTime() - DAY))).toBe(1)
  })
})

describe('plannedRecall', () => {
  const deck = mixedDeck(60)

  it('the no-review plan equals the baseline for every card', async () => {
    const planned = await plannedRecall(deck, NOW, EXAM, { kind: 'none' })
    for (const c of deck) expect(planned.get(c.id)).toBe(recallAt(c, EXAM))
  })

  it('a past exam date returns the baseline whatever the plan says', async () => {
    const past = new Date(NOW.getTime() - DAY)
    const planned = await plannedRecall(deck, NOW, past, { kind: 'on-schedule' })
    for (const c of deck) expect(planned.get(c.id)).toBe(recallAt(c, past))
  })

  it('on-schedule reviews never leave a card worse than doing nothing', async () => {
    const planned = await plannedRecall(deck, NOW, EXAM, { kind: 'on-schedule' })
    for (const c of deck.filter(isSeen)) {
      expect(planned.get(c.id)!).toBeGreaterThanOrEqual(recallAt(c, EXAM) - 1e-9)
    }
  })

  it('a card due after the exam is untouched by the plan', async () => {
    const far = seenCard(1, { stability: 200, due: iso(100), lastReview: iso(-3) })
    const planned = await plannedRecall([far], NOW, EXAM, { kind: 'on-schedule' })
    expect(planned.get(1)).toBe(recallAt(far, EXAM))
  })

  it('a card that is overdue is reviewed and so beats its baseline', async () => {
    const overdue = seenCard(1, { stability: 4, due: iso(-5), lastReview: iso(-9) })
    const planned = await plannedRecall([overdue], NOW, EXAM, { kind: 'on-schedule' })
    expect(planned.get(1)!).toBeGreaterThan(recallAt(overdue, EXAM))
  })

  it('a capacity of zero reviews equals the baseline', async () => {
    const planned = await plannedRecall(deck, NOW, EXAM, { kind: 'capacity', perDay: 0 })
    for (const c of deck) expect(planned.get(c.id)).toBe(recallAt(c, EXAM))
  })

  it('reviewing helps overall: unlimited capacity beats none, and small steps never fall far', async () => {
    // Not strictly monotone per step: FSRS grows stability more from a late review than a
    // timely one, so a larger budget that reviews sooner can end a hair lower. The
    // invariant that must hold is the overall direction and a small tolerance per step.
    const mean = async (perDay: number) => {
      const planned = await plannedRecall(deck, NOW, EXAM, { kind: 'capacity', perDay })
      const seen = deck.filter(isSeen)
      return seen.reduce((s, c) => s + planned.get(c.id)!, 0) / seen.length
    }
    const caps = [0, 2, 5, 15, 100]
    const means: number[] = []
    for (const c of caps) means.push(await mean(c))
    expect(means[4]!).toBeGreaterThan(means[0]!)
    for (let i = 1; i < means.length; i++) {
      expect(means[i]!).toBeGreaterThanOrEqual(means[i - 1]! - 0.01)
    }
  })

  it('suspended cards are left out of the result', async () => {
    const planned = await plannedRecall(
      [seenCard(1, { suspended: true }), seenCard(2)],
      NOW,
      EXAM,
      {
        kind: 'on-schedule',
      },
    )
    expect(planned.has(1)).toBe(false)
    expect(planned.has(2)).toBe(true)
  })

  it('is deterministic: same inputs give identical output', async () => {
    const a = await plannedRecall(deck, NOW, EXAM, { kind: 'on-schedule' })
    const b = await plannedRecall(deck, NOW, EXAM, { kind: 'on-schedule' })
    expect([...a.entries()]).toEqual([...b.entries()])
  })
})

describe('forecastCards', () => {
  it('flags unseen cards and keeps planned at 0 for them', async () => {
    const out = await forecastCards([newCard(1), seenCard(2)], NOW, EXAM, { kind: 'on-schedule' })
    expect(out.find((f) => f.cardId === 1)).toMatchObject({ unseen: true, baseline: 0, planned: 0 })
    expect(out.find((f) => f.cardId === 2)!.unseen).toBe(false)
  })

  it('omits suspended cards and carries deck and skill ids through', async () => {
    const out = await forecastCards(
      [seenCard(1, { suspended: true }), seenCard(2, { deckId: 9, skillId: 4 })],
      NOW,
      EXAM,
      { kind: 'none' },
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ cardId: 2, deckId: 9, skillId: 4 })
  })

  it('stays inside [0, 1] for a wide spread of cards', async () => {
    const out = await forecastCards(mixedDeck(200, 11), NOW, EXAM, { kind: 'on-schedule' })
    for (const f of out) {
      expect(f.baseline).toBeGreaterThanOrEqual(0)
      expect(f.baseline).toBeLessThanOrEqual(1)
      expect(f.planned).toBeGreaterThanOrEqual(0)
      expect(f.planned).toBeLessThanOrEqual(1)
    }
  })
})

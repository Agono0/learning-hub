import { describe, expect, it } from 'vitest'
import {
  gapList,
  gapsToEiFacts,
  nextStep,
  passageSchema,
  scoreRecall,
  splitIdeaUnits,
  suggestedDelayMinutes,
} from '../src/free-recall'

const TEXT =
  'Photosynthesis converts sunlight into chemical energy inside chloroplasts. The light reactions split water and release oxygen as a byproduct. The Calvin cycle fixes carbon dioxide into glucose using ATP. Chlorophyll absorbs mostly red and blue light, which is why leaves look green.'

describe('splitIdeaUnits', () => {
  it('splits sentences, drops fragments, weights in 0..1', () => {
    const units = splitIdeaUnits(`${TEXT} Short one.`)
    expect(units).toHaveLength(4)
    expect(units[0]?.id).toBe(1)
    for (const u of units) {
      expect(u.weight).toBeGreaterThanOrEqual(0)
      expect(u.weight).toBeLessThanOrEqual(1)
    }
    expect(Math.max(...units.map((u) => u.weight))).toBe(1)
  })
  it('splits on semicolons and handles empty text', () => {
    expect(
      splitIdeaUnits(
        'Heat expands metal because atoms vibrate; cold contracts metal because atoms slow.',
      ),
    ).toHaveLength(2)
    expect(splitIdeaUnits('')).toEqual([])
  })
})

describe('scoreRecall', () => {
  const units = splitIdeaUnits(TEXT)
  it('blank recall is blank with all missed', () => {
    const r = scoreRecall(units, '')
    expect(r.band).toBe('blank')
    expect(r.missed).toBe(4)
    expect(r.recallScore).toBe(0)
    expect(r.precision).toBeNull()
  })
  it('full recall in order is thorough with perfect order fidelity', () => {
    const r = scoreRecall(units, TEXT)
    expect(r.recalled).toBe(4)
    expect(r.band).toBe('thorough')
    expect(r.recallScore).toBe(100)
    expect(r.precision).toBe(100)
    expect(r.orderFidelity).toBe(100)
    expect(r.intrusions).toEqual([])
  })
  it('partial recall finds the right gaps', () => {
    const r = scoreRecall(
      units,
      'Photosynthesis converts sunlight into chemical energy inside chloroplasts. The Calvin cycle fixes carbon dioxide into glucose using ATP.',
    )
    expect(r.recalled).toBe(2)
    expect(r.missed).toBe(2)
    expect(['partial', 'good']).toContain(r.band)
    const gaps = gapList(r)
    expect(gaps.every((g) => g.status !== 'recalled')).toBe(true)
    expect(gaps[0]?.unit.weight).toBeGreaterThanOrEqual(gaps[gaps.length - 1]?.unit.weight ?? 0)
  })
  it('flags intrusions and reversed order', () => {
    const rev = [...TEXT.split('. ')].reverse().join('. ')
    const r = scoreRecall(units, `${rev}. My dog loves chasing tennis balls at the beach.`)
    expect(r.intrusions.length).toBe(1)
    expect(r.intrusions[0]?.text).toContain('tennis')
    expect(r.orderFidelity).toBeLessThan(100)
    expect(r.feedback.join(' ')).toMatch(/do not match/)
  })
  it('turns gaps into valid EI facts', () => {
    const r = scoreRecall(
      units,
      'Photosynthesis converts sunlight into chemical energy inside chloroplasts.',
    )
    const facts = gapsToEiFacts(r, 5)
    expect(facts).toHaveLength(3)
    expect(facts[0]?.id).toMatch(/^gap\d+$/)
    expect(facts[0]?.keyTerms.length).toBeGreaterThan(0)
  })
})

describe('planning', () => {
  it('decides retry, explain or done', () => {
    expect(nextStep([]).action).toBe('retry')
    expect(nextStep([{ round: 1, recallScore: 90 }]).action).toBe('done')
    expect(
      nextStep([
        { round: 1, recallScore: 30 },
        { round: 2, recallScore: 50 },
      ]).action,
    ).toBe('retry')
    expect(
      nextStep([
        { round: 1, recallScore: 50 },
        { round: 2, recallScore: 45 },
        { round: 3, recallScore: 40 },
      ]).action,
    ).toBe('explain')
  })
  it('expands the delay with the score', () => {
    expect([10, 40, 70, 90].map(suggestedDelayMinutes)).toEqual([10, 60, 360, 1440])
  })
  it('validates passages', () => {
    expect(passageSchema.safeParse({ text: 'too short' }).success).toBe(false)
    expect(passageSchema.parse({ text: TEXT }).title).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { nemesisReason, type NemesisCard } from '../src/components/arena/NemesisPanel'

const card = (over: Partial<NemesisCard> = {}): NemesisCard => ({
  cardId: 1,
  front: 'q',
  format: 'basic',
  attempts: 5,
  correct: 2,
  misses: 3,
  accuracy: 0.4,
  overconfidentMisses: 0,
  avgTimeMs: 3000,
  correctStreak: 0,
  worstMissStreak: 1,
  recentDelta: null,
  tier: 'shaky',
  nemesisScore: 40,
  ...over,
})

describe('nemesisReason', () => {
  it('always states the miss ratio', () => {
    expect(nemesisReason(card())).toBe('missed 3 of 5')
  })
  it('pluralizes confident misses', () => {
    expect(nemesisReason(card({ overconfidentMisses: 1 }))).toContain('1 confident miss')
    expect(nemesisReason(card({ overconfidentMisses: 2 }))).toContain('2 confident misses')
  })
  it('mentions miss streaks of 2+', () => {
    expect(nemesisReason(card({ worstMissStreak: 3 }))).toContain('3 misses in a row at worst')
    expect(nemesisReason(card({ worstMissStreak: 1 }))).not.toContain('in a row')
  })
  it('flags trend only when it is large', () => {
    expect(nemesisReason(card({ recentDelta: -0.5 }))).toContain('getting worse')
    expect(nemesisReason(card({ recentDelta: 0.5 }))).toContain('improving')
    expect(nemesisReason(card({ recentDelta: 0.1 }))).not.toMatch(/worse|improving/)
  })
})

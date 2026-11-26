import { describe, expect, it } from 'vitest'
import {
  MIN_ROUNDS_FOR_ACCURACY_BEST,
  formatRunShareText,
  personalBests,
  type BestsRun,
  type ShareRunInput,
} from '../src/arena'

const share = (over: Partial<ShareRunInput> = {}): ShareRunInput => ({
  result: 'victory',
  guardianName: 'The Warden',
  boss: false,
  rounds: 10,
  correct: 8,
  accuracy: 0.8,
  bestCombo: 6,
  crits: 2,
  score: 900,
  ...over,
})

describe('formatRunShareText', () => {
  it('writes a recap and labels it a self-reported practice log', () => {
    const t = formatRunShareText(share())
    expect(t).toContain('Review Arena practice run: Victory vs The Warden')
    expect(t).toContain('8/10 correct (80%)')
    expect(t).toContain('best combo 6')
    expect(t.split('\n').pop()).toBe('Self-reported practice log.')
  })
  it('marks boss runs and defeats', () => {
    const t = formatRunShareText(share({ boss: true, result: 'defeat' }))
    expect(t).toContain('Defeat vs The Warden (boss)')
  })
  it('singularizes one crit', () => {
    expect(formatRunShareText(share({ crits: 1 }))).toContain('1 crit ·')
  })
  it('adds twist and rank lines only when present', () => {
    expect(formatRunShareText(share())).not.toContain('Twist')
    const t = formatRunShareText(share({ modifierName: 'Glass Cannon', rankName: 'Squire' }))
    expect(t).toContain('Twist: Glass Cannon · Practice rank: Squire')
  })
  it('clamps a bad accuracy into 0-100', () => {
    expect(formatRunShareText(share({ accuracy: 4 }))).toContain('(100%)')
    expect(formatRunShareText(share({ accuracy: -1 }))).toContain('(0%)')
  })
  it('never includes ids, deck names or card text fields', () => {
    const t = formatRunShareText(share())
    expect(t).not.toMatch(/deck|card content|runId/i)
  })
})

const bestRun = (id: number, over: Partial<BestsRun> = {}): BestsRun => ({
  id,
  result: 'victory',
  rounds: 10,
  correct: 8,
  accuracy: 0.8,
  bestCombo: 5,
  score: 500,
  durationMs: 60_000,
  ...over,
})

describe('personalBests', () => {
  it('is empty for no runs', () => {
    expect(personalBests([])).toEqual({
      bestScore: null,
      bestCombo: null,
      bestAccuracy: null,
      fastestPerCard: null,
      longestWinStreak: 0,
    })
  })
  it('finds the best score and combo, earliest wins ties', () => {
    const b = personalBests([
      bestRun(1, { score: 700, bestCombo: 6 }),
      bestRun(2, { score: 700, bestCombo: 9 }),
      bestRun(3, { score: 650 }),
    ])
    expect(b.bestScore).toEqual({ runId: 1, value: 700 })
    expect(b.bestCombo).toEqual({ runId: 2, value: 9 })
  })
  it('ignores short runs for the accuracy best', () => {
    const b = personalBests([
      bestRun(1, { rounds: MIN_ROUNDS_FOR_ACCURACY_BEST - 1, accuracy: 1 }),
      bestRun(2, { accuracy: 0.9 }),
    ])
    expect(b.bestAccuracy).toEqual({ runId: 2, value: 0.9 })
  })
  it('has no accuracy best when every run is short', () => {
    expect(personalBests([bestRun(1, { rounds: 3 })]).bestAccuracy).toBeNull()
  })
  it('fastest per card counts timed victories only', () => {
    const b = personalBests([
      bestRun(1, { durationMs: 30_000 }),
      bestRun(2, { result: 'defeat', durationMs: 5_000 }),
      bestRun(3, { durationMs: 0 }),
      bestRun(4, { durationMs: 40_000 }),
    ])
    expect(b.fastestPerCard).toEqual({ runId: 1, value: 3000 })
  })
  it('longest win streak resets on defeats', () => {
    const b = personalBests([
      bestRun(1),
      bestRun(2),
      bestRun(3, { result: 'defeat' }),
      bestRun(4),
      bestRun(5),
      bestRun(6),
    ])
    expect(b.longestWinStreak).toBe(3)
  })
})

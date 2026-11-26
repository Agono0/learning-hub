import { describe, it, expect } from 'vitest'
import {
  summarizeHeadToHead,
  headToHeadLeader,
  headToHeadEloGap,
  type HeadToHeadEncounter,
} from '../src/leagues/index.js'

function duel(
  id: string,
  winner: string | null,
  completedAt: string,
  overrides: Partial<HeadToHeadEncounter> = {},
): HeadToHeadEncounter {
  return {
    duelId: id,
    winner,
    correctA: 8,
    correctB: 6,
    total: 10,
    correctTimeMsA: 8000,
    correctTimeMsB: 9000,
    completedAt,
    ...overrides,
  }
}

describe('head-to-head summaries', () => {
  it('is empty when the pair never duelled', () => {
    const s = summarizeHeadToHead('amr', 'sara', [])
    expect(s.duels).toBe(0)
    expect(s.winsA).toBe(0)
    expect(s.winRateA).toBe(0)
    expect(s.lastResult).toBeNull()
    expect(s.lastDuelAt).toBeNull()
    expect(headToHeadLeader(s)).toEqual({ leader: null, edge: 0, even: true })
  })

  it('counts wins, draws and streaks in completion order (not input order)', () => {
    const s = summarizeHeadToHead('amr', 'sara', [
      duel('d3', 'amr', '2026-11-10T00:00:00.000Z'),
      duel('d1', 'amr', '2026-11-01T00:00:00.000Z'),
      duel('d2', null, '2026-11-05T00:00:00.000Z'),
      duel('d4', 'amr', '2026-11-12T00:00:00.000Z'),
    ])
    expect(s.duels).toBe(4)
    expect(s.winsA).toBe(3)
    expect(s.winsB).toBe(0)
    expect(s.draws).toBe(1)
    expect(s.winRateA).toBe(1)
    // streak: W, draw (breaks), W, W => current streak 2
    expect(s.streakA).toBe(2)
    expect(s.streakB).toBe(0)
    expect(s.lastResult).toBe('A')
    expect(s.lastDuelAt).toBe('2026-11-12T00:00:00.000Z')
    expect(headToHeadLeader(s)).toEqual({ leader: 'amr', edge: 3, even: false })
  })

  it('tracks accuracy and correct-answer speed per side', () => {
    const s = summarizeHeadToHead('amr', 'sara', [
      duel('d1', 'amr', '2026-11-01T00:00:00.000Z', {
        correctA: 9,
        correctB: 9,
        total: 10,
        correctTimeMsA: 9000,
        correctTimeMsB: 18000,
      }),
    ])
    expect(s.accuracyA).toBe(0.9)
    expect(s.accuracyB).toBe(0.9)
    expect(s.avgCorrectMsA).toBe(1000)
    expect(s.avgCorrectMsB).toBe(2000)
  })

  it('keeps streaks at zero after a draw and mirrors by argument order', () => {
    const encounters = [
      duel('d1', null, '2026-11-01T00:00:00.000Z'),
      duel('d2', 'sara', '2026-11-02T00:00:00.000Z'),
    ]
    const a = summarizeHeadToHead('amr', 'sara', encounters)
    const b = summarizeHeadToHead('sara', 'amr', encounters)
    expect(a.streakA).toBe(0)
    expect(a.streakB).toBe(1)
    expect(a.lastResult).toBe('B')
    expect(b.winsA).toBe(a.winsB)
    expect(b.lastResult).toBe('A')
  })

  it('frames the Elo gap from either side', () => {
    expect(headToHeadEloGap(1100, 1000)).toEqual({ gap: 100, higher: 'A' })
    expect(headToHeadEloGap(1000, 1100)).toEqual({ gap: -100, higher: 'B' })
    expect(headToHeadEloGap(1000, 1000)).toEqual({ gap: 0, higher: null })
  })
})

import { describe, expect, it } from 'vitest'
import {
  duelPlausibilityFlags,
  leaguePlausibilityReport,
  PLAUSIBILITY_DEFAULTS,
  type DuelRuntime,
} from '../src/leagues'

function ans(promptId: string, answer: string, elapsedMs: number) {
  return { promptId, answer, elapsedMs, receivedAt: 1 }
}

function duel(overrides: Partial<DuelRuntime> = {}): DuelRuntime {
  return {
    id: 'd1',
    playerA: 'usr_a',
    playerB: 'usr_b',
    prompts: [
      { id: 'p1', question: 'q1', answers: ['one'] },
      { id: 'p2', question: 'q2', answers: ['two'] },
      { id: 'p3', question: 'q3', answers: ['three'] },
      { id: 'p4', question: 'q4', answers: ['four'] },
    ],
    openedAt: 1,
    expiresAt: 2,
    sideA: null,
    sideB: null,
    answersA: [],
    answersB: [],
    status: 'open',
    result: null,
    ...overrides,
  }
}

describe('duelPlausibilityFlags', () => {
  it('flags nothing for a normal, varied human pattern', () => {
    const d = duel({
      answersA: [
        ans('p1', 'one', 2400),
        ans('p2', 'wrong', 5100),
        ans('p3', 'three', 3300),
        ans('p4', 'four', 1900),
      ],
    })
    expect(duelPlausibilityFlags(d)).toEqual([])
  })

  it('flags answers faster than anyone can read', () => {
    const d = duel({
      answersA: [ans('p1', 'one', 80), ans('p2', 'two', 90), ans('p3', 'x', 4000)],
    })
    const flags = duelPlausibilityFlags(d)
    expect(flags.map((f) => f.code)).toContain('faster_than_reading')
    expect(flags[0]!.handle).toBe('usr_a')
  })

  it('does not flag a single quick answer among slow ones', () => {
    const d = duel({
      answersA: [ans('p1', 'one', 100), ans('p2', 'two', 3000), ans('p3', 'x', 4000)],
    })
    expect(duelPlausibilityFlags(d).map((f) => f.code)).not.toContain('faster_than_reading')
  })

  it('flags machine-regular timing only once there are enough samples', () => {
    const few = duel({ answersA: [ans('p1', 'one', 1000), ans('p2', 'two', 1000)] })
    expect(duelPlausibilityFlags(few).map((f) => f.code)).not.toContain('machine_regular_timing')
    const many = duel({
      answersA: [
        ans('p1', 'one', 1000),
        ans('p2', 'two', 1005),
        ans('p3', 'three', 998),
        ans('p4', 'four', 1002),
      ],
    })
    expect(duelPlausibilityFlags(many).map((f) => f.code)).toContain('machine_regular_timing')
  })

  it('flags a perfect and near-instant run', () => {
    const d = duel({
      answersB: [
        ans('p1', 'one', 400),
        ans('p2', 'two', 500),
        ans('p3', 'three', 300),
        ans('p4', 'four', 600),
      ],
    })
    const codes = duelPlausibilityFlags(d).map((f) => f.code)
    expect(codes).toContain('perfect_and_instant')
    expect(duelPlausibilityFlags(d).every((f) => f.handle === 'usr_b')).toBe(true)
  })

  it('does not call a slow perfect run suspicious', () => {
    const d = duel({
      answersB: [
        ans('p1', 'one', 3000),
        ans('p2', 'two', 5200),
        ans('p3', 'three', 2500),
        ans('p4', 'four', 4100),
      ],
    })
    expect(duelPlausibilityFlags(d)).toEqual([])
  })

  it('flags identical answer text across a whole run', () => {
    const d = duel({
      answersA: [
        ans('p1', 'x', 1500),
        ans('p2', 'X ', 3500),
        ans('p3', 'x', 2500),
        ans('p4', 'x', 6000),
      ],
    })
    expect(duelPlausibilityFlags(d).map((f) => f.code)).toContain('all_answers_same_text')
  })

  it('honors custom thresholds', () => {
    const d = duel({ answersA: [ans('p1', 'one', 500), ans('p2', 'two', 600)] })
    expect(duelPlausibilityFlags(d)).toEqual([])
    const strict = duelPlausibilityFlags(d, { minReadingMs: 1000 })
    expect(strict.map((f) => f.code)).toContain('faster_than_reading')
  })

  it('is deterministic and does not mutate the duel', () => {
    const d = duel({ answersA: [ans('p1', 'one', 50), ans('p2', 'two', 60)] })
    const before = JSON.stringify(d)
    const a = duelPlausibilityFlags(d)
    const b = duelPlausibilityFlags(d)
    expect(a).toEqual(b)
    expect(JSON.stringify(d)).toBe(before)
  })

  it('exposes sane defaults', () => {
    expect(PLAUSIBILITY_DEFAULTS.minReadingMs).toBeGreaterThan(100)
    expect(PLAUSIBILITY_DEFAULTS.minSamples).toBeGreaterThanOrEqual(3)
  })
})

describe('leaguePlausibilityReport', () => {
  it('groups flags by handle across duels', () => {
    const d1 = duel({ id: 'd1', answersA: [ans('p1', 'one', 50), ans('p2', 'two', 60)] })
    const d2 = duel({ id: 'd2', answersA: [ans('p1', 'one', 40), ans('p2', 'two', 70)] })
    const report = leaguePlausibilityReport({ d1, d2 })
    expect(Object.keys(report)).toEqual(['usr_a'])
    expect(report.usr_a!.length).toBeGreaterThanOrEqual(2)
  })

  it('is empty when nothing looks odd', () => {
    expect(leaguePlausibilityReport({ d1: duel() })).toEqual({})
  })
})

import { describe, expect, it } from 'vitest'
import {
  EMPTY_FORM,
  MAX_SESSION_CARDS,
  buildSessionQuery,
  dueLabel,
  emptiedBy,
  pct,
} from '../src/components/study-session/types'
import { STUDY_SESSION_LIMITS } from '@learning-hub/core'

const q = (over: Partial<typeof EMPTY_FORM>) => buildSessionQuery({ ...EMPTY_FORM, ...over })

describe('study session form', () => {
  it('matches the core session cap', () => {
    expect(MAX_SESSION_CARDS).toBe(STUDY_SESSION_LIMITS.maxCards)
  })

  it('builds the default query', () => {
    expect(q({})).toEqual({ ok: true, query: { sort: 'most-overdue', limit: '20' } })
  })

  it('turns percentages into fractions and cleans tags', () => {
    const r = q({
      tags: ' #bio, ch1 ,',
      states: [3, 1],
      minLapses: '2',
      recallBelowPct: '80',
      dueBy: '0',
      deckId: '4',
    })
    expect(r).toEqual({
      ok: true,
      query: {
        sort: 'most-overdue',
        limit: '20',
        deckIds: '4',
        tags: 'bio,ch1',
        states: '1,3',
        minLapses: '2',
        recallBelow: '0.8',
        dueByDays: '0',
      },
    })
  })

  it.each([
    [{ limit: '0' }, /Cards per session/],
    [{ limit: '101' }, /Cards per session/],
    [{ limit: 'ten' }, /Cards per session/],
    [{ minLapses: '-1' }, /Minimum lapses/],
    [{ minLapses: '1.5' }, /Minimum lapses/],
    [{ recallBelowPct: '0' }, /recall below/],
    [{ recallBelowPct: '100' }, /recall below/],
    [{ tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') }, /at most 10/],
  ])('shows an error and never clamps for %j', (over, re) => {
    const r = q(over)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(re as RegExp)
  })

  it('formats recall, due and the emptying step', () => {
    expect(pct(null)).toBe('no estimate')
    expect(pct(0.724)).toBe('72%')
    expect(dueLabel(-3)).toBe('3 days overdue')
    expect(dueLabel(0)).toBe('due now')
    expect(dueLabel(5)).toBe('due in 5 days')
    expect(
      emptiedBy([
        { key: 'eligible', label: 'a', count: 9 },
        { key: 'tags', label: 'b', count: 0 },
      ])?.key,
    ).toBe('tags')
    expect(emptiedBy([{ key: 'eligible', label: 'a', count: 3 }])).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { parseStudySessionFilter, STUDY_SESSION_LIMITS } from '../src/study-session'

const ok = (v: unknown) => {
  const r = parseStudySessionFilter(v)
  if (!r.ok) throw new Error(r.error)
  return r.filter
}
const err = (v: unknown) => {
  const r = parseStudySessionFilter(v)
  return r.ok ? null : r.error
}

describe('parseStudySessionFilter', () => {
  it('fills defaults for an empty filter', () => {
    expect(ok({})).toEqual({ sort: 'most-overdue', limit: STUDY_SESSION_LIMITS.defaultLimit })
  })

  it('accepts every field in range', () => {
    const f = ok({
      deckIds: [1, 2],
      tags: [' bio ', 'chem'],
      states: [1, 2, 3],
      minLapses: 2,
      maxLapses: 9,
      recallBelow: 0.8,
      dueByDays: 7,
      sort: 'lowest-recall',
      limit: 50,
    })
    expect(f.tags).toEqual(['bio', 'chem'])
    expect(f.limit).toBe(50)
  })

  it('caps a session at 100 cards and never clamps silently', () => {
    expect(STUDY_SESSION_LIMITS.maxCards).toBe(100)
    expect(ok({ limit: 100 }).limit).toBe(100)
    expect(err({ limit: 101 })).toMatch(/limit/)
    expect(err({ limit: 0 })).toMatch(/limit/)
    expect(err({ limit: 1.5 })).toMatch(/limit/)
  })

  it('rejects unknown keys so a typo cannot widen a session', () => {
    expect(err({ tagz: ['a'] })).toMatch(/unknown filter: tagz/)
  })

  it('rejects non-object input', () => {
    for (const v of [null, 5, 'x', [], undefined]) expect(err(v)).toMatch(/object/)
  })

  it.each([
    [{ deckIds: [] }, /deckIds/],
    [{ deckIds: [0] }, /deckIds/],
    [{ deckIds: [1, 1] }, /deckIds/],
    [{ deckIds: ['1'] }, /deckIds/],
    [{ deckIds: Array.from({ length: 51 }, (_, i) => i + 1) }, /deckIds/],
    [{ tags: [''] }, /tags/],
    [{ tags: ['  '] }, /tags/],
    [{ tags: ['a', 'a'] }, /tags/],
    [{ tags: ['x'.repeat(61)] }, /tags/],
    [{ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, /tags/],
    [{ states: [4] }, /states/],
    [{ states: [1, 1] }, /states/],
    [{ minLapses: -1 }, /minLapses/],
    [{ maxLapses: 1001 }, /maxLapses/],
    [{ minLapses: 5, maxLapses: 2 }, /above/],
    [{ recallBelow: 0 }, /recallBelow/],
    [{ recallBelow: 1 }, /recallBelow/],
    [{ recallBelow: NaN }, /recallBelow/],
    [{ recallBelow: Infinity }, /recallBelow/],
    [{ recallBelow: '0.5' }, /recallBelow/],
    [{ dueByDays: -1 }, /dueByDays/],
    [{ dueByDays: 366 }, /dueByDays/],
    [{ dueByDays: NaN }, /dueByDays/],
    [{ sort: 'random' }, /sort/],
  ])('rejects %j', (input, re) => {
    expect(err(input)).toMatch(re as RegExp)
  })
})

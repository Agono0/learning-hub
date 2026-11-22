/**
 * Exhaustive tests for the short-syntax parser (S3-09): estimate chains,
 * date words, tags/projects, priorities, deadlines, repeats, quoting,
 * warning surfaces, and the autocomplete token model.
 */
import { describe, expect, it } from 'vitest'
import {
  ESTIMATE_MAX_MS,
  parseEstimateMs,
  parseShortSyntax,
  resolveDateWord,
  suggestAt,
  tokenizeShortSyntax,
} from '../src/tasks/short-syntax'

const NOW = '2026-11-22T10:00:00.000Z' // a Sunday

describe('parseEstimateMs', () => {
  it('parses minute/hour chains', () => {
    expect(parseEstimateMs('10m')).toBe(600_000)
    expect(parseEstimateMs('1h')).toBe(3_600_000)
    expect(parseEstimateMs('1h30m')).toBe(5_400_000)
    expect(parseEstimateMs('45m')).toBe(2_700_000)
    expect(parseEstimateMs('1H30M')).toBe(5_400_000)
    expect(parseEstimateMs('0m')).toBeNull()
    expect(parseEstimateMs('1w')).toBeNull()
    expect(parseEstimateMs('abc')).toBeNull()
    expect(parseEstimateMs(`${51}h`)).toBeNull() // over the 50h cap
    expect(ESTIMATE_MAX_MS).toBe(180_000_000)
  })
})

describe('resolveDateWord', () => {
  it('resolves today/tomorrow/+N/absolute days', () => {
    expect(resolveDateWord('today', NOW)).toBe('2026-11-22')
    expect(resolveDateWord('tom', NOW)).toBe('2026-11-23')
    expect(resolveDateWord('tomorrow', NOW)).toBe('2026-11-23')
    expect(resolveDateWord('+3', NOW)).toBe('2026-11-25')
    expect(resolveDateWord('2026-12-24', NOW)).toBe('2026-12-24')
    expect(resolveDateWord('2026-13-99', NOW)).toBeNull()
    expect(resolveDateWord('12/24', NOW)).toBeNull() // locale soup, deliberately
    expect(resolveDateWord('every', NOW)).toBeNull()
  })
})

describe('parseShortSyntax — title only', () => {
  it('plain text is the title, whitespace collapsed', () => {
    const r = parseShortSyntax('  Write   the  matrix  ', NOW)
    expect(r).toMatchObject({ title: 'Write the matrix', tags: [], warnings: [] })
  })

  it('quoted spans become verbatim title text (tokens inside are protected)', () => {
    const r = parseShortSyntax('Discuss "#todo and +plans" tomorrow', NOW)
    expect(r.title).toContain('#todo and +plans')
    expect(r.tags).toEqual([])
    expect(r.project).toBeNull()
  })

  it('a bare prefix being typed is dropped from the title', () => {
    const r = parseShortSyntax('Call mum @', NOW)
    expect(r.title).toBe('Call mum')
  })
})

describe('parseShortSyntax — tags, projects, priorities, estimates', () => {
  it('collects #tags deduped, case preserved', () => {
    const r = parseShortSyntax('Ship #work #DeepFocus #work', NOW)
    expect(r.title).toBe('Ship')
    expect(r.tags).toEqual(['work', 'DeepFocus'])
  })

  it('last +project wins', () => {
    const r = parseShortSyntax('Task +alpha +beta', NOW)
    expect(r.project).toBe('beta')
    expect(r.title).toBe('Task')
  })

  it('maps p1..p3 onto the priority ladder', () => {
    expect(parseShortSyntax('Urgent p1', NOW).priority).toBe('high')
    expect(parseShortSyntax('Soon p2', NOW).priority).toBe('medium')
    expect(parseShortSyntax('Someday p3', NOW).priority).toBe('low')
    expect(parseShortSyntax('Norm', NOW).priority).toBeNull()
  })

  it('parses estimates in all chain shapes', () => {
    expect(parseShortSyntax('Fix bug 10m', NOW).estimateMs).toBe(600_000)
    expect(parseShortSyntax('Deep dive 1h30m', NOW).estimateMs).toBe(5_400_000)
    expect(parseShortSyntax('Read 45m p3', NOW)).toMatchObject({
      estimateMs: 2_700_000,
      priority: 'low',
    })
    expect(parseShortSyntax('Big 51h', NOW)).toMatchObject({
      estimateMs: null,
      warnings: ['"51h" is not a usable estimate (max 50h).'],
    })
    expect(parseShortSyntax('Big 51h', NOW).title).toBe('Big') // bad estimate dropped from title
  })
})

describe('parseShortSyntax — dates and deadlines', () => {
  it('resolves @today / @tom / @+3 / absolute dates', () => {
    expect(parseShortSyntax('Plan @today', NOW).due).toEqual({
      day: '2026-11-22',
      source: '@today',
    })
    expect(parseShortSyntax('Plan @tom', NOW).due).toEqual({ day: '2026-11-23', source: '@tom' })
    expect(parseShortSyntax('Plan @+3', NOW).due).toEqual({ day: '2026-11-25', source: '@+3' })
    expect(parseShortSyntax('Plan @2026-12-24', NOW).due).toEqual({
      day: '2026-12-24',
      source: '@2026-12-24',
    })
  })

  it('last @date wins; unknown dates warn and vanish from the title', () => {
    const r = parseShortSyntax('Plan @2026-12-01 @2026-12-02', NOW)
    expect(r.due?.day).toBe('2026-12-02')
    const bad = parseShortSyntax('Plan @someday', NOW)
    expect(bad.due).toBeNull()
    expect(bad.title).toBe('Plan')
    expect(bad.warnings[0]).toContain('"@someday" is not a date I understood')
  })

  it('parses !deadlines independently of @due', () => {
    const r = parseShortSyntax('Report @tom !2026-11-30', NOW)
    expect(r.due?.day).toBe('2026-11-23')
    expect(r.deadline?.day).toBe('2026-11-30')
    expect(r.title).toBe('Report')
  })
})

describe('parseShortSyntax — repeats (@every)', () => {
  it('parses @every cadences and anchors the first occurrence as due', () => {
    const r = parseShortSyntax('Water the plants @every 3d', NOW)
    expect(r.repeat).toEqual({ cycle: 'd', interval: 3 })
    expect(r.due?.day).toBe('2026-11-25') // today + 3 days
    expect(r.title).toBe('Water the plants')
  })

  it('supports bare cycles and explicit dates with @every', () => {
    expect(parseShortSyntax('Review @every w', NOW).repeat).toEqual({ cycle: 'w', interval: 1 })
    const withDate = parseShortSyntax('Review @2026-12-01 @every 1w', NOW)
    expect(withDate.repeat).toEqual({ cycle: 'w', interval: 1 })
    expect(withDate.due?.day).toBe('2026-12-01') // explicit date anchors the repeat
  })

  it('warns when the cadence is missing or unparseable', () => {
    const r = parseShortSyntax('Stretch @every', NOW)
    expect(r.repeat).toBeNull()
    expect(r.warnings).toContain('"@every" needs a cadence like 1w, 3d, w or d.')
    const bad = parseShortSyntax('Jog @every 1x', NOW)
    expect(bad.warnings).toContain('"@every" needs a cadence like 1w, 3d, w or d.')
    expect(bad.title).toBe('Jog 1x') // the stray token stays as title text
  })
})

describe('parseShortSyntax — the full SP bar', () => {
  it('parses everything at once (the flagship case)', () => {
    const r = parseShortSyntax(
      'Fix the login bug #work #urgent +web 1h30m @tom p1 !2026-11-30',
      NOW,
    )
    expect(r).toMatchObject({
      title: 'Fix the login bug',
      tags: ['work', 'urgent'],
      project: 'web',
      estimateMs: 5_400_000,
      priority: 'high',
      deadline: { day: '2026-11-30', source: '!2026-11-30' },
      repeat: null,
      warnings: [],
    })
    expect(r.due?.day).toBe('2026-11-23')
  })
})

describe('tokenizeShortSyntax (autocomplete model)', () => {
  it('classifies tokens with exact offsets', () => {
    const tokens = tokenizeShortSyntax('Fix #work +web 10m @tom p1')
    expect(tokens.map((t) => t.kind)).toEqual([
      'unknown', // plain word → title text
      'tag',
      'project',
      'estimate',
      'due',
      'priority',
    ])
    expect(tokens[0]).toMatchObject({ raw: 'Fix', start: 0, end: 3 })
    expect(tokens[1]).toMatchObject({ raw: '#work', start: 4, end: 9 })
    expect(tokens[4]).toMatchObject({ raw: '@tom', start: 19, end: 23 })
  })

  it('marks quoted spans and keeps them out of classification', () => {
    const tokens = tokenizeShortSyntax('Say "#todo" @today')
    expect(tokens[0]).toMatchObject({ kind: 'quoted', raw: '"#todo"' })
    expect(tokens[1]).toMatchObject({ kind: 'due', raw: '@today' })
  })
})

describe('suggestAt (autocomplete context)', () => {
  it('offers a kind for a just-typed prefix', () => {
    expect(suggestAt('Fix @', 6)).toMatchObject({ kind: 'due', trigger: '@', query: '' })
    expect(suggestAt('Fix #', 5)).toMatchObject({ kind: 'tag' })
    expect(suggestAt('Fix +', 5)).toMatchObject({ kind: 'project' })
    expect(suggestAt('Fix !', 5)).toMatchObject({ kind: 'deadline' })
  })

  it('offers a kind with the partial query while typing', () => {
    expect(suggestAt('Fix @to', 7)).toMatchObject({ kind: 'due', query: 'to' })
    expect(suggestAt('Fix #dee', 8)).toMatchObject({ kind: 'tag', query: 'dee' })
    expect(suggestAt('Fix @every ', 11)).toMatchObject({ kind: 'repeat' })
  })

  it('offers estimates for numeric input and nothing for prose', () => {
    expect(suggestAt('Fix 1h3', 7)?.kind).toBe('estimate')
    expect(suggestAt('Fix 45', 6)?.kind).toBe('estimate')
    expect(suggestAt('Fix hello wor', 13)).toBeNull()
  })
})

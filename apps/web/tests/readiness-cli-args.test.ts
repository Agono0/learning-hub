import { describe, expect, it } from 'vitest'
import { parseReadinessArgs } from '../../cli/src/commands/readiness'

describe('readiness CLI argument parsing', () => {
  it('applies the same defaults as the API', () => {
    expect(parseReadinessArgs(['--date', '2026-12-01'])).toMatchObject({
      date: '2026-12-01',
      plan: 'on-schedule',
      perDay: 20,
      target: 0.85,
      budget: 20,
    })
  })
  it('prefers --exam over --date', () => {
    const q = parseReadinessArgs(['--exam', '4', '--date', '2026-12-01'])
    expect(q.examId).toBe(4)
    expect(q.date).toBeUndefined()
  })
  it('parses deck lists and plans', () => {
    const q = parseReadinessArgs([
      '--exam',
      '1',
      '--decks',
      '1, 2,3',
      '--plan',
      'capacity',
      '--per-day',
      '7',
    ])
    expect(q.deckIds).toEqual([1, 2, 3])
    expect(q.plan).toBe('capacity')
    expect(q.perDay).toBe(7)
  })
  it.each([
    [['--date', '2026-12-01', '--target', '0.4']],
    [['--date', '2026-12-01', '--target', '1']],
    [['--date', '2026-12-01', '--plan', 'cram']],
    [['--date', '2026-12-01', '--per-day', '1001']],
    [['--date', '2026-12-01', '--budget', '-1']],
    [['--date', '2026-12-01', '--decks', '1,x']],
    [['--exam', '0']],
    [[]],
  ])('rejects %j', (args) => {
    expect(() => parseReadinessArgs(args)).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { parseStudySessionArgs } from '../../cli/src/commands/study-session'
import { parseStudySessionFilter } from '@learning-hub/core'

describe('study-session CLI argument parsing', () => {
  it('turns flags into the object core validates', () => {
    const o = parseStudySessionArgs([
      '--decks',
      '1, 2',
      '--tags',
      'a, b',
      '--states',
      '1,2',
      '--min-lapses',
      '3',
      '--recall-below',
      '0.8',
      '--due-by',
      '7',
      '--sort',
      'lowest-recall',
      '--limit',
      '40',
    ])
    expect(o).toEqual({
      deckIds: [1, 2],
      tags: ['a', 'b'],
      states: [1, 2],
      minLapses: 3,
      recallBelow: 0.8,
      dueByDays: 7,
      sort: 'lowest-recall',
      limit: 40,
    })
    expect(parseStudySessionFilter(o).ok).toBe(true)
  })

  it('no flags is an empty object', () => {
    expect(parseStudySessionArgs([])).toEqual({})
  })

  it('throws on non-numeric and non-finite numbers', () => {
    for (const bad of ['abc', '', 'NaN', 'Infinity'])
      expect(() => parseStudySessionArgs(['--limit', bad])).toThrow(/number/)
    expect(() => parseStudySessionArgs(['--decks', '1,x'])).toThrow(/integers/)
    expect(() => parseStudySessionArgs(['--states', '1.5'])).toThrow(/integers/)
  })

  it('leaves range checks to core so the CLI cannot drift from the API', () => {
    const o = parseStudySessionArgs(['--limit', '101'])
    expect(parseStudySessionFilter(o).ok).toBe(false)
  })
})

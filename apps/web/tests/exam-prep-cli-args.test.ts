import { describe, expect, it } from 'vitest'
import { parseExamPrepArgs } from '../../cli/src/commands/exam-prep'

describe('exam-prep CLI argument parsing', () => {
  it('applies the same defaults as the API', () => {
    expect(parseExamPrepArgs(['--date', '2026-12-01'])).toMatchObject({
      date: '2026-12-01',
      perDay: 30,
      target: 0.85,
      minGain: 0.01,
      maxReviewsPerCard: 3,
    })
  })
  it('prefers --exam over --date', () => {
    const q = parseExamPrepArgs(['--exam', '4', '--date', '2026-12-01'])
    expect(q.examId).toBe(4)
    expect(q.date).toBeUndefined()
  })
  it('parses rest weekdays and deck lists', () => {
    const q = parseExamPrepArgs(['--exam', '1', '--rest', '0, 6', '--decks', '1,2'])
    expect(q.restWeekdays).toEqual([0, 6])
    expect(q.deckIds).toEqual([1, 2])
  })
  it('rejects bad input', () => {
    expect(() => parseExamPrepArgs([])).toThrow(/--exam/)
    expect(() => parseExamPrepArgs(['--date', 'x', '--per-day', '101'])).toThrow(/--per-day/)
    expect(() => parseExamPrepArgs(['--date', 'x', '--rest', '7'])).toThrow(/--rest/)
    expect(() => parseExamPrepArgs(['--date', 'x', '--target', '1'])).toThrow(/--target/)
    expect(() => parseExamPrepArgs(['--date', 'x', '--min-gain', '0.9'])).toThrow(/--min-gain/)
    expect(() => parseExamPrepArgs(['--date', 'x', '--max-per-card', '0'])).toThrow(
      /--max-per-card/,
    )
    expect(() => parseExamPrepArgs(['--date', 'x', '--decks', '0'])).toThrow(/--decks/)
  })
})

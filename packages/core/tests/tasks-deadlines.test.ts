/**
 * Unit tests for deadline semantics (S3-63): the due-vs-deadline
 * distinction, urgency ranking, done-task exemption, and stable sorting.
 */
import { describe, expect, it } from 'vitest'
import { deadlineOf, deadlineUrgency, isPastDeadline, sortByDeadline } from '../src/tasks/deadlines'

const TODAY = '2026-11-22'

function t(deadline: string | null, isDone = false) {
  return { deadline, isDone }
}

describe('deadlineOf / deadlineUrgency', () => {
  it('deadlines are explicit only — due dates are not deadlines', () => {
    expect(deadlineOf({ deadline: '2026-11-30' })).toBe('2026-11-30')
    expect(deadlineOf({ deadline: null })).toBeNull()
  })

  it('ranks past / today / soon / later / none', () => {
    expect(deadlineUrgency(t('2026-11-21'), TODAY)).toBe('past')
    expect(deadlineUrgency(t('2026-11-22'), TODAY)).toBe('today')
    expect(deadlineUrgency(t('2026-11-25'), TODAY)).toBe('soon') // +3, inclusive
    expect(deadlineUrgency(t('2026-11-26'), TODAY)).toBe('later')
    expect(deadlineUrgency(t(null), TODAY)).toBe('none')
  })

  it('unparseable deadlines refuse to be judged (never false-alarm red)', () => {
    expect(deadlineUrgency(t('not-a-date'), TODAY)).toBe('none')
  })

  it('done tasks are never past-deadline', () => {
    expect(isPastDeadline(t('2026-11-01', false), TODAY)).toBe(true)
    expect(isPastDeadline(t('2026-11-01', true), TODAY)).toBe(false)
  })
})

describe('sortByDeadline', () => {
  it('orders by pressure: past, today, soon, later, none', () => {
    const tasks = [
      t(null), // none
      t('2026-11-25'), // soon
      t('2026-11-21'), // past
      t('2026-11-22'), // today
      t('2026-12-30'), // later
    ]
    expect(sortByDeadline(tasks, TODAY).map((x) => x.deadline)).toEqual([
      '2026-11-21',
      '2026-11-22',
      '2026-11-25',
      '2026-12-30',
      null,
    ])
  })

  it('is stable within the same urgency (input order preserved)', () => {
    const a = t('2026-11-21')
    const b = t('2026-11-21')
    const out = sortByDeadline([b, a], TODAY)
    expect(out[0]).toBe(b)
    expect(out[1]).toBe(a)
  })

  it('does not mutate the input', () => {
    const tasks = [t(null), t('2026-11-21')]
    const copy = [...tasks]
    sortByDeadline(tasks, TODAY)
    expect(tasks).toEqual(copy)
  })
})

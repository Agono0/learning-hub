/**
 * Unit tests for Today membership (S3-65): the due-date-only rule, overdue
 * semantics (done and won't-do exempt), and the view/count helpers.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import {
  dueDayOf,
  isOverdueTask,
  isTodayTask,
  overdueTasks,
  todayCount,
  todaysTasks,
  tomorrowKey,
} from '../src/tasks/today'

const TODAY = '2026-11-22'

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 't',
    notes: null,
    priority: 'none',
    estimateMs: null,
    timeSpentOnDay: {},
    due: null,
    dueWithTime: false,
    deadline: null,
    isDone: false,
    doneAt: null,
    wonthado: false,
    repeatCfgId: null,
    order: 0,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
    ...overrides,
  })
}

describe('dueDayOf / tomorrowKey', () => {
  it('extracts the date part from date-only and timed dues', () => {
    expect(dueDayOf(task({ due: TODAY }))).toBe(TODAY)
    expect(dueDayOf(task({ due: '2026-11-22T14:00:00.000Z', dueWithTime: true }))).toBe(TODAY)
    expect(dueDayOf(task({ due: null }))).toBeNull()
  })

  it('tomorrow key is a pure day add', () => {
    expect(tomorrowKey(TODAY)).toBe('2026-11-23')
    expect(tomorrowKey('2026-11-30')).toBe('2026-12-01') // month rollover
  })
})

describe('isTodayTask (due-date-only rule)', () => {
  it('membership is exactly due == today', () => {
    expect(isTodayTask(task({ due: TODAY }), TODAY)).toBe(true)
    expect(isTodayTask(task({ due: '2026-11-22T09:00:00.000Z', dueWithTime: true }), TODAY)).toBe(
      true,
    )
    expect(isTodayTask(task({ due: '2026-11-23' }), TODAY)).toBe(false)
    expect(isTodayTask(task({ due: null }), TODAY)).toBe(false)
    expect(isTodayTask(task({ due: '2026-11-21' }), TODAY)).toBe(false) // overdue ≠ today
  })

  it('done state does not change membership (views keep completed checked)', () => {
    expect(
      isTodayTask(task({ due: TODAY, isDone: true, doneAt: '2026-11-22T08:00:00.000Z' }), TODAY),
    ).toBe(true)
  })
})

describe('isOverdueTask', () => {
  it('strictly-before-today, open, not won\u2019t-do', () => {
    expect(isOverdueTask(task({ due: '2026-11-21' }), TODAY)).toBe(true)
    expect(isOverdueTask(task({ due: TODAY }), TODAY)).toBe(false)
    expect(isOverdueTask(task({ due: '2026-11-21', isDone: true, doneAt: NOW() }), TODAY)).toBe(
      false,
    )
    expect(isOverdueTask(task({ due: '2026-11-21', wonthado: true }), TODAY)).toBe(false)
    expect(isOverdueTask(task({ due: null }), TODAY)).toBe(false)
  })
})

describe('todaysTasks / overdueTasks / todayCount', () => {
  const list = [
    task({ id: 1, due: TODAY }), // today, open
    task({ id: 2, due: TODAY, isDone: true, doneAt: NOW() }), // today, done
    task({ id: 3, due: TODAY, wonthado: true }), // today, won't-do
    task({ id: 4, due: '2026-11-20' }), // overdue
    task({ id: 5, due: '2026-11-19' }), // more overdue (sorts first)
    task({ id: 6, due: '2026-11-23' }), // tomorrow
    task({ id: 7, due: null }), // inbox
  ]

  it('todaysTasks keeps open today-members only', () => {
    expect(todaysTasks(list, TODAY).map((t) => t.id)).toEqual([1])
  })

  it('overdueTasks sorts oldest-due first and excludes done/wontdo', () => {
    const withDone = [...list, task({ id: 8, due: '2026-11-18', isDone: true, doneAt: NOW() })]
    expect(overdueTasks(withDone, TODAY).map((t) => t.id)).toEqual([5, 4])
  })

  it('todayCount counts open today members (won\u2019t-do excluded)', () => {
    expect(todayCount(list, TODAY)).toBe(1)
  })
})

function NOW(): string {
  return '2026-11-22T08:00:00.000Z'
}

/**
 * Unit tests for the won't-do state (S3-66): count exclusion, state
 * transitions, and the done-task guard.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import { countLiveTasks, isWontDo, setWontDo, withoutWontDo } from '../src/tasks/wontdo'

const NOW = '2026-11-22T10:00:00.000Z'

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
    ...(overrides.timeSpentOnDay === undefined ? {} : {}),
  })
}

describe('setWontDo / isWontDo', () => {
  it('toggles immutably and bumps updatedAt only', () => {
    const t = task()
    const wont = setWontDo(t, true, NOW)
    expect(isWontDo(wont)).toBe(true)
    expect(wont.updatedAt).toBe(NOW)
    expect(wont.createdAt).toBe(t.createdAt)
    expect(isWontDo(t)).toBe(false)
  })

  it('is idempotent in both directions', () => {
    const wont = setWontDo(task(), true, NOW)
    expect(setWontDo(wont, true, '2026-11-23T00:00:00.000Z')).toEqual(wont)
    expect(setWontDo(task(), false, NOW)).toEqual(task())
  })

  it('refuses to write off a done task (nothing to write off)', () => {
    const done = task({ isDone: true, doneAt: NOW })
    expect(setWontDo(done, true, NOW)).toEqual(done)
  })
})

describe('count exclusion', () => {
  const list = [
    task({ id: 1 }),
    task({ id: 2, wonthado: true }),
    task({ id: 3, isDone: true, doneAt: NOW }),
    task({ id: 4, wonthado: true, isDone: true, doneAt: NOW }),
  ]

  it('withoutWontDo drops written-off tasks; done optionally', () => {
    expect(withoutWontDo(list).map((t) => t.id)).toEqual([1, 3])
    expect(withoutWontDo(list, { excludeDone: true }).map((t) => t.id)).toEqual([1])
  })

  it('countLiveTasks matches the filter', () => {
    expect(countLiveTasks(list)).toBe(2)
    expect(countLiveTasks(list, { excludeDone: true })).toBe(1)
  })
})

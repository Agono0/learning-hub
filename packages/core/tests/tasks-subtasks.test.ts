/**
 * Unit tests for core subtasks (S3-04): the one-nesting-level invariant and
 * parent aggregation (time maps merge, estimates sum, progress badge math).
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, TaskDomainError, type TaskItem } from '../src/tasks'
import {
  aggregateSubtasks,
  attachSubtask,
  canHaveSubtasks,
  detachSubtask,
  subtaskProgress,
  withSubtaskAggregates,
} from '../src/tasks/subtasks'

const NOW = '2026-11-22T10:00:00.000Z'
const DAY = '2026-11-22'

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 'parent',
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  })
}

describe('nesting rules (one level)', () => {
  it('open standalone tasks can parent; subtasks, done and won\u2019t-do cannot', () => {
    expect(canHaveSubtasks(task())).toBe(true)
    expect(canHaveSubtasks(task({ parentId: 9 }))).toBe(false)
    expect(canHaveSubtasks(task({ isDone: true, doneAt: NOW }))).toBe(false)
    expect(canHaveSubtasks(task({ wonthado: true }))).toBe(false)
  })

  it('attachSubtask links the child immutably', () => {
    const parent = task({ id: 1 })
    const sub = task({ id: 2, title: 'sub' })
    const linked = attachSubtask(parent, sub, NOW)
    expect(linked.parentId).toBe(1)
    expect(linked.updatedAt).toBe(NOW)
    expect(sub.parentId).toBeNull() // source untouched
  })

  it('refuses deeper nesting, re-attach and self-parenting', () => {
    const parent = task({ id: 1 })
    const sub = task({ id: 2 })
    const linked = attachSubtask(parent, sub, NOW)
    const subSub = task({ id: 3 })

    expect(() => attachSubtask(linked, subSub, NOW)).toThrow(TaskDomainError)
    expect(() => attachSubtask(parent, linked, NOW)).toThrow(TaskDomainError)
    expect(() => attachSubtask(parent, parent, NOW)).toThrow(TaskDomainError)

    try {
      attachSubtask(linked, subSub, NOW)
    } catch (err) {
      expect((err as TaskDomainError).code).toBe('subtask-depth')
    }
  })

  it('detach clears the link and passes standalone tasks through', () => {
    const parent = task({ id: 1 })
    const linked = attachSubtask(parent, task({ id: 2 }), NOW)
    expect(detachSubtask(linked, NOW).parentId).toBeNull()
    expect(detachSubtask(task({ id: 3 }), NOW).parentId).toBeNull()
  })
})

describe('aggregation', () => {
  it('rolls per-day time and estimates up into the parent', () => {
    const parent = task({
      id: 1,
      estimateMs: 3_600_000,
      timeSpentOnDay: { [DAY]: 600_000, '2026-11-21': 300_000 },
    })
    const subs = [
      task({ id: 2, parentId: 1, estimateMs: 600_000, timeSpentOnDay: { [DAY]: 900_000 } }),
      task({ id: 3, parentId: 1, estimateMs: null, timeSpentOnDay: { '2026-11-23': 100_000 } }),
    ]
    const aggregated = aggregateSubtasks(parent, subs)
    expect(aggregated.timeSpentOnDay).toEqual({
      [DAY]: 1_500_000,
      '2026-11-21': 300_000,
      '2026-11-23': 100_000,
    })
    expect(aggregated.estimateMs).toBe(4_200_000) // own + children (null skipped)
  })

  it('children-only estimates adopt the sum when the parent has none', () => {
    const parent = task({ id: 1, estimateMs: null })
    const subs = [
      task({ id: 2, parentId: 1, estimateMs: 600_000 }),
      task({ id: 3, parentId: 1, estimateMs: 300_000 }),
    ]
    expect(aggregateSubtasks(parent, subs).estimateMs).toBe(900_000)
  })

  it('stays null when nobody has an estimate', () => {
    const parent = task({ id: 1, estimateMs: null })
    expect(aggregateSubtasks(parent, [task({ id: 2, parentId: 1 })]).estimateMs).toBeNull()
  })

  it('withSubtaskAggregates finds the parent in the list and null-misses', () => {
    const parent = task({ id: 1, timeSpentOnDay: { [DAY]: 100 } })
    const sub = task({ id: 2, parentId: 1, timeSpentOnDay: { [DAY]: 50 } })
    const other = task({ id: 3, title: 'unrelated' })
    const list = [parent, sub, other]

    expect(withSubtaskAggregates(list, 1)?.timeSpentOnDay).toEqual({ [DAY]: 150 })
    expect(withSubtaskAggregates(list, 99)).toBeNull()
  })

  it('does not roll completion state up (parent keeps its own flags)', () => {
    const parent = task({ id: 1 })
    const subs = [task({ id: 2, parentId: 1, isDone: true, doneAt: NOW })]
    const aggregated = aggregateSubtasks(parent, subs)
    expect(aggregated.isDone).toBe(false)
    expect(aggregated.doneAt).toBeNull()
  })
})

describe('subtaskProgress', () => {
  it('counts done/total over direct children in list order', () => {
    const subs = [
      task({ id: 2, parentId: 1, isDone: true, doneAt: NOW, order: 1 }),
      task({ id: 3, parentId: 1, order: 0 }),
      task({ id: 4, parentId: 1, isDone: true, doneAt: NOW, order: 2 }),
      task({ id: 5, order: 3 }), // not a subtask
    ]
    expect(subtaskProgress([task({ id: 1 }), ...subs], 1)).toEqual({
      total: 3,
      done: 2,
      pct: 67,
    })
  })

  it('zero for a childless parent', () => {
    expect(subtaskProgress([task({ id: 1 })], 1)).toEqual({ total: 0, done: 0, pct: 0 })
  })
})

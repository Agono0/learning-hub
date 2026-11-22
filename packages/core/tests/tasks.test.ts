/**
 * Unit tests for the core task domain (S3-03) — model + ops.
 *
 * SP-parity cases: defaults on create, immutable updates, complete/reopen
 * transitions (incl. the won't-do guard), duplicate semantics, the bulk
 * batch path with per-task skips, and the domain validation rules.
 */
import { describe, expect, it } from 'vitest'
import {
  bulkApply,
  completeTask,
  createTask,
  duplicateTask,
  reopenTask,
  TaskDomainError,
  taskItemSchema,
  taskPrioritySchema,
  updateTask,
  validateTask,
  type BulkOp,
  type TaskItem,
} from '../src/tasks'

const NOW = '2026-11-22T10:00:00.000Z'
const DAY = '2026-11-22'

/** A fully-valid persisted task to mutate in tests. */
function base(overrides: Partial<TaskItem> = {}): TaskItem {
  return taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [7],
    title: 'Write the parity matrix',
    notes: null,
    priority: 'medium',
    estimateMs: 3_600_000,
    timeSpentOnDay: { [DAY]: 900_000 },
    due: DAY,
    dueWithTime: false,
    deadline: null,
    isDone: false,
    doneAt: null,
    wonthado: false,
    repeatCfgId: null,
    order: 3,
    createdAt: '2026-11-21T08:00:00.000Z',
    updatedAt: '2026-11-21T08:00:00.000Z',
    ...overrides,
  })
}

describe('createTask', () => {
  it('applies SP-parity defaults and stamps timestamps', () => {
    const task = createTask({ title: 'Review the day' }, NOW)
    expect(task).toMatchObject({
      id: 0,
      parentId: null,
      projectId: null,
      tagIds: [],
      title: 'Review the day',
      priority: 'none',
      estimateMs: null,
      timeSpentOnDay: {},
      due: null,
      dueWithTime: false,
      isDone: false,
      doneAt: null,
      wonthado: false,
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('keeps explicit fields and parses through the input schema', () => {
    const task = createTask(
      { title: 'Deep work', projectId: 2, tagIds: [1, 2], priority: 'high', due: DAY },
      NOW,
    )
    expect(task.projectId).toBe(2)
    expect(task.tagIds).toEqual([1, 2])
    expect(task.priority).toBe('high')
    expect(task.due).toBe(DAY)
  })

  it('rejects an empty or whitespace title', () => {
    expect(() => createTask({ title: '' }, NOW)).toThrow()
    expect(() => createTask({ title: '   ' }, NOW)).toThrow()
  })

  it('input schema bounds the title length and tag count', () => {
    expect(() => createTask({ title: 'x'.repeat(501) }, NOW)).toThrow()
    expect(() =>
      createTask({ title: 'ok', tagIds: Array.from({ length: 51 }, (_, i) => i + 1) }, NOW),
    ).toThrow()
  })
})

describe('updateTask', () => {
  it('patches immutably and bumps updatedAt only', () => {
    const task = base()
    const next = updateTask(task, { priority: 'high', notes: 'fp' }, NOW)
    expect(next).toMatchObject({ id: 1, priority: 'high', notes: 'fp', updatedAt: NOW })
    expect(next.createdAt).toBe(task.createdAt)
    expect(task.priority).toBe('medium') // source untouched
  })

  it('rejects an empty title patch and non-positive estimate', () => {
    expect(() => updateTask(base(), { title: '' }, NOW)).toThrow()
    expect(() => updateTask(base(), { estimateMs: 0 }, NOW)).toThrow()
  })
})

describe('completeTask / reopenTask', () => {
  it('sets isDone + doneAt', () => {
    const done = completeTask(base(), NOW)
    expect(done.isDone).toBe(true)
    expect(done.doneAt).toBe(NOW)
    expect(done.updatedAt).toBe(NOW)
  })

  it('is idempotent on already-done tasks', () => {
    const done = completeTask(base(), NOW)
    expect(completeTask(done, '2026-11-23T00:00:00.000Z')).toEqual(done)
  })

  it('refuses to complete a won\u2019t-do task', () => {
    const wont = base({ wonthado: true })
    expect(() => completeTask(wont, NOW)).toThrow(TaskDomainError)
    try {
      completeTask(wont, NOW)
    } catch (err) {
      expect((err as TaskDomainError).code).toBe('wontdo-cannot-complete')
    }
  })

  it('reopen clears done and won\u2019t-do state', () => {
    const reopened = reopenTask(base({ isDone: true, doneAt: NOW, wonthado: true }), NOW)
    expect(reopened).toMatchObject({ isDone: false, doneAt: null, wonthado: false })
  })

  it('passes open tasks through unchanged', () => {
    const task = base()
    expect(reopenTask(task, NOW)).toEqual(task)
  })
})

describe('duplicateTask', () => {
  it('copies with (copy) suffix, fresh id, clean time map and next order', () => {
    const copy = duplicateTask(base(), NOW)
    expect(copy).toMatchObject({
      id: 0,
      title: 'Write the parity matrix (copy)',
      isDone: false,
      doneAt: null,
      wonthado: false,
      timeSpentOnDay: {},
      order: 4,
      projectId: null,
      tagIds: [7],
      priority: 'medium',
      estimateMs: 3_600_000,
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(copy.due).toBe(DAY) // schedule survives the copy (SP behavior)
  })

  it('accepts overrides (title wins over the (copy) suffix)', () => {
    const copy = duplicateTask(base(), NOW, { title: 'Retake', order: 0 })
    expect(copy.title).toBe('Retake')
    expect(copy.order).toBe(0)
  })

  it('even a done task duplicates as open', () => {
    const copy = duplicateTask(base({ isDone: true, doneAt: NOW }), NOW)
    expect(copy.isDone).toBe(false)
    expect(copy.doneAt).toBeNull()
  })
})

describe('bulkApply', () => {
  const t1 = base({ id: 1 })
  const t2 = base({ id: 2, wonthado: true })
  const t3 = base({ id: 3, projectId: null, tagIds: [] })

  it('completes a selection and skips won\u2019t-do tasks with the reason', () => {
    const op: BulkOp = { op: 'complete' }
    const { applied, skipped } = bulkApply([t1, t2, undefined], op, NOW)
    expect(applied.map((t) => t.id)).toEqual([1])
    expect(applied[0]?.isDone).toBe(true)
    expect(skipped).toEqual([
      { id: 2, reason: 'This task is marked as "won\u2019t do" — unmark it before completing.' },
      { id: 0, reason: 'not found' },
    ])
  })

  it('bulk complete leaves already-done tasks untouched but applied', () => {
    const done = base({ id: 5, isDone: true, doneAt: '2026-11-20T00:00:00.000Z' })
    const { applied, skipped } = bulkApply([done], { op: 'complete' }, NOW)
    expect(skipped).toEqual([])
    expect(applied[0]?.doneAt).toBe('2026-11-20T00:00:00.000Z') // idempotent, timestamp kept
  })

  it('setProject / setPriority / tag merge and remove run over the batch', () => {
    const { applied } = bulkApply([t1, t3], { op: 'setProject', projectId: 9 }, NOW)
    expect(applied.map((t) => t.projectId)).toEqual([9, 9])

    const priority = bulkApply([t1, t3], { op: 'setPriority', priority: 'low' }, NOW)
    expect(priority.applied.every((t) => t.priority === 'low')).toBe(true)

    const added = bulkApply([t3], { op: 'addTags', tagIds: [4, 4, 5] }, NOW)
    expect(added.applied[0]?.tagIds).toEqual([4, 5]) // deduped

    const removed = bulkApply([t1], { op: 'removeTags', tagIds: [7] }, NOW)
    expect(removed.applied[0]?.tagIds).toEqual([])
  })

  it('wontdo op refuses done tasks', () => {
    const { applied, skipped } = bulkApply(
      [base({ id: 6, isDone: true, doneAt: NOW }), t3],
      { op: 'wontdo' },
      NOW,
    )
    expect(applied.map((t) => t.id)).toEqual([3])
    expect(skipped).toEqual([{ id: 6, reason: 'done tasks cannot be marked won\u2019t do' }])
  })
})

describe('validateTask', () => {
  it('passes a well-formed task', () => {
    expect(validateTask(base())).toEqual({ ok: true, errors: [], warnings: [] })
  })

  it('requires a due value when dueWithTime is set, and an ISO timestamp for it', () => {
    const missing = validateTask(base({ due: null, dueWithTime: true }))
    expect(missing.ok).toBe(false)
    expect(missing.errors).toContain('dueWithTime is set but no due value was given.')

    const dateOnly = validateTask(base({ due: DAY, dueWithTime: true }))
    expect(dateOnly.errors).toContain(
      'A timed due must be a full ISO timestamp (e.g. 2026-11-22T14:00).',
    )
  })

  it('requires YYYY-MM-DD for date-only dues', () => {
    const bad = validateTask(base({ due: '22/11/2026' }))
    expect(bad.errors).toContain('A date-only due must be YYYY-MM-DD.')
  })

  it('blocks zero estimates, self-parenting and doneAt inconsistencies', () => {
    expect(validateTask(base({ estimateMs: 0 })).ok).toBe(false)
    expect(validateTask(base({ parentId: 1 })).errors).toContain('A task cannot be its own parent.')
    expect(validateTask(base({ isDone: false, doneAt: NOW })).errors).toContain(
      'doneAt is set but the task is not marked done.',
    )
  })

  it('warns (not blocks) on deadline before due and done+wontdo mixtures', () => {
    const deadline = validateTask(base({ deadline: '2026-11-21' }))
    expect(deadline.ok).toBe(true)
    expect(deadline.warnings).toContain('The deadline is earlier than the due date.')

    const mixed = validateTask(base({ isDone: true, doneAt: NOW, wonthado: true }))
    expect(mixed.ok).toBe(true)
    expect(mixed.warnings.length).toBe(1)
  })
})

describe('schema sanity', () => {
  it('priority enum covers the SP ladder', () => {
    expect(taskPrioritySchema.options).toEqual(['none', 'low', 'medium', 'high'])
  })

  it('model rejects negative time entries', () => {
    expect(() => taskItemSchema.parse({ ...base(), timeSpentOnDay: { [DAY]: -1 } })).toThrow()
  })
})

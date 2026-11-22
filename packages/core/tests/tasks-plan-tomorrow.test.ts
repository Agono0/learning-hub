/**
 * Tomorrow planning (S3-49): the due-only exclusivity rule — a task planned
 * for tomorrow never appears in Today; patches are idempotent; done and
 * won't-do tasks are never planned.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import { planForTomorrow, tomorrowsTasks, tomorrowKey, todayCount } from '../src/tasks/today'

const TODAY = '2026-11-22'
const TOMORROW = tomorrowKey(TODAY) // 2026-11-23

function task(over: Partial<TaskItem> = {}): TaskItem {
  return taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 'Ship it',
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
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    ...over,
  })
}

describe('tomorrowsTasks', () => {
  it('lists open tasks due exactly tomorrow — never Today members', () => {
    const tasks = [
      task({ id: 1, due: TODAY }),
      task({ id: 2, due: TOMORROW }),
      task({ id: 3, due: `${TOMORROW}T14:00:00.000Z`, dueWithTime: true }),
      task({ id: 4, due: TOMORROW, isDone: true }),
      task({ id: 5, due: TOMORROW, wonthado: true }),
    ]
    expect(tomorrowsTasks(tasks, TODAY).map((t) => t.id)).toEqual([2, 3])
    // the exclusivity invariant: no overlap with the Today list
    const todayIds = tasks.filter((t) => t.due === TODAY).map((t) => t.id)
    expect(todayIds).toEqual([1])
    expect(todayCount(tasks, TODAY)).toBe(1)
  })
})

describe('planForTomorrow', () => {
  it('emits due patches for the selected open tasks', () => {
    const tasks = [task({ id: 1, due: TODAY }), task({ id: 2, due: null })]
    expect(planForTomorrow(tasks, [1, 2], TODAY)).toEqual([
      { id: 1, due: TOMORROW },
      { id: 2, due: TOMORROW },
    ])
  })

  it('is idempotent: tasks already due tomorrow produce no patch', () => {
    const tasks = [task({ id: 1, due: TOMORROW })]
    expect(planForTomorrow(tasks, [1], TODAY)).toEqual([])
  })

  it('skips done and won-t-do tasks', () => {
    const tasks = [
      task({ id: 1, due: TODAY, isDone: true }),
      task({ id: 2, due: TODAY, wonthado: true }),
    ]
    expect(planForTomorrow(tasks, [1, 2], TODAY)).toEqual([])
  })

  it('ignores unknown ids', () => {
    expect(planForTomorrow([task({ id: 1 })], [99], TODAY)).toEqual([])
  })
})

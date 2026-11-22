/**
 * Unit tests for grouping helpers (S3-61): project buckets (inbox last),
 * multi-bucket tag grouping, due-day ordering (past→today→future, undated
 * last), and id rollups.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import { groupByDueDay, groupByProject, groupByTag, groupIds } from '../src/tasks/grouping'

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

describe('groupByProject', () => {
  it('buckets per project with inbox last, members in input order', () => {
    const list = [
      task({ id: 1, projectId: 2 }),
      task({ id: 2, projectId: null }),
      task({ id: 3, projectId: 2 }),
      task({ id: 4, projectId: 1 }),
    ]
    const groups = groupByProject(list, (id) => `P${id}`)
    expect(groups.map((g) => g.label)).toEqual(['P2', 'P1', null])
    expect(groups[0]?.members.map((t) => t.id)).toEqual([1, 3])
    expect(groups[2]?.members.map((t) => t.id)).toEqual([2])
  })
})

describe('groupByTag', () => {
  it('multi-tag tasks appear in every bucket; untagged bucket is last', () => {
    const list = [
      task({ id: 1, tagIds: [7] }),
      task({ id: 2, tagIds: [7, 8] }),
      task({ id: 3, tagIds: [] }),
      task({ id: 4, tagIds: [8] }),
    ]
    const groups = groupByTag(list, (id) => `T${id}`)
    expect(groups.map((g) => g.label)).toEqual(['T7', 'T8', null])
    expect(groups[0]?.members.map((t) => t.id)).toEqual([1, 2])
    expect(groups[1]?.members.map((t) => t.id)).toEqual([2, 4])
    expect(groups[2]?.members.map((t) => t.id)).toEqual([3])
  })
})

describe('groupByDueDay', () => {
  it('orders past (oldest first) → today → future → undated', () => {
    const list = [
      task({ id: 1, due: '2026-11-24' }),
      task({ id: 2, due: '2026-11-21' }),
      task({ id: 3, due: '2026-11-20' }),
      task({ id: 4, due: '2026-11-22T09:00:00.000Z', dueWithTime: true }),
      task({ id: 5, due: null }),
    ]
    const groups = groupByDueDay(list, TODAY)
    expect(groups.map((g) => g.key)).toEqual([
      '2026-11-20',
      '2026-11-21',
      TODAY,
      '2026-11-24',
      '__none__',
    ])
    expect(groups.find((g) => g.key === TODAY)?.label).toBe('Today')
    expect(groups.find((g) => g.key === TODAY)?.members.map((t) => t.id)).toEqual([4])
    expect(groups[groups.length - 1]?.label).toBeNull()
  })
})

describe('groupIds', () => {
  it('rolls groups up to ids', () => {
    const groups = [{ key: 'a', label: 'A', members: [task({ id: 1 }), task({ id: 2 })] }]
    expect(groupIds(groups)).toEqual([{ key: 'a', ids: [1, 2] }])
  })
})

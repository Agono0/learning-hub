/**
 * Unit tests for the priority model (S3-64): ranks, tag strategies (max
 * wins, never lowers), stable urgent-first sorting, and badge labels.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import {
  compareByEffectivePriority,
  effectivePriority,
  priorityBadge,
  priorityRank,
  type PriorityStrategy,
} from '../src/tasks/priority'

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
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    ...overrides,
  })
}

describe('priorityRank / effectivePriority', () => {
  it('ranks the ladder none < low < medium < high', () => {
    expect(priorityRank('none')).toBe(0)
    expect(priorityRank('low')).toBe(1)
    expect(priorityRank('medium')).toBe(2)
    expect(priorityRank('high')).toBe(3)
  })

  it('tag strategies lift (max wins, never lowers)', () => {
    const urgentTag: PriorityStrategy = { tagId: 9, boost: 'high' }
    const base = task({ priority: 'low', tagIds: [9] })
    expect(effectivePriority(base, [urgentTag])).toBe('high')
    // Without the tag the strategy is inert.
    expect(effectivePriority(task({ priority: 'low' }), [urgentTag])).toBe('low')
    // A higher base ignores a weaker boost.
    expect(effectivePriority(task({ priority: 'high', tagIds: [9] }), [urgentTag])).toBe('high')
    // No strategies = the stored value.
    expect(effectivePriority(base)).toBe('low')
  })

  it('the strongest matching strategy wins', () => {
    const strategies: PriorityStrategy[] = [
      { tagId: 1, boost: 'low' },
      { tagId: 2, boost: 'medium' },
      { tagId: 3, boost: 'high' },
    ]
    const carrying = task({ priority: 'none', tagIds: [1, 2, 3] })
    expect(effectivePriority(carrying, strategies)).toBe('high')
    expect(effectivePriority(task({ priority: 'none', tagIds: [1] }), strategies)).toBe('low')
  })
})

describe('compareByEffectivePriority', () => {
  it('sorts most-urgent first, honoring strategies, stable on ties', () => {
    const strategies: PriorityStrategy[] = [{ tagId: 9, boost: 'high' }]
    const a = task({ id: 1, priority: 'low' })
    const b = task({ id: 2, priority: 'high' })
    const c = task({ id: 3, priority: 'none' })
    const boosted = task({ id: 4, priority: 'none', tagIds: [9] })

    const sorted = [a, c, b, boosted].sort(compareByEffectivePriority(strategies))
    expect(sorted.map((t) => t.id)).toEqual([2, 4, 1, 3])

    // Tie between a and c? none/low differ; tie two 'none' tasks: stable order.
    const d = task({ id: 5, priority: 'none' })
    const e = task({ id: 6, priority: 'none' })
    const stable = [e, d].sort(compareByEffectivePriority())
    expect(stable.map((t) => t.id)).toEqual([5, 6])
  })

  it('does not mutate the input array', () => {
    const list = [task({ priority: 'low' }), task({ priority: 'high' })]
    const copy = [...list]
    list.sort(compareByEffectivePriority())
    expect(copy[0].priority).toBe('low')
  })
})

describe('priorityBadge', () => {
  it('maps the ladder to SP p1..p3 wording; none is badge-less', () => {
    expect(priorityBadge('high')).toBe('p1')
    expect(priorityBadge('medium')).toBe('p2')
    expect(priorityBadge('low')).toBe('p3')
    expect(priorityBadge('none')).toBe('')
  })
})

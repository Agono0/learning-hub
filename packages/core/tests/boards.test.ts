/**
 * Core tests for the boards engine (S3-24): rule chips, the Kanban and
 * Eisenhower built-ins, board building (first-match, one appearance per
 * task), and the drag-applies-rule patch (`applyChip` — immutable, zod-
 * validated, won't-do state never silently cleared).
 *
 * Tasks are built with the domain's own create-task op so the fixtures are
 * always model-valid (same discipline the handlers use).
 */
import { describe, expect, it } from 'vitest'
import {
  addDays,
  applyChip,
  buildBoard,
  eisenhowerQuadrant,
  eisenhowerBoardView,
  isUrgent,
  kanbanBoardView,
  matchesChip,
  URGENT_WINDOW_DAYS,
  type BoardRuleChip,
} from '../src/boards'
import { createTask, type CreateTaskInput, type TaskItem } from '../src/tasks'

const TODAY = '2026-11-22'

/** Model-valid fixture builder (defaults: open inbox task, no due). */
function task(
  overrides: Partial<CreateTaskInput> & {
    id?: number
    isDone?: boolean
    wonthado?: boolean
  } = {},
): TaskItem {
  const { id, isDone, wonthado, ...input } = overrides
  const base = createTask({ title: 'A task', ...input }, `${TODAY}T00:00:00Z`)
  return {
    ...base,
    id: id ?? 1,
    isDone: isDone ?? false,
    wonthado: wonthado ?? false,
    doneAt: isDone === true ? `${TODAY}T00:00:00Z` : null,
  }
}

describe('rule chips — matching', () => {
  it('filters by done state, priority list, project, tag, hasDue', () => {
    const chip: BoardRuleChip = {
      id: 'chip',
      label: 'Chip',
      filter: {
        isDone: false,
        wonthado: false,
        priority: ['high', 'medium'],
        projectId: 7,
        tagId: 3,
        hasDue: true,
      },
      apply: {},
    }
    const match = task({ priority: 'high', projectId: 7, tagIds: [3], due: TODAY })
    expect(matchesChip(match, chip, TODAY)).toBe(true)
    expect(
      matchesChip(task({ priority: 'low', projectId: 7, tagIds: [3], due: TODAY }), chip, TODAY),
    ).toBe(false)
    expect(
      matchesChip(task({ priority: 'high', projectId: 8, tagIds: [3], due: TODAY }), chip, TODAY),
    ).toBe(false)
    expect(
      matchesChip(task({ priority: 'high', projectId: 7, tagIds: [], due: TODAY }), chip, TODAY),
    ).toBe(false)
    expect(matchesChip(task({ priority: 'high', projectId: 7, tagIds: [3] }), chip, TODAY)).toBe(
      false,
    )
  })

  it('overdue + dueWithinDays are relative to the injected today', () => {
    const overdueChip = { id: 'c', label: 'C', filter: { overdue: true }, apply: {} }
    expect(matchesChip(task({ due: '2026-11-01' }), overdueChip, TODAY)).toBe(true)
    expect(matchesChip(task({ due: addDays(TODAY, 3) }), overdueChip, TODAY)).toBe(false)

    const soonChip = {
      id: 'c2',
      label: 'C2',
      filter: { dueWithinDays: URGENT_WINDOW_DAYS },
      apply: {},
    }
    expect(matchesChip(task({ due: addDays(TODAY, URGENT_WINDOW_DAYS) }), soonChip, TODAY)).toBe(
      true,
    )
    expect(
      matchesChip(task({ due: addDays(TODAY, URGENT_WINDOW_DAYS + 1) }), soonChip, TODAY),
    ).toBe(false)
    // Deadline counts as an urgency signal too.
    expect(matchesChip(task({ deadline: addDays(TODAY, 2) }), soonChip, TODAY)).toBe(true)
  })
})

describe('Kanban built-in', () => {
  it('has priority columns + Done; first match wins', () => {
    const view = kanbanBoardView()
    expect(view.columns.map((c) => c.label)).toEqual(['Backlog', 'Low', 'Medium', 'High', 'Done'])
    const board = buildBoard(
      view,
      [
        task({ id: 1, priority: 'none' }),
        task({ id: 2, priority: 'high' }),
        task({ id: 3, isDone: true }),
        task({ id: 4, wonthado: true, priority: 'medium' }),
      ],
      TODAY,
    )
    expect(board.columns[0].tasks.map((t) => t.id)).toEqual([1])
    expect(board.columns[3].tasks.map((t) => t.id)).toEqual([2])
    expect(board.columns[4].tasks.map((t) => t.id)).toEqual([3])
    // A won't-do medium task matches NO kanban column → honest unmatched bucket.
    expect(board.unmatched.map((t) => t.id)).toEqual([4])
  })

  it('dragging to a priority column re-prioritizes; to Done completes', () => {
    const view = kanbanBoardView()
    const t = task({ priority: 'none' })
    const moved = applyChip(t, view.columns[3].chip, TODAY)
    expect(moved.priority).toBe('high')
    expect(moved.isDone).toBe(false)
    expect(moved.due).toBe(t.due)

    const done = applyChip(t, view.columns[4].chip, TODAY)
    expect(done.isDone).toBe(true)
    expect(done.doneAt).not.toBeNull()
    // Round-trip: the dragged task still parses as the model.
    expect(done.title).toBe(t.title)
  })
})

describe('Eisenhower built-in', () => {
  it('quadrants follow the urgent×important axes', () => {
    expect(eisenhowerQuadrant(task({ priority: 'high', due: addDays(TODAY, 3) }), TODAY)).toBe('q1')
    expect(eisenhowerQuadrant(task({ priority: 'high' }), TODAY)).toBe('q2')
    expect(eisenhowerQuadrant(task({ priority: 'low', due: addDays(TODAY, 3) }), TODAY)).toBe('q3')
    expect(eisenhowerQuadrant(task({ priority: 'low' }), TODAY)).toBe('q4')
    expect(
      eisenhowerQuadrant(task({ isDone: true, priority: 'high', due: TODAY }), TODAY),
    ).toBeNull()
    expect(eisenhowerQuadrant(task({ wonthado: true }), TODAY)).toBeNull()
  })

  it('overdue tasks are urgent (q1/q3 regardless of future window)', () => {
    expect(isUrgent(task({ due: '2026-11-01' }), TODAY)).toBe(true)
    expect(eisenhowerQuadrant(task({ priority: 'high', due: '2026-11-01' }), TODAY)).toBe('q1')
  })

  it('board assigns every open task to exactly one quadrant', () => {
    const view = eisenhowerBoardView()
    const board = buildBoard(
      view,
      [
        task({ id: 1, priority: 'high', due: TODAY }),
        task({ id: 2, priority: 'medium' }),
        task({ id: 3, priority: 'low', deadline: addDays(TODAY, 1) }),
        task({ id: 4, priority: 'none' }),
      ],
      TODAY,
    )
    expect(board.columns.map((c) => c.tasks.map((t) => t.id))).toEqual([[1], [2], [3], [4]])
    expect(board.unmatched).toEqual([])
  })

  it('drops align both axes: Q1 sets high + due, Q2 clears due, Q4 downgrades', () => {
    const view = eisenhowerBoardView()
    const [q1, q2, q3, q4] = view.columns.map((c) => c.chip)

    const toQ1 = applyChip(task({ priority: 'low' }), q1, TODAY)
    expect(toQ1.priority).toBe('high')
    expect(toQ1.due).toBe(addDays(TODAY, URGENT_WINDOW_DAYS))

    const toQ2 = applyChip(task({ priority: 'low', due: TODAY }), q2, TODAY)
    expect(toQ2.priority).toBe('high')
    expect(toQ2.due).toBeNull()

    const toQ3 = applyChip(task({ priority: 'high' }), q3, TODAY)
    expect(toQ3.priority).toBe('low')
    expect(toQ3.due).toBe(addDays(TODAY, URGENT_WINDOW_DAYS))

    const toQ4 = applyChip(task({ priority: 'high', due: TODAY }), q4, TODAY)
    expect(toQ4.priority).toBe('low')
    expect(toQ4.due).toBeNull()
  })
})

describe('applyChip (the drag contract)', () => {
  it('is immutable — the source task is untouched', () => {
    const chip = {
      id: 'chip',
      label: 'Chip',
      filter: {},
      apply: { priority: 'high' as const },
    }
    const t = task({ priority: 'none' })
    const next = applyChip(t, chip, TODAY)
    expect(next.priority).toBe('high')
    expect(t.priority).toBe('none')
    expect(next.id).toBe(t.id)
    expect(next.updatedAt).toBe(t.updatedAt)
  })

  it('can clear a due, set a literal due, or add/remove a tag', () => {
    const clear = { id: 'c1', label: 'chip', filter: {}, apply: { clearDue: true as const } }
    expect(applyChip(task({ due: TODAY }), clear, TODAY).due).toBeNull()

    const literal = { id: 'c2', label: 'chip', filter: {}, apply: { due: '2026-12-01' } }
    expect(applyChip(task(), literal, TODAY).due).toBe('2026-12-01')

    const tagger = { id: 'c3', label: 'chip', filter: {}, apply: { addTagId: 9 } }
    expect(applyChip(task({ tagIds: [2] }), tagger, TODAY).tagIds).toEqual([2, 9])
    expect(applyChip(task({ tagIds: [2, 9] }), tagger, TODAY).tagIds).toEqual([2, 9]) // no dupes

    const untagger = { id: 'c4', label: 'chip', filter: {}, apply: { removeTagId: 2 } }
    expect(applyChip(task({ tagIds: [2, 9] }), untagger, TODAY).tagIds).toEqual([9])
  })

  it('re-opening never silently clears a won’t-do decision', () => {
    const reopen = { id: 'r', label: 'chip', filter: {}, apply: { isDone: false as const } }
    const t = task({ wonthado: true })
    const next = applyChip(t, reopen, TODAY)
    expect(next.isDone).toBe(false)
    expect(next.wonthado).toBe(true)
  })

  it('rejects impossible patches (clearDue + due) at the boundary', () => {
    const bad = {
      id: 'bad',
      label: 'chip',
      filter: {},
      apply: { clearDue: true as const, due: '2026-12-01' },
    }
    expect(() => applyChip(task(), bad, TODAY)).toThrow()
  })
})

describe('addDays', () => {
  it('rolls over month and year boundaries on UTC arithmetic', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays(TODAY, 0)).toBe(TODAY)
  })
})

/**
 * Unit tests for the undo core (S3-13): stack bounds/order, entry
 * validation, and the stale-guarded update reversal.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import {
  peekUndo,
  popUndo,
  pushUndo,
  reverseUpdateOp,
  UNDO_STACK_LIMIT,
  type UndoEntry,
  type UndoOp,
} from '../src/tasks/undo'

const NOW = '2026-11-22T10:00:00.000Z'

function entry(op: UndoOp, label = 'did a thing'): Omit<UndoEntry, 'at'> {
  return { op, label }
}

describe('stack management', () => {
  it('pushes newest-first and caps the depth', () => {
    let stack: UndoEntry[] = []
    for (let i = 0; i < UNDO_STACK_LIMIT + 5; i++) {
      stack = pushUndo(stack, entry({ op: 'complete', taskId: i + 1 }, `op ${i + 1}`), NOW)
    }
    expect(stack).toHaveLength(UNDO_STACK_LIMIT)
    expect(stack[0]?.label).toBe('op 25') // oldest pushed out
    expect(stack[stack.length - 1]?.label).toBe('op 6')
  })

  it('peek/pop are LIFO and pop on empty yields null', () => {
    let stack = pushUndo([], entry({ op: 'complete', taskId: 2 }, 'complete'), NOW)
    stack = pushUndo(stack, entry({ op: 'reopen', taskId: 2 }, 'reopen'), NOW)
    expect(peekUndo(stack)?.label).toBe('reopen')
    const popped = popUndo(stack)
    expect(popped.popped?.label).toBe('reopen')
    expect(popped.stack[0]?.label).toBe('complete')
    const empty = popUndo([])
    expect(empty.popped).toBeNull()
    expect(peekUndo([])).toBeNull()
  })

  it('validates ops (unknown op shapes rejected)', () => {
    expect(() => pushUndo([], entry({ op: 'complete' } as unknown as UndoOp), NOW)).not.toThrow()
    expect(() =>
      pushUndo(
        [],
        // @ts-expect-error — deliberately malformed op for the validator
        entry({ op: 'teleport', taskId: 1 }),
        NOW,
      ),
    ).toThrow()
  })
})

describe('reverseUpdateOp (stale-guarded patch reversal)', () => {
  const base: TaskItem = taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 'before title',
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
  })

  const undo: UndoOp = {
    op: 'update',
    taskId: 1,
    prev: { title: 'before title', priority: 'none' },
    next: { title: 'after title', priority: 'high' },
  }

  it('reverses cleanly when the row still matches the op\u2019s after-state', () => {
    const current = taskItemSchema.parse({ ...base, title: 'after title', priority: 'high' })
    expect(reverseUpdateOp(undo, current)).toEqual({ title: 'before title', priority: 'none' })
  })

  it('skips (null) when a field moved on after the undone op', () => {
    const drifted = taskItemSchema.parse({
      ...base,
      title: 'someone else edited',
      priority: 'high',
    })
    expect(reverseUpdateOp(undo, drifted)).toBeNull()
  })

  it('skips (null) when the model dropped the field', () => {
    const shrinked: TaskItem = { ...base }
    const weirdUndo: UndoOp = { op: 'update', taskId: 1, prev: { ghost: 1 }, next: { ghost: 2 } }
    expect(reverseUpdateOp(weirdUndo, shrinked)).toBeNull()
  })
})

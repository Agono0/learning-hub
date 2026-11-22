/**
 * Unit tests for the ordering math (S3-60): dense renumbering, drag moves,
 * keyboard nudges, insert/remove and the partial order patch.
 */
import { describe, expect, it } from 'vitest'
import {
  applyOrder,
  densify,
  insertAt,
  moveTo,
  nudge,
  orderPatchFor,
  removeId,
} from '../src/tasks/order'

describe('densify / applyOrder', () => {
  it('densifies any list to 0..n-1', () => {
    expect(densify([9, 4, 7])).toEqual([0, 1, 2])
    expect(densify([])).toEqual([])
  })

  it('sorts by ordinal with missing ids at the end (stable)', () => {
    expect(applyOrder([3, 1, 2], [1, 2])).toEqual([1, 2, 3])
    expect(applyOrder([1, 2, 3], [3, 2, 1])).toEqual([3, 2, 1])
  })
})

describe('moveTo (drag)', () => {
  const ids = [1, 2, 3, 4]

  it('moves an id to the target position', () => {
    expect(densify(moveTo(ids, 3, 0))).toEqual(densify([3, 1, 2, 4]))
    expect(moveTo(ids, 3, 0)).toEqual([3, 1, 2, 4])
  })

  it('clamps out-of-range targets', () => {
    expect(moveTo(ids, 2, 99)).toEqual([1, 3, 4, 2])
    expect(moveTo(ids, 2, -5)).toEqual([2, 1, 3, 4])
  })

  it('dropping onto the same slot is a no-op order', () => {
    expect(moveTo(ids, 2, 1)).toEqual(ids)
  })
})

describe('nudge (keyboard)', () => {
  it('moves one slot up/down with clamping; unknown ids pass through', () => {
    expect(nudge([1, 2, 3], 2, -1)).toEqual([2, 1, 3])
    expect(nudge([1, 2, 3], 2, 1)).toEqual([1, 3, 2])
    expect(nudge([1, 2, 3], 1, -1)).toEqual([1, 2, 3])
    expect(nudge([1, 2, 3], 3, 1)).toEqual([1, 2, 3])
    expect(nudge([1, 2, 3], 99, 1)).toEqual([1, 2, 3])
  })
})

describe('insertAt / removeId', () => {
  it('inserts at a clamped position (default: end)', () => {
    expect(insertAt([1, 3], 2, 1)).toEqual([1, 2, 3])
    expect(insertAt([1, 3], 2)).toEqual([1, 3, 2])
    expect(insertAt([1, 3], 2, 50)).toEqual([1, 3, 2])
    expect(insertAt([], 1)).toEqual([1])
  })

  it('removes and re-densifies; absent ids are a no-op', () => {
    expect(removeId([1, 2, 3], 2)).toEqual([1, 3])
    expect(removeId([1, 2, 3], 9)).toEqual([1, 2, 3])
  })
})

describe('orderPatchFor (partial updates for filtered views)', () => {
  it('maps the order onto the visible tasks only', () => {
    const tasks = [
      { id: 1, order: 9 },
      { id: 2, order: 9 },
      { id: 3, order: 9 }, // not in the order array — keeps its value
    ]
    expect(orderPatchFor(tasks, [2, 1])).toEqual([
      { id: 2, order: 0 },
      { id: 1, order: 1 },
    ])
  })

  it('deduplicates ids defensively', () => {
    const tasks = [{ id: 1, order: 0 }]
    expect(orderPatchFor(tasks, [1, 1])).toEqual([{ id: 1, order: 0 }])
  })
})

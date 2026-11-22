/**
 * Unit tests for the trash module (S3-12): TTL math, expiry/purge, list
 * ordering, and restore passthrough.
 */
import { describe, expect, it } from 'vitest'
import {
  createTrashEntry,
  daysUntilExpiry,
  isExpired,
  purgeExpired,
  restoreFromTrash,
  trashList,
  TRASH_TTL_DAYS,
  type TrashEntry,
} from '../src/tasks/trash'

const NOW = '2026-11-22T10:00:00.000Z'
const DAY_MS = 86_400_000

function entry(daysAgo: number, overrides: Partial<TrashEntry> = {}): TrashEntry {
  return createTrashEntry(
    {
      taskId: 1,
      snapshot: { id: 1, title: 'deleted task', isDone: false },
      title: 'deleted task',
      deletedVia: 'task-row',
      ...overrides,
    },
    new Date(Date.parse(NOW) - daysAgo * DAY_MS).toISOString(),
  )
}

describe('TTL math', () => {
  it('expires after 30 days, counting up to the boundary', () => {
    expect(TRASH_TTL_DAYS).toBe(30)
    expect(daysUntilExpiry(entry(0), NOW)).toBe(30)
    expect(daysUntilExpiry(entry(29), NOW)).toBe(1)
    expect(daysUntilExpiry(entry(30), NOW)).toBe(0)
    expect(isExpired(entry(30), NOW)).toBe(true)
    expect(isExpired(entry(29), NOW)).toBe(false)
  })

  it('garbage timestamps count as expired (never render rot)', () => {
    expect(isExpired({ ...entry(0), deletedAt: 'bogus' }, NOW)).toBe(true)
  })
})

describe('createTrashEntry', () => {
  it('stamps deletedAt and keeps the snapshot verbatim', () => {
    const e = entry(0)
    expect(e.deletedAt).toBe(NOW)
    expect(e.snapshot).toEqual({ id: 1, title: 'deleted task', isDone: false })
    expect(e.title).toBe('deleted task')
  })
})

describe('trashList / purgeExpired / restore', () => {
  it('lists newest first and hides expired entries', () => {
    const entries = [entry(10), entry(2), entry(40)]
    expect(trashList(entries, NOW).map((e) => e.deletedAt)).toEqual([
      entry(2).deletedAt,
      entry(10).deletedAt,
    ])
  })

  it('purge returns expired task ids', () => {
    const entries = [entry(2), entry(40), entry(31)]
    expect(purgeExpired(entries, NOW)).toEqual([entry(40).taskId, entry(31).taskId])
  })

  it('restore hands back the snapshot for re-parse', () => {
    expect(restoreFromTrash(entry(0))).toEqual({ id: 1, title: 'deleted task', isDone: false })
  })
})

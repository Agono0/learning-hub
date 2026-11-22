/**
 * Unit tests for the archive core (S3-11): tier desires by age, the
 * orchestrator pass (archive/promote/restore, idempotence), and restore.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import {
  DEFAULT_ARCHIVE_CONFIG,
  desiredTier,
  planArchivePass,
  restoreFromArchive,
  type ArchiveEntry,
} from '../src/tasks/archive'

const NOW = '2026-11-22T10:00:00.000Z'
const DAY_MS = 86_400_000

function doneTask(daysAgo: number, overrides: Partial<TaskItem> = {}): TaskItem {
  const doneAt = new Date(Date.parse(NOW) - daysAgo * DAY_MS).toISOString()
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
    isDone: true,
    doneAt,
    wonthado: false,
    repeatCfgId: null,
    order: 0,
    createdAt: doneAt,
    updatedAt: doneAt,
    ...overrides,
  })
}

describe('desiredTier (age-based, configurable)', () => {
  it('young after 14 done-days, old after 14+60', () => {
    expect(desiredTier(doneTask(13), DEFAULT_ARCHIVE_CONFIG, NOW)).toBeNull()
    expect(desiredTier(doneTask(14), DEFAULT_ARCHIVE_CONFIG, NOW)).toBe('young')
    expect(desiredTier(doneTask(73), DEFAULT_ARCHIVE_CONFIG, NOW)).toBe('young')
    expect(desiredTier(doneTask(74), DEFAULT_ARCHIVE_CONFIG, NOW)).toBe('old')
  })

  it('open tasks and disabled configs never archive', () => {
    expect(
      desiredTier(doneTask(100, { isDone: false, doneAt: null }), DEFAULT_ARCHIVE_CONFIG, NOW),
    ).toBeNull()
    expect(
      desiredTier(doneTask(100), { ...DEFAULT_ARCHIVE_CONFIG, enabled: false }, NOW),
    ).toBeNull()
  })

  it('handles a missing doneAt defensively (never archives)', () => {
    expect(desiredTier({ isDone: true, doneAt: null }, DEFAULT_ARCHIVE_CONFIG, NOW)).toBeNull()
  })
})

describe('planArchivePass (the orchestrator as data)', () => {
  const youngTask = doneTask(15) // wants young
  const oldTask = doneTask(80, { id: 2 }) // wants old
  const freshTask = doneTask(2, { id: 3 }) // too fresh
  const reopened = doneTask(30, { id: 4, isDone: false, doneAt: null }) // stale row → restore

  it('archives new rows, promotes young→old, restores stale rows', () => {
    const existing: ArchiveEntry[] = [
      { taskId: 2, tier: 'young', archivedAt: '2026-10-01T00:00:00.000Z' },
      { taskId: 4, tier: 'young', archivedAt: '2026-10-05T00:00:00.000Z' },
    ]
    const plan = planArchivePass(
      [youngTask, oldTask, freshTask, reopened],
      existing,
      DEFAULT_ARCHIVE_CONFIG,
      NOW,
    )
    expect(plan.toArchive.map((a) => a.task.id)).toEqual([1])
    expect(plan.toArchive[0]?.tier).toBe('young')
    expect(plan.toPromote.map((r) => r.taskId)).toEqual([2])
    expect(plan.toRestore.map((r) => r.taskId)).toEqual([4])
  })

  it('is idempotent: nothing to do when every row already matches', () => {
    const existing: ArchiveEntry[] = [
      { taskId: 1, tier: 'young', archivedAt: NOW },
      { taskId: 2, tier: 'old', archivedAt: NOW },
    ]
    const plan = planArchivePass([youngTask, oldTask], existing, DEFAULT_ARCHIVE_CONFIG, NOW)
    expect(plan).toEqual({ toArchive: [], toPromote: [], toRestore: [] })
  })

  it('restores everything when auto-archive is switched off', () => {
    const existing: ArchiveEntry[] = [
      { taskId: 1, tier: 'young', archivedAt: NOW },
      { taskId: 2, tier: 'old', archivedAt: NOW },
    ]
    const plan = planArchivePass(
      [youngTask, oldTask],
      existing,
      { ...DEFAULT_ARCHIVE_CONFIG, enabled: false },
      NOW,
    )
    expect(plan.toRestore.map((r) => r.taskId)).toEqual([1, 2])
    expect(plan.toArchive).toEqual([])
    expect(plan.toPromote).toEqual([])
  })
})

describe('restoreFromArchive', () => {
  it('reopens the task and points at the row to delete', () => {
    const t = doneTask(15)
    const out = restoreFromArchive(t, NOW)
    expect(out.task.isDone).toBe(false)
    expect(out.task.doneAt).toBeNull()
    expect(out.task.updatedAt).toBe(NOW)
    expect(out.removeEntryFor).toBe(t.id)
  })
})

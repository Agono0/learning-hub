/**
 * Tests for the SP tasks repository (S3-15): the persistence layer over the
 * 031/032 task_* tables. Covers tasks CRUD + subtask integrity + tag links,
 * projects (archive/duplicate), repeat configs, per-task reminders (including
 * the relative-offset encoding), the time-log merge rule, sections,
 * attachments, archive tiers (young/old pass), saved views, simple counters
 * and metric days.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ARCHIVE_CONFIG } from '@learning-hub/core'
import {
  archiveTaskItem,
  archiveTaskProjectRow,
  buildTrashEntry,
  bulkApplyTaskItems,
  completeTaskItem,
  createCounterRow,
  createRepeatCfgRow,
  createSection,
  createTaskAttachment,
  createTaskItem,
  createTaskProjectRow,
  createTaskReminderRow,
  createTaskTag,
  createTaskViewRow,
  deleteCounterRow,
  deleteRepeatCfgRow,
  deleteSection,
  deleteTaskAttachment,
  deleteTaskItem,
  deleteTaskReminderRow,
  deleteTaskTag,
  deleteTaskViewRow,
  deleteTimeLog,
  duplicateTaskItem,
  duplicateTaskProjectRow,
  getArchiveTier,
  getMetricDay,
  getRepeatCfg,
  getTaskItem,
  getTaskProject,
  getTaskViewRow,
  initDb,
  incrementCounter,
  insertTimeLog,
  listArchiveTiers,
  listCounterLogs,
  listCounters,
  listMetricDays,
  listSections,
  listTaskSectionAssignments,
  listTaskAttachments,
  listTaskItems,
  listTaskProjects,
  listTaskReminders,
  listTaskTags,
  listTaskViews,
  listTimeLogs,
  metricDays,
  moveTaskItem,
  reopenTaskItem,
  restoreTaskItem,
  restoreTaskProjectRow,
  runArchivePass,
  setDb,
  setTaskItemSection,
  setTaskItemTags,
  setTaskOrder,
  simpleCounterLogs,
  simpleCounters,
  sumTimeLogs,
  taskArchiveTiers,
  taskAttachments,
  taskItemTags,
  taskItems,
  taskProjects,
  taskReminders,
  taskRepeatCfgs,
  taskSections,
  taskTags,
  taskTimeLogs,
  taskViews,
  trackTaskTime,
  updateCounterRow,
  updateRepeatCfgRow,
  updateSection,
  updateTaskItem,
  updateTaskProjectRow,
  updateTaskReminderRow,
  updateTaskTag,
  updateTaskViewRow,
  upsertMetricDay,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-sp-tasks-'))
  db = await initDb({ path: join(tmp, 'sp-tasks.db') })
  setDb(db)
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

/** Wipe every SP table between tests (order does not matter — FKs are off). */
beforeEach(() => {
  for (const table of [
    taskItemTags,
    taskItems,
    taskProjects,
    taskTags,
    taskRepeatCfgs,
    taskReminders,
    taskTimeLogs,
    taskSections,
    taskAttachments,
    taskArchiveTiers,
    simpleCounters,
    simpleCounterLogs,
    metricDays,
    taskViews,
  ]) {
    db.delete(table).run()
  }
})

// ── Tasks CRUD ──────────────────────────────────────────────────────────────

describe('task items CRUD', () => {
  it('creates a task with defaults, appending it to the list scope', () => {
    const a = createTaskItem({ title: 'First' })
    const b = createTaskItem({ title: 'Second' })
    expect(a.id).toBeGreaterThan(0)
    expect(a.priority).toBe('none')
    expect(a.tagIds).toEqual([])
    expect(a.isDone).toBe(false)
    expect(b.order).toBe(a.order + 1)
    expect(getTaskItem(a.id)!.title).toBe('First')
  })

  it('rejects unknown parents, projects, tags and repeat configs', () => {
    expect(() => createTaskItem({ title: 'x', parentId: 999 })).toThrow(/task #999/)
    expect(() => createTaskItem({ title: 'x', projectId: 999 })).toThrow(/project #999/)
    expect(() => createTaskItem({ title: 'x', tagIds: [7] })).toThrow(/Unknown tag ids: 7/)
  })

  it('enforces subtask integrity: one nesting level, parentable parents only', async () => {
    const { canHaveSubtasks } = await import('@learning-hub/core')
    const parent = createTaskItem({ title: 'Parent' })
    const sub = createTaskItem({ title: 'Sub', parentId: parent.id })
    expect(sub.parentId).toBe(parent.id)

    // A subtask cannot nest further.
    expect(() => createTaskItem({ title: 'Deep', parentId: sub.id })).toThrow(
      /cannot receive subtasks/,
    )
    expect(canHaveSubtasks(sub)).toBe(false)

    // A parent with children cannot become a subtask itself.
    expect(() => updateTaskItem(parent.id, { parentId: sub.id })).toThrow(/cannot become a subtask/)
    expect(() => updateTaskItem(sub.id, { parentId: sub.id })).toThrow(/own parent/)
  })

  it('patches fields and replaces tag links', () => {
    const tag = createTaskTag({ name: 'work' })
    const other = createTaskTag({ name: 'home' })
    const task = createTaskItem({ title: 'Draft', tagIds: [tag.id] })

    const updated = updateTaskItem(task.id, {
      title: 'Drafted spec',
      priority: 'high',
      estimateMs: 3_600_000,
      tagIds: [other.id],
    })!
    expect(updated.title).toBe('Drafted spec')
    expect(updated.priority).toBe('high')
    expect(updated.estimateMs).toBe(3_600_000)
    expect(updated.tagIds).toEqual([other.id])
    expect(updated.updatedAt >= task.updatedAt).toBe(true)

    // Unknown tag ids in a patch are rejected before any write.
    expect(() => updateTaskItem(task.id, { tagIds: [42] })).toThrow(/Unknown tag ids: 42/)
    expect(getTaskItem(task.id)!.tagIds).toEqual([other.id])
  })

  it('completes a task and sweeps its open subtasks', () => {
    const parent = createTaskItem({ title: 'Parent' })
    createTaskItem({ title: 'Sub', parentId: parent.id })
    const done = completeTaskItem(parent.id)!
    expect(done.isDone).toBe(true)
    expect(done.doneAt).not.toBeNull()
    expect(listTaskItems({ parentId: parent.id, includeDone: true })[0]!.isDone).toBe(true)
  })

  it('refuses to complete a won\u2019t-do task and reopens instead', () => {
    const task = createTaskItem({ title: 'Cancel me' })
    const flipped = bulkApplyTaskItems([task.id], { op: 'wontdo' })
    expect(flipped.applied[0]!.wonthado).toBe(true)
    expect(() => completeTaskItem(task.id)).toThrow(/won.t do/)
    const reopened = reopenTaskItem(task.id)!
    expect(reopened.wonthado).toBe(false)
    expect(reopened.isDone).toBe(false)
  })

  it('reopening removes any archive tier row', () => {
    const task = createTaskItem({ title: 'Archived then reopened' })
    completeTaskItem(task.id)
    archiveTaskItem(task.id, 'young', '2026-02-01T00:00:00.000Z')
    expect(getArchiveTier(task.id)).not.toBeNull()
    reopenTaskItem(task.id)
    expect(getArchiveTier(task.id)).toBeNull()
  })

  it('duplicates with (copy) suffix, subtasks and tag links, no time map', () => {
    const tag = createTaskTag({ name: 'dup' })
    const parent = createTaskItem({ title: 'Original', tagIds: [tag.id], estimateMs: 60_000 })
    const sub = createTaskItem({ title: 'Sub', parentId: parent.id })
    trackTaskTime(parent.id, 30_000)

    const copy = duplicateTaskItem(parent.id)!
    expect(copy.title).toBe('Original (copy)')
    expect(copy.id).not.toBe(parent.id)
    expect(copy.tagIds).toEqual([tag.id])
    expect(copy.estimateMs).toBe(60_000)
    expect(copy.timeSpentOnDay).toEqual({})
    const copySubs = listTaskItems({ parentId: copy.id })
    expect(copySubs.map((s) => s.title)).toEqual(['Sub (copy)'])
    expect(copySubs[0]!.parentId).toBe(copy.id)
    expect(sub.parentId).toBe(parent.id)
  })

  it('deletes a task with its subtasks and dependent rows', () => {
    const tag = createTaskTag({ name: 'del' })
    const task = createTaskItem({ title: 'Doomed', tagIds: [tag.id] })
    const sub = createTaskItem({ title: 'Sub', parentId: task.id })
    createTaskReminderRow({
      taskId: task.id,
      type: 'at_time',
      remindAt: '2026-02-01T10:00:00.000Z',
    })
    createTaskAttachment({ taskId: task.id, type: 'url', value: 'https://example.com' })
    trackTaskTime(task.id, 60_000)

    expect(deleteTaskItem(task.id)).toBe(true)
    expect(deleteTaskItem(task.id)).toBe(false)
    expect(getTaskItem(task.id)).toBeNull()
    expect(getTaskItem(sub.id)).toBeNull()
    expect(listTaskReminders({ taskId: task.id })).toEqual([])
    expect(listTaskAttachments(task.id)).toEqual([])
    expect(listTimeLogs({ taskId: task.id })).toEqual([])
    expect(listTaskTags().map((t) => t.name)).toEqual(['del'])
    expect(db.select().from(taskItemTags).all()).toEqual([])
  })

  it('snapshots a task for trash/undo', () => {
    const task = createTaskItem({ title: 'Snapshot me' })
    const snap = buildTrashEntry(task.id, 'task-row')!
    expect(snap.title).toBe('Snapshot me')
    expect(snap.deletedVia).toBe('task-row')
    expect(snap.snapshot.id).toBe(task.id)
    expect(buildTrashEntry(4242, 'bulk')).toBeNull()
  })
})

// ── Bulk + ordering ─────────────────────────────────────────────────────────

describe('bulk + ordering', () => {
  it('applies bulk ops and reports skipped/not-found rows', () => {
    const p1 = createTaskProjectRow({ title: 'P1' })
    const p2 = createTaskProjectRow({ title: 'P2' })
    const tag = createTaskTag({ name: 'bulk' })
    const a = createTaskItem({ title: 'A', projectId: p1.id })
    const b = createTaskItem({ title: 'B', projectId: p1.id })
    const wontdo = createTaskItem({ title: 'C' })
    bulkApplyTaskItems([wontdo.id], { op: 'wontdo' })

    const moved = bulkApplyTaskItems([a.id, b.id, 987], { op: 'setProject', projectId: p2.id })
    expect(moved.applied.map((t) => t.projectId)).toEqual([p2.id, p2.id])
    expect(moved.skipped).toEqual([{ id: 987, reason: 'not found' }])

    // Completing a won't-do task is skipped with the domain reason.
    const completed = bulkApplyTaskItems([wontdo.id], { op: 'complete' })
    expect(completed.applied).toEqual([])
    expect(completed.skipped[0]!.id).toBe(wontdo.id)
    expect(completed.skipped[0]!.reason).toMatch(/won.t do/)

    const tagged = bulkApplyTaskItems([a.id], { op: 'addTags', tagIds: [tag.id] })
    expect(tagged.applied[0]!.tagIds).toEqual([tag.id])
    expect(getTaskItem(a.id)!.tagIds).toEqual([tag.id])
    expect(() => bulkApplyTaskItems([a.id], { op: 'addTags', tagIds: [404] })).toThrow(
      /Unknown tag ids: 404/,
    )
  })

  it('densely renumbers a dragged list', () => {
    const a = createTaskItem({ title: 'A' })
    const b = createTaskItem({ title: 'B' })
    const c = createTaskItem({ title: 'C' })
    const next = moveTaskItem(c.id, 0, [a.id, b.id, c.id])
    expect(next).toEqual([c.id, a.id, b.id])
    const orders = [c.id, a.id, b.id].map((id) => getTaskItem(id)!.order)
    expect(orders).toEqual([0, 1, 2])
    setTaskOrder([b.id, c.id, a.id])
    expect([a.id, b.id, c.id].map((id) => getTaskItem(id)!.order)).toEqual([2, 0, 1])
  })
})

// ── Tags / projects / repeat configs ────────────────────────────────────────

describe('tags', () => {
  it('normalizes names, blocks duplicates, updates and unlinks on delete', () => {
    const tag = createTaskTag({ name: '  spaced   out  ' })
    expect(tag.name).toBe('spaced out')
    expect(() => createTaskTag({ name: 'spaced out' })).toThrow(/already exists/)
    const renamed = updateTaskTag(tag.id, { color: 'red' })!
    expect(renamed.color).toBe('red')
    const task = createTaskItem({ title: 'Tagged', tagIds: [tag.id] })
    expect(deleteTaskTag(tag.id)).toBe(true)
    expect(getTaskItem(task.id)!.tagIds).toEqual([])
    expect(deleteTaskTag(tag.id)).toBe(false)
  })

  it('replaces a task tag set wholesale', () => {
    const t1 = createTaskTag({ name: 'one' })
    const t2 = createTaskTag({ name: 'two' })
    const task = createTaskItem({ title: 'T', tagIds: [t1.id] })
    setTaskItemTags(task.id, [t1.id, t2.id])
    expect(getTaskItem(task.id)!.tagIds.sort()).toEqual([t1.id, t2.id].sort())
    expect(() => setTaskItemTags(task.id, [404])).toThrow(/Unknown tag ids: 404/)
  })
})

describe('projects', () => {
  it('creates, patches, archives and restores', () => {
    const p = createTaskProjectRow({ title: 'Thesis', color: 'blue' })
    expect(getTaskProject(p.id)!.backlogFlag).toBe(false)
    updateTaskProjectRow(p.id, { title: 'Thesis v2', backlogFlag: true })
    expect(getTaskProject(p.id)).toMatchObject({ title: 'Thesis v2', backlogFlag: true })
    const archived = archiveTaskProjectRow(p.id, '2026-01-05T00:00:00.000Z')!
    expect(archived.archivedAt).toBe('2026-01-05T00:00:00.000Z')
    archiveTaskProjectRow(p.id) // idempotent
    expect(getTaskProject(p.id)!.archivedAt).toBe('2026-01-05T00:00:00.000Z')
    expect(restoreTaskProjectRow(p.id)!.archivedAt).toBeNull()
    expect(() => createTaskProjectRow({ title: '   ' })).toThrow(/needs a title/)
    expect(listTaskProjects().length).toBe(1)
  })

  it('duplicates open tasks (not done ones) with subtasks', () => {
    const p = createTaskProjectRow({ title: 'Source' })
    const open = createTaskItem({ title: 'Open', projectId: p.id })
    createTaskItem({ title: 'Child', parentId: open.id, projectId: p.id })
    const closed = createTaskItem({ title: 'Closed', projectId: p.id })
    completeTaskItem(closed.id)
    const copy = duplicateTaskProjectRow(p.id)!
    expect(copy.title).toBe('Source (copy)')
    const copyTasks = listTaskItems({ projectId: copy.id, parentId: 'any', includeDone: true })
    expect(copyTasks.map((t) => t.title)).toEqual(['Open (copy)', 'Child (copy)'])
  })
})

describe('repeat configs', () => {
  it('persists a config and keeps the optional UI title (034)', () => {
    const cfg = createRepeatCfgRow({
      title: 'Every 3 days',
      cycle: 'd',
      interval: 3,
      startDate: '2026-01-01',
      endDate: null,
      skipDates: ['2026-01-04'],
      reAnchor: 'scheduled',
    })
    expect(getRepeatCfg(cfg.id)).toMatchObject({
      title: 'Every 3 days',
      cycle: 'd',
      interval: 3,
      skipDates: ['2026-01-04'],
    })
    const unnamed = createRepeatCfgRow({
      cycle: 'd',
      interval: 1,
      startDate: '2026-01-01',
      endDate: null,
      skipDates: [],
      reAnchor: 'completion',
    })
    expect(unnamed.title).toBeNull()
    const updated = updateRepeatCfgRow(cfg.id, { interval: 5, title: 'Every 5 days' })!
    expect(updated.interval).toBe(5)
    expect(updated.title).toBe('Every 5 days')
    expect(() =>
      createRepeatCfgRow({
        cycle: 'x' as never,
        interval: 1,
        startDate: '2026-01-01',
        endDate: null,
        skipDates: [],
        reAnchor: 'completion',
      }),
    ).toThrow()
  })

  it('deleting a config turns its tasks one-off', () => {
    const cfg = createRepeatCfgRow({
      cycle: 'w',
      interval: 1,
      startDate: '2026-01-01',
      endDate: null,
      skipDates: [],
      reAnchor: 'completion',
    })
    const task = createTaskItem({ title: 'Weekly', repeatCfgId: cfg.id })
    expect(deleteRepeatCfgRow(cfg.id)).toBe(true)
    expect(getTaskItem(task.id)!.repeatCfgId).toBeNull()
    expect(getRepeatCfg(cfg.id)).toBeNull()
  })
})

// ── Reminders ───────────────────────────────────────────────────────────────

describe('task reminders', () => {
  it('round-trips at_time reminders', () => {
    const task = createTaskItem({ title: 'Remind me' })
    const reminder = createTaskReminderRow({
      taskId: task.id,
      type: 'at_time',
      remindAt: '2026-02-01T10:00:00.000Z',
    })
    expect(reminder.remindAt).toBe('2026-02-01T10:00:00.000Z')
    expect(reminder.offsetMs).toBeNull()
    expect(listTaskReminders({ taskId: task.id })).toHaveLength(1)
    expect(() => createTaskReminderRow({ taskId: 987, type: 'at_time', remindAt: 'x' })).toThrow(
      /task #987/,
    )
  })

  it('stores relative offsets in the real offset_ms column (034) with legacy fallback', () => {
    const task = createTaskItem({ title: 'Relative' })
    const reminder = createTaskReminderRow({
      taskId: task.id,
      type: 'relative',
      offsetMs: -1_800_000,
    })
    expect(reminder.remindAt).toBeNull()
    expect(reminder.offsetMs).toBe(-1_800_000)
    // The column is the storage; remind_at is the NOT NULL placeholder.
    const rawRow = db.select().from(taskReminders).where(eq(taskReminders.id, reminder.id)).get()!
    expect(rawRow.offsetMs).toBe(-1_800_000)
    expect(rawRow.remindAt).toBe('')

    // Legacy fallback: a pre-034 row (offset encoded as a string in
    // remind_at, offset_ms NULL) still decodes.
    db.insert(taskReminders)
      .values({ taskId: task.id, remindAt: String(-600_000), type: 'relative' })
      .run()
    const legacy = listTaskReminders({ taskId: task.id }).find((r) => r.id !== reminder.id)
    expect(legacy?.offsetMs).toBe(-600_000)

    const shifted = updateTaskReminderRow(reminder.id, { offsetMs: -900_000 })!
    expect(shifted.offsetMs).toBe(-900_000)
    expect(updateTaskReminderRow(reminder.id, { exactAlarm: true })!.exactAlarm).toBe(true)
    expect(deleteTaskReminderRow(reminder.id)).toBe(true)
    expect(deleteTaskReminderRow(legacy!.id)).toBe(true)
    expect(listTaskReminders({ taskId: task.id })).toEqual([])
  })
})

// ── Time tracking ───────────────────────────────────────────────────────────

describe('time logs', () => {
  it('appends sessions and re-derives the per-day map', () => {
    const task = createTaskItem({ title: 'Tracked' })
    insertTimeLog({ taskId: task.id, day: '2026-02-01', sessionMs: 60_000 })
    insertTimeLog({ taskId: task.id, day: '2026-02-01', sessionMs: 30_000 })
    insertTimeLog({ taskId: task.id, day: '2026-02-02', sessionMs: 90_000 })
    const fresh = getTaskItem(task.id)!
    expect(fresh.timeSpentOnDay).toEqual({ '2026-02-01': 90_000, '2026-02-02': 90_000 })
    expect(sumTimeLogs({ taskId: task.id })).toBe(180_000)
    expect(sumTimeLogs({ from: '2026-02-02' })).toBe(90_000)
  })

  it('drops junk sessions and derives the day from startedAt', () => {
    const task = createTaskItem({ title: 'Ticks' })
    expect(trackTaskTime(task.id, 500)).toBeNull() // below 1s quantization
    expect(trackTaskTime(task.id, 9 * 3_600_000 + 1)).toBeNull() // over 8h cap
    const tick = trackTaskTime(task.id, 5_000, { startedAt: '2026-03-09T22:00:00.000Z' })
    expect(tick!.day).toBe('2026-03-09')
    expect(getTaskItem(task.id)!.timeSpentOnDay['2026-03-09']).toBe(5_000)
  })

  it('corrections delete a row and recompute the map', () => {
    const task = createTaskItem({ title: 'Corrected' })
    const log = trackTaskTime(task.id, 60_000)!
    trackTaskTime(task.id, 30_000)
    expect(deleteTimeLog(log.id)).toBe(true)
    expect(deleteTimeLog(log.id)).toBe(false)
    expect(getTaskItem(task.id)!.timeSpentOnDay).toEqual({ [log.day]: 30_000 })
  })
})

// ── Sections / attachments ──────────────────────────────────────────────────

describe('sections and attachments', () => {
  it('manages sections in sort order', () => {
    const a = createSection('Morning')
    const b = createSection('Evening')
    expect(listSections().map((s) => s.name)).toEqual(['Morning', 'Evening'])
    updateSection(b.id, { sortOrder: -1 })
    expect(listSections().map((s) => s.name)).toEqual(['Evening', 'Morning'])
    expect(updateSection(a.id, { name: 'Start' })!.name).toBe('Start')
    expect(() => createSection('   ')).toThrow(/needs a name/)
    expect(deleteSection(a.id)).toBe(true)
    expect(deleteSection(a.id)).toBe(false)
  })

  it('assigns tasks to sections (034) and unassigns on section delete', () => {
    const section = createSection('Morning')
    const other = createSection('Evening')
    const task = createTaskItem({ title: 'Sectioned' })

    expect(listTaskSectionAssignments()).toEqual([])
    setTaskItemSection(task.id, section.id)
    expect(listTaskSectionAssignments()).toEqual([{ taskId: task.id, sectionId: section.id }])
    // Re-assigning moves the task; null unassigns.
    setTaskItemSection(task.id, other.id)
    expect(listTaskSectionAssignments()).toEqual([{ taskId: task.id, sectionId: other.id }])
    setTaskItemSection(task.id, null)
    expect(listTaskSectionAssignments()).toEqual([])

    // Integrity: unknown task / unknown section throw.
    expect(() => setTaskItemSection(987, section.id)).toThrow(/task #987/)
    expect(() => setTaskItemSection(task.id, 987)).toThrow(/section #987/)

    // Deleting a section unassigns its tasks instead of dangling.
    setTaskItemSection(task.id, other.id)
    deleteSection(other.id)
    expect(listTaskSectionAssignments()).toEqual([])
  })

  it('validates attachment types and task existence', () => {
    const task = createTaskItem({ title: 'With files' })
    const att = createTaskAttachment({
      taskId: task.id,
      type: 'url',
      value: ' https://docs.example.com ',
      title: 'Docs',
    })
    expect(att.value).toBe('https://docs.example.com')
    expect(() =>
      createTaskAttachment({ taskId: task.id, type: 'junk' as never, value: 'x' }),
    ).toThrow(/Attachment type/)
    expect(() => createTaskAttachment({ taskId: 987, type: 'file', value: 'x' })).toThrow(
      /task #987/,
    )
    expect(() => createTaskAttachment({ taskId: task.id, type: 'file', value: '  ' })).toThrow(
      /needs a value/,
    )
    expect(listTaskAttachments(task.id)).toHaveLength(1)
    expect(deleteTaskAttachment(att.id)).toBe(true)
  })
})

// ── Archive tiers ───────────────────────────────────────────────────────────

describe('archive tiers', () => {
  it('archives upserts the tier and restore clears it', () => {
    const task = createTaskItem({ title: 'Archive me' })
    archiveTaskItem(task.id, 'young', '2026-01-01T00:00:00.000Z')
    archiveTaskItem(task.id, 'old', '2026-02-01T00:00:00.000Z')
    expect(getArchiveTier(task.id)).toMatchObject({
      tier: 'old',
      archivedAt: '2026-02-01T00:00:00.000Z',
    })
    expect(() => archiveTaskItem(987)).toThrow(/task #987/)
    expect(restoreTaskItem(task.id)).toBe(true)
    expect(restoreTaskItem(task.id)).toBe(false)
    expect(listArchiveTiers()).toEqual([])
  })

  it('the auto-archive pass archives, promotes and restores', () => {
    // done 20 days ago → young; done 100 days ago → old; done 3 days ago → none.
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
    const young = createTaskItem({ title: 'Young' })
    completeTaskItem(young.id)
    db.update(taskItems)
      .set({ doneAt: day(20) })
      .where(eq(taskItems.id, young.id))
      .run()
    const old = createTaskItem({ title: 'Old' })
    completeTaskItem(old.id)
    db.update(taskItems)
      .set({ doneAt: day(100) })
      .where(eq(taskItems.id, old.id))
      .run()
    const fresh = createTaskItem({ title: 'Fresh' })
    completeTaskItem(fresh.id)
    db.update(taskItems)
      .set({ doneAt: day(3) })
      .where(eq(taskItems.id, fresh.id))
      .run()

    const first = runArchivePass(DEFAULT_ARCHIVE_CONFIG)
    expect(first.archived.sort()).toEqual([old.id, young.id].sort())
    // First pass only CREATES rows (both tiers land via toArchive); promotion
    // is a second-pass transition.
    expect(first.promoted).toEqual([])
    expect(getArchiveTier(young.id)!.tier).toBe('young')
    expect(getArchiveTier(old.id)!.tier).toBe('old')

    // Second pass (same clock) is idempotent.
    expect(runArchivePass(DEFAULT_ARCHIVE_CONFIG)).toEqual({
      archived: [],
      promoted: [],
      restored: [],
    })

    // A pass 61 days later ages the young row past oldAfterDays → promoted.
    const later = new Date(Date.now() + 61 * 86_400_000).toISOString()
    expect(runArchivePass(DEFAULT_ARCHIVE_CONFIG, later).promoted).toEqual([young.id])
    expect(getArchiveTier(young.id)!.tier).toBe('old')

    // Disabling the config drops every existing row back (the toRestore path).
    // The later pass also archived `fresh` (64 days old on that clock), so
    // all three rows are dropped back.
    const reset = runArchivePass({ ...DEFAULT_ARCHIVE_CONFIG, enabled: false }, later)
    expect(reset.restored.sort()).toEqual([old.id, young.id, fresh.id].sort())
    expect(listArchiveTiers()).toEqual([])
  })
})

// ── Saved views ─────────────────────────────────────────────────────────────

describe('saved views', () => {
  it('CRUDs views with kind + rule-chip filter', () => {
    const view = createTaskViewRow({
      name: 'Urgent work',
      kind: 'kanban',
      filter: { tagIds: [1], priority: 'high' },
      sortBy: 'due',
    })
    expect(getTaskViewRow(view.id)).toMatchObject({ kind: 'kanban', groupBy: null })
    updateTaskViewRow(view.id, { name: 'Urgent', groupBy: 'priority' })
    expect(getTaskViewRow(view.id)).toMatchObject({ name: 'Urgent', groupBy: 'priority' })
    expect(() => createTaskViewRow({ name: 'Bad', kind: 'matrix' as never })).toThrow(/View kind/)
    expect(() => createTaskViewRow({ name: '   ' })).toThrow(/needs a name/)
    expect(deleteTaskViewRow(view.id)).toBe(true)
    expect(listTaskViews()).toEqual([])
  })
})

// ── Counters + metric days ──────────────────────────────────────────────────

describe('simple counters', () => {
  it('accumulates taps per day and cascades deletes', () => {
    const counter = createCounterRow({ label: 'Water', color: 'blue' })
    incrementCounter(counter.id, '2026-02-01')
    incrementCounter(counter.id, '2026-02-01', 2)
    const logs = listCounterLogs({ counterId: counter.id })
    expect(logs).toHaveLength(1)
    expect(logs[0]!.count).toBe(3)
    expect(() => incrementCounter(counter.id, '2026-2-1')).toThrow(/YYYY-MM-DD/)
    expect(() => incrementCounter(987, '2026-02-01')).toThrow(/counter #987/)
    updateCounterRow(counter.id, { archived: true })
    expect(listCounters()).toEqual([])
    expect(listCounters({ includeArchived: true })).toHaveLength(1)
    expect(deleteCounterRow(counter.id)).toBe(true)
    expect(listCounterLogs()).toEqual([])
  })
})

describe('metric days', () => {
  it('merges metric entries per key and validates the evaluation sheet', () => {
    upsertMetricDay('2026-02-01', { metrics: { focus: 3_600_000 } })
    const day = upsertMetricDay('2026-02-01', {
      metrics: { focus: 1_800_000, tasks: 4 },
      impact: 3,
      energy: 2,
      reflection: 'Solid day',
    })
    expect(day.metrics).toEqual({ focus: 5_400_000, tasks: 4 })
    expect(day.impact).toBe(3)
    expect(() => upsertMetricDay('2026-02-01', { impact: 5 })).toThrow(/Impact is 1-4/)
    expect(() => upsertMetricDay('2026-02-01', { energy: 9 })).toThrow(/Energy is 1-3/)
    expect(() => upsertMetricDay('2026-2-1', {})).toThrow(/YYYY-MM-DD/)
    expect(listMetricDays({ from: '2026-02-01' })).toHaveLength(1)
    expect(getMetricDay('2026-02-01')!.reflection).toBe('Solid day')
  })
})

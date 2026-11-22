/**
 * Unit tests for per-task reminders (S3-08): model refine rules, planning
 * (at_time + relative resolution), quiet-hours flagging, unresolved reasons,
 * and the Android exact-alarm capability note.
 */
import { describe, expect, it } from 'vitest'
import { supportsExactAlarms, taskItemSchema, type TaskItem } from '../src/tasks'
import {
  createTaskReminder,
  planTaskReminders,
  taskReminderSchema,
  updateTaskReminder,
  validateTaskReminder,
  type TaskReminder,
} from '../src/tasks/reminders'

const NOW = '2026-11-22T10:00:00.000Z'

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 'Ship the matrix',
    notes: null,
    priority: 'none',
    estimateMs: null,
    timeSpentOnDay: {},
    due: '2026-11-22T14:00:00.000Z',
    dueWithTime: true,
    deadline: null,
    isDone: false,
    doneAt: null,
    wonthado: false,
    repeatCfgId: null,
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  })
}

function reminder(overrides: Partial<TaskReminder> = {}): TaskReminder {
  return taskReminderSchema.parse({
    id: 1,
    taskId: 1,
    type: 'at_time',
    remindAt: '2026-11-22T12:00:00.000Z',
    offsetMs: null,
    exactAlarm: false,
    createdAt: NOW,
    ...overrides,
  })
}

const QUIET_OFF = { quietStart: '22:00', quietEnd: '08:00', enabled: false }

describe('createTaskReminder (refine rules)', () => {
  it('creates at_time and relative reminders with the right field shape', () => {
    const atTime = createTaskReminder(
      { taskId: 1, type: 'at_time', remindAt: '2026-11-22T12:00:00.000Z' },
      NOW,
    )
    expect(atTime).toMatchObject({
      id: 0,
      type: 'at_time',
      remindAt: '2026-11-22T12:00:00.000Z',
      offsetMs: null,
      exactAlarm: false,
    })

    const relative = createTaskReminder({ taskId: 1, type: 'relative', offsetMs: -1_800_000 }, NOW)
    expect(relative).toMatchObject({ type: 'relative', remindAt: null, offsetMs: -1_800_000 })
  })

  it('rejects cross-field mistakes (at_time without remindAt, relative with remindAt)', () => {
    expect(() => createTaskReminder({ taskId: 1, type: 'at_time' }, NOW)).toThrow()
    expect(() =>
      createTaskReminder(
        { taskId: 1, type: 'relative', offsetMs: -1, remindAt: '2026-11-22T12:00:00.000Z' },
        NOW,
      ),
    ).toThrow()
    expect(() => createTaskReminder({ taskId: 1, type: 'relative' }, NOW)).toThrow()
  })

  it('updateTaskReminder patches immutably', () => {
    const next = updateTaskReminder(reminder(), { exactAlarm: true })
    expect(next.exactAlarm).toBe(true)
    expect(reminder().exactAlarm).toBe(false)
  })
})

describe('planTaskReminders', () => {
  it('resolves at_time fire times, sorted, with past flagging', () => {
    const t = task()
    const rs = [
      reminder({ id: 2, remindAt: '2026-11-22T09:00:00.000Z' }), // past
      reminder({ id: 3, remindAt: '2026-11-22T18:00:00.000Z' }), // future
    ]
    const { planned, unresolved } = planTaskReminders(t, rs, QUIET_OFF, NOW)
    expect(unresolved).toEqual([])
    expect(planned.map((p) => p.reminder.id)).toEqual([2, 3])
    expect(planned[0]?.isPast).toBe(true)
    expect(planned[1]?.isPast).toBe(false)
    expect(planned[1]?.label).toBe('Task reminder: Ship the matrix')
  })

  it('resolves relative reminders against the due moment (30 min before)', () => {
    const t = task() // due 14:00Z
    const rs = [reminder({ type: 'relative', remindAt: null, offsetMs: -1_800_000 })]
    const { planned, unresolved } = planTaskReminders(t, rs, QUIET_OFF, NOW)
    expect(unresolved).toEqual([])
    expect(planned[0]?.fireAt).toBe('2026-11-22T13:30:00.000Z')
    expect(planned[0]?.label).toBe('Due in 30 min: Ship the matrix')
  })

  it('relative reminders after due flag as overdue', () => {
    const t = task()
    const rs = [reminder({ type: 'relative', remindAt: null, offsetMs: 900_000 })]
    const { planned } = planTaskReminders(t, rs, QUIET_OFF, NOW)
    expect(planned[0]?.fireAt).toBe('2026-11-22T14:15:00.000Z')
    expect(planned[0]?.label).toContain('Overdue by 15 min')
  })

  it('relative reminders on a task without due go to unresolved with the reason', () => {
    const t = task({ due: null, dueWithTime: false })
    const rs = [reminder({ type: 'relative', remindAt: null, offsetMs: -1_800_000 })]
    const { planned, unresolved } = planTaskReminders(t, rs, QUIET_OFF, NOW)
    expect(planned).toEqual([])
    expect(unresolved).toEqual([
      { reminderId: 1, reason: 'relative reminder on a task without a due date' },
    ])
  })

  it('ignores reminders owned by other tasks', () => {
    const t = task()
    const rs = [reminder({ taskId: 99 })]
    const { planned } = planTaskReminders(t, rs, QUIET_OFF, NOW)
    expect(planned).toEqual([])
  })

  it('flags fire times inside quiet hours when the policy is on', () => {
    const t = task()
    // 02:00Z is inside the 22:00→08:00 overnight window
    const rs = [reminder({ remindAt: '2026-11-23T02:00:00.000Z' })]
    const on = planTaskReminders(
      t,
      rs,
      { quietStart: '22:00', quietEnd: '08:00', enabled: true },
      NOW,
    )
    expect(on.planned[0]?.inQuietHours).toBe(true)
    const off = planTaskReminders(t, rs, QUIET_OFF, NOW)
    expect(off.planned[0]?.inQuietHours).toBe(false)
  })

  it('unresolved includes invalid at_time timestamps', () => {
    const t = task()
    const rs = [reminder({ remindAt: 'not-a-date' })]
    const { unresolved } = planTaskReminders(t, rs, QUIET_OFF, NOW)
    expect(unresolved[0]?.reason).toBe('remindAt is not a valid timestamp')
  })
})

describe('exact alarms (Android note)', () => {
  it('exact-alarm path is an Android-only capability', () => {
    expect(supportsExactAlarms('android')).toBe(true)
    expect(supportsExactAlarms('windows')).toBe(false)
    expect(supportsExactAlarms('web')).toBe(false)
  })

  it('validate keeps exactAlarm coherent and warns on relative remindAt leftovers', () => {
    expect(validateTaskReminder(reminder({ exactAlarm: true })).ok).toBe(true)
    const mixed = validateTaskReminder(reminder({ type: 'relative', remindAt: NOW, offsetMs: -1 }))
    expect(mixed.ok).toBe(true)
    expect(mixed.warnings).toContain(
      'relative reminders ignore remindAt — it is resolved from the due moment.',
    )
    expect(validateTaskReminder(reminder({ remindAt: null })).ok).toBe(false)
    expect(
      validateTaskReminder(reminder({ type: 'relative', remindAt: null, offsetMs: null })).ok,
    ).toBe(false)
  })
})

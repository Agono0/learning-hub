/**
 * Tasks — per-task reminders (S3-08): SP's reminder-per-task planner.
 *
 * Reuses the global reminder system's patterns (`packages/core/src/reminders`:
 * candidate shape, quiet hours) but plans TASK-scoped fire times: each task
 * can carry reminders that fire at a fixed datetime or RELATIVE to its due
 * moment (e.g. 30 min before). Delivery is the native layer's job
 * (`task_reminders` table S3-01; scheduler S3-19) — this module only
 * produces the ordered, quiet-hours-respecting plan.
 *
 * **Android exact alarms:** reminders flagged `exactAlarm` request the
 * exact-alarm path (`SCHEDULE_EXACT_ALARM` / `AlarmManager.setExactAndAllowWhileIdle`)
 * on Android so they fire within their minute even in Doze; see
 * `supportsExactAlarms` and docs/native.md. Windows desktop alarms have no
 * such constraint (in-process timers suffice while the app runs).
 */
import { z } from 'zod'
import { extractTimeHHMM, isQuietHours } from '../reminders'
import type { TaskItem } from './index'

// ── Model ───────────────────────────────────────────────────────────────────

/** Reminder kinds for tasks: fixed datetime, or offset from the due moment. */
export const taskReminderTypeSchema = z.enum(['at_time', 'relative'])

/** A task reminder type. */
export type TaskReminderType = z.infer<typeof taskReminderTypeSchema>

/**
 * The per-task reminder — mirrors `task_reminders` (S3-01). For `at_time`,
 * `remindAt` is the full ISO fire time. For `relative`, `remindAt` is
 * EMPTY at write time and RESOLVED by {@link planTaskReminders} from the
 * task's due moment minus/plus {@link TaskReminder.offsetMs}.
 */
export const taskReminderSchema = z.object({
  /** Row id; `0` for unpersisted drafts. */
  id: z.number().int().nonnegative(),
  /** Owning task row id. */
  taskId: z.number().int().positive(),
  type: taskReminderTypeSchema,
  /** Fire time for `at_time` reminders (full ISO); null for `relative`. */
  remindAt: z.string().nullable(),
  /** Offset from the due moment in ms (negative = before due). `relative` only. */
  offsetMs: z.number().int().nullable(),
  /** Android: request the exact-alarm path (fires within the minute, Doze-proof). */
  exactAlarm: z.boolean(),
  createdAt: z.string().min(1),
})

/** The parsed {@link taskReminderSchema} shape. */
export type TaskReminder = z.infer<typeof taskReminderSchema>

/** Input for {@link createTaskReminder}. */
export const createTaskReminderInputSchema = z
  .object({
    taskId: z.number().int().positive(),
    type: taskReminderTypeSchema,
    remindAt: z.string().nullable().optional(),
    offsetMs: z.number().int().nullable().optional(),
    exactAlarm: z.boolean().optional(),
  })
  .refine((v) => (v.type === 'at_time' ? v.remindAt != null : v.remindAt == null), {
    message: 'at_time reminders need remindAt; relative reminders must not set it.',
  })
  .refine((v) => (v.type === 'relative' ? v.offsetMs != null : true), {
    message: 'relative reminders need an offsetMs from the due moment.',
  })

/** The parsed {@link createTaskReminderInputSchema} shape. */
export type CreateTaskReminderInput = z.infer<typeof createTaskReminderInputSchema>

/** Validation result (habits.ts style). */
export interface TaskReminderValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

// ── Ops ─────────────────────────────────────────────────────────────────────

/** Create a reminder from validated input (`id: 0` = draft; exactAlarm defaults off). */
export function createTaskReminder(input: CreateTaskReminderInput, now: string): TaskReminder {
  const v = createTaskReminderInputSchema.parse(input)
  return {
    id: 0,
    taskId: v.taskId,
    type: v.type,
    remindAt: v.type === 'at_time' ? (v.remindAt ?? null) : null,
    offsetMs: v.type === 'relative' ? (v.offsetMs ?? null) : null,
    exactAlarm: v.exactAlarm ?? false,
    createdAt: now,
  }
}

/** Apply a validated patch immutably (fields swap together per the refine rules). */
export function updateTaskReminder(
  reminder: TaskReminder,
  patch: Partial<Pick<TaskReminder, 'remindAt' | 'offsetMs' | 'exactAlarm'>>,
): TaskReminder {
  return { ...reminder, ...patch }
}

/**
 * A reminder resolved to a concrete fire time (what the scheduler S3-19
 * hands the notification layer).
 */
export interface PlannedTaskReminder {
  reminder: TaskReminder
  /** Resolved fire time (full ISO). */
  fireAt: string
  /** True when fireAt already passed (the scheduler should skip / mark fired). */
  isPast: boolean
  /** True when fireAt lands inside quiet hours (defer per the global policy). */
  inQuietHours: boolean
  /** Human label for the notification body. */
  label: string
}

/**
 * Plan the concrete fire times for one task's reminders.
 *
 * - `relative` reminders resolve against the task's due moment; tasks
 *   without a due value SKIP them (skipped land in `unresolved` with the
 *   reason — a reminder that can never fire must not silently vanish).
 * - Quiet hours are evaluated with the global settings (same policy as the
 *   learning reminders); quiet-hour entries keep their resolved time and
 *   are flagged so the scheduler can defer to the quiet end.
 * - Sorted by fire time, past entries first (so the scheduler can retire
 *   them deterministically).
 */
export function planTaskReminders(
  task: TaskItem,
  reminders: TaskReminder[],
  quiet: { quietStart: string; quietEnd: string; enabled: boolean },
  now: string,
): { planned: PlannedTaskReminder[]; unresolved: Array<{ reminderId: number; reason: string }> } {
  const planned: PlannedTaskReminder[] = []
  const unresolved: Array<{ reminderId: number; reason: string }> = []
  const nowMs = Date.parse(now)

  for (const reminder of reminders) {
    if (reminder.taskId !== task.id) continue
    let fireAtMs: number | null = null
    let label = ''
    if (reminder.type === 'at_time') {
      if (reminder.remindAt === null) {
        unresolved.push({ reminderId: reminder.id, reason: 'at_time reminder without remindAt' })
        continue
      }
      fireAtMs = Date.parse(reminder.remindAt)
      if (Number.isNaN(fireAtMs)) {
        unresolved.push({ reminderId: reminder.id, reason: 'remindAt is not a valid timestamp' })
        continue
      }
      label = `Task reminder: ${task.title}`
    } else {
      if (task.due === null) {
        unresolved.push({
          reminderId: reminder.id,
          reason: 'relative reminder on a task without a due date',
        })
        continue
      }
      const dueMs = Date.parse(task.due)
      if (Number.isNaN(dueMs) || reminder.offsetMs === null) {
        unresolved.push({
          reminderId: reminder.id,
          reason: 'relative reminder has no resolvable due moment or offset',
        })
        continue
      }
      fireAtMs = dueMs + reminder.offsetMs
      const minutes = Math.round(Math.abs(reminder.offsetMs) / 60_000)
      label =
        reminder.offsetMs < 0
          ? `Due in ${minutes} min: ${task.title}`
          : `Overdue by ${minutes} min: ${task.title}`
    }

    const fireAt = new Date(fireAtMs).toISOString()
    const inQuiet =
      quiet.enabled && isQuietHours(extractTimeHHMM(fireAt), quiet.quietStart, quiet.quietEnd)
    planned.push({
      reminder,
      fireAt,
      isPast: fireAtMs <= nowMs,
      inQuietHours: inQuiet,
      label,
    })
  }

  planned.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt))
  return { planned, unresolved }
}

// ── Platform notes ──────────────────────────────────────────────────────────

/**
 * Whether this platform can honor `exactAlarm` reminders. Only Android
 * needs (and supports) the exact-alarm path; on web/desktop the value is
 * advisory — the scheduler delivers in-process. The native plugin (O1-13
 * era work) maps this onto `AlarmManager.setExactAndAllowWhileIdle` and
 * must degrade to inexact when the OS denies `SCHEDULE_EXACT_ALARM`.
 */
export function supportsExactAlarms(platform: 'web' | 'windows' | 'android' | 'other'): boolean {
  return platform === 'android'
}

/** Validation: type-specific fields coherent, timestamps parseable. */
export function validateTaskReminder(reminder: TaskReminder): TaskReminderValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (reminder.type === 'at_time') {
    if (reminder.remindAt === null) errors.push('at_time reminders need remindAt.')
    else if (Number.isNaN(Date.parse(reminder.remindAt))) {
      errors.push('remindAt is not a valid timestamp.')
    }
  } else {
    if (reminder.offsetMs === null) errors.push('relative reminders need offsetMs.')
    if (reminder.remindAt !== null) {
      warnings.push('relative reminders ignore remindAt — it is resolved from the due moment.')
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

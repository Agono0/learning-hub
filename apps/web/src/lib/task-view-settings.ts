/**
 * Task-view settings (S3-44) — the show/hide/sort/group state per view,
 * device-local (the audit L7a family: `task_views` rows persist the
 * server-shareable half — name/kind/filter/sort/group — while these row
 * presentation toggles stay on the device, like `@/lib/board-views`).
 *
 * Zod-validated at every read: a corrupted record degrades to defaults,
 * never a crash. Keys are per view (`default` for the un-saved list).
 */
import { z } from 'zod'

/** Which columns a task list shows and how it sorts/groups (S3-44). */
export const taskViewSettingsSchema = z.object({
  showEstimate: z.boolean().default(true),
  showPriority: z.boolean().default(true),
  showDeadline: z.boolean().default(true),
  showTags: z.boolean().default(true),
  showProject: z.boolean().default(false),
  /** Sort key for the list (`manual` = the stored order ordinal). */
  sortBy: z.enum(['manual', 'due', 'deadline', 'priority', 'estimate', 'title']).default('manual'),
  /** Grouping for the list (`none` = one flat list). */
  groupBy: z.enum(['none', 'project', 'tag', 'priority', 'due']).default('none'),
})

/** The parsed settings shape. */
export type TaskViewSettings = z.infer<typeof taskViewSettingsSchema>

/** Calm defaults (everything on, manual order, flat list). */
export function defaultTaskViewSettings(): TaskViewSettings {
  return taskViewSettingsSchema.parse({})
}

const KEY_PREFIX = 'lh:task-view-settings:'

/** Load one view's settings (defaults off-storage / corrupted). */
export function loadTaskViewSettings(viewKey: string): TaskViewSettings {
  if (typeof window === 'undefined') return defaultTaskViewSettings()
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + viewKey)
    if (!raw) return defaultTaskViewSettings()
    return taskViewSettingsSchema.parse(JSON.parse(raw) as unknown)
  } catch {
    return defaultTaskViewSettings()
  }
}

/** Persist one view's settings (silent on storage errors). */
export function saveTaskViewSettings(viewKey: string, settings: TaskViewSettings): void {
  if (typeof window === 'undefined') return
  const valid = taskViewSettingsSchema.parse(settings)
  try {
    window.localStorage.setItem(KEY_PREFIX + viewKey, JSON.stringify(valid))
  } catch {
    // private mode / quota — settings stay session-local
  }
}

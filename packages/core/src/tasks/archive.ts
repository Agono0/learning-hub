/**
 * Tasks — archive core (S3-11): SP's two-tier auto-archive.
 *
 * Done tasks don't clutter lists forever: SP auto-archives them into a
 * YOUNG tier (recently done, restorable in place) and later an OLD tier
 * (deep storage). The rule is age-based and configurable; restore always
 * returns the task to open-with-original-timestamps.
 *
 * The tier state persists in `task_archive_tiers` (S3-02: one row per
 * archived task, `young | old`). This module computes WHEN things move and
 * produces the state transitions — pure, `now` injected.
 *
 * Orchestration note (SP's archive-orchestrator): the archive pass is a
 * pure fold over tasks + existing tiers; the S3-16 handler persists rows
 * transactionally.
 */
import type { TaskItem } from './shared'

/** Archive tiers, coldest last. */
export type ArchiveTier = 'young' | 'old'

/** One archived-task state row (mirrors `task_archive_tiers`). */
export interface ArchiveEntry {
  taskId: number
  tier: ArchiveTier
  /** When the task was archived (full ISO). */
  archivedAt: string
}

/** Auto-archive configuration (SP's defaults). */
export interface ArchiveConfig {
  /** Days after completion before a done task enters the young tier. */
  youngAfterDays: number
  /** Days in the young tier before promotion to old. */
  oldAfterDays: number
  /** Master switch (SP lets users turn auto-archive off). */
  enabled: boolean
}

/** SP's calm defaults: 14 days to young, 60 more to old. */
export const DEFAULT_ARCHIVE_CONFIG: ArchiveConfig = {
  youngAfterDays: 14,
  oldAfterDays: 60,
  enabled: true,
}

const DAY_MS = 86_400_000

function daysBetween(isoA: string, isoB: string): number {
  const a = Date.parse(isoA)
  const b = Date.parse(isoB)
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY
  return (b - a) / DAY_MS
}

/**
 * The desired tier for a DONE task given its completion age — or null when
 * it should not be archived yet (open tasks and tasks below the young age
 * threshold stay where they are; disabled configs never archive).
 */
export function desiredTier(
  task: Pick<TaskItem, 'isDone' | 'doneAt'>,
  config: ArchiveConfig,
  now: string,
): ArchiveTier | null {
  if (!config.enabled || !task.isDone || task.doneAt === null) return null
  const ageDays = daysBetween(task.doneAt, now)
  if (ageDays >= config.youngAfterDays + config.oldAfterDays) return 'old'
  if (ageDays >= config.youngAfterDays) return 'young'
  return null
}

/**
 * The archive pass: for each task, decide whether to create/update an
 * archive tier row (SP's archive-orchestrator, as data).
 *
 * Returns three lists:
 * - `toArchive`: tasks that need a NEW tier row (tier included);
 * - `toPromote`: existing young rows that must become `old`;
 * - `toRestore`: tier rows that must be DELETED (task was reopened or the
 *   desired tier fell back below the archived one — e.g. config disabled).
 *
 * Tasks still in their desired tier produce nothing. Done tasks with an
 * existing row of the same tier are left alone (idempotent passes).
 */
export function planArchivePass(
  tasks: TaskItem[],
  existing: ArchiveEntry[],
  config: ArchiveConfig,
  now: string,
): {
  toArchive: Array<{ task: TaskItem; tier: ArchiveTier }>
  toPromote: ArchiveEntry[]
  toRestore: ArchiveEntry[]
} {
  const byTask = new Map(existing.map((e) => [e.taskId, e]))
  const toArchive: Array<{ task: TaskItem; tier: ArchiveTier }> = []
  const toPromote: ArchiveEntry[] = []
  const toRestore: ArchiveEntry[] = []
  const touched = new Set<number>()

  for (const task of tasks) {
    const row = byTask.get(task.id)
    const want = desiredTier(task, config, now)

    if (!task.isDone || want === null) {
      // Open again (or archive disabled): any row is stale → restore.
      if (row) toRestore.push(row)
      continue
    }
    touched.add(task.id)
    if (!row) {
      toArchive.push({ task, tier: want })
    } else if (row.tier === 'young' && want === 'old') {
      toPromote.push(row)
    }
    // row.tier === want → idempotent no-op; a task somehow archived as old
    // while still young-desired stays old (tiers only cool down).
  }

  // Rows for tasks that no longer exist in the list → restore (defensive:
  // keeps the tier table in lockstep with the task set it was given).
  for (const row of existing) {
    if (!touched.has(row.taskId) && !tasks.some((t) => t.id === row.taskId)) {
      toRestore.push(row)
    }
  }

  return { toArchive, toPromote, toRestore }
}

/**
 * Restore an archived task: returns the task made open again (doneAt
 * cleared, fresh updatedAt) and the row to delete — the handler does both
 * writes transactionally.
 */
export function restoreFromArchive(
  task: TaskItem,
  now: string,
): { task: TaskItem; removeEntryFor: number } {
  return { task: { ...task, isDone: false, doneAt: null, updatedAt: now }, removeEntryFor: task.id }
}

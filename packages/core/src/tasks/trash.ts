/**
 * Tasks — recently-deleted trash (S3-12): SP's 30-day safety net.
 *
 * Deleting a task moves it to the trash (device-local, NOT synced — the
 * snapshot-sync wholesale merge would resurrect deleted rows on other
 * devices, so deletions stay local like the sync roster identity). Entries
 * auto-expire after `TRASH_TTL_DAYS` and are restorable until then.
 *
 * Pure module over the entry records; the S3-16 handler persists them
 * (JSON side-table / userSettings blob until the lead grants a dedicated
 * table — the shape here is storage-agnostic).
 */
import { z } from 'zod'

/** How long a deleted task stays restorable (SP's 30 days). */
export const TRASH_TTL_DAYS = 30

const DAY_MS = 86_400_000

/**
 * One trash entry: the task snapshot as it was at deletion, plus when it
 * was deleted (TTL anchor) and from where.
 */
export const trashEntrySchema = z.object({
  /** The deleted task's row id (kept so restore can re-insert at the id). */
  taskId: z.number().int().positive(),
  /** The full task snapshot at deletion time. */
  snapshot: z.record(z.string(), z.unknown()),
  /** Human title for the trash list (denormalized from the snapshot). */
  title: z.string().min(1),
  /** Deletion timestamp (TTL anchor, full ISO). */
  deletedAt: z.string().min(1),
  /** Which surface deleted it (undo context). */
  deletedVia: z.enum(['task-row', 'bulk', 'context-menu', 'finish-day']),
})

/** The parsed {@link trashEntrySchema} shape. */
export type TrashEntry = z.infer<typeof trashEntrySchema>

/** Input for {@link createTrashEntry}. */
export const createTrashEntryInputSchema = trashEntrySchema.omit({ deletedAt: true })

/** Days until an entry expires (from deletion), rounded up; expired entries purge. */
export function daysUntilExpiry(entry: Pick<TrashEntry, 'deletedAt'>, now: string): number {
  const deletedMs = Date.parse(entry.deletedAt)
  const nowMs = Date.parse(now)
  if (Number.isNaN(deletedMs) || Number.isNaN(nowMs)) return 0
  return Math.max(0, Math.ceil((deletedMs + TRASH_TTL_DAYS * DAY_MS - nowMs) / DAY_MS))
}

/** True when the entry is past its TTL and should be purged. */
export function isExpired(entry: Pick<TrashEntry, 'deletedAt'>, now: string): boolean {
  const deletedMs = Date.parse(entry.deletedAt)
  // Fail CLOSED on a corrupt stamp: an unparseable deletedAt counts as
  // expired so the view never renders rot and the purge reclaims it.
  if (Number.isNaN(deletedMs)) return true
  const nowMs = Date.parse(now)
  if (Number.isNaN(nowMs)) return false // unmeasurable now: nothing is provably past TTL
  return deletedMs + TRASH_TTL_DAYS * DAY_MS <= nowMs
}

/** Create an entry from a deletion event (`now` stamps the TTL anchor). */
export function createTrashEntry(
  input: {
    taskId: number
    snapshot: Record<string, unknown>
    title: string
    deletedVia: TrashEntry['deletedVia']
  },
  now: string,
): TrashEntry {
  return trashEntrySchema.parse({ ...input, deletedAt: now })
}

/**
 * The trash list: newest deletions first, expired entries filtered out
 * (purging happens on the next pass — the view never shows rot).
 */
export function trashList(entries: TrashEntry[], now: string): TrashEntry[] {
  return entries
    .filter((e) => !isExpired(e, now))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

/**
 * The purge pass: expired entry ids to delete from storage. Pure — the
 * handler applies it on app start / after deletions.
 */
export function purgeExpired(entries: TrashEntry[], now: string): number[] {
  return entries.filter((e) => isExpired(e, now)).map((e) => e.taskId)
}

/** Restore input: the snapshot to hand back to `taskItemSchema.parse`. */
export function restoreFromTrash(entry: TrashEntry): Record<string, unknown> {
  return entry.snapshot
}

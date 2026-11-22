/**
 * Device-local trash store (S3-76 wiring of the S3-12 core) — the DELETE
 * /api/tasks/[id] handler returns the trash entry; the client keeps it here
 * (device-local by design: the snapshot-sync merge must never resurrect
 * deleted rows on other devices). Reads purge expired entries via the core
 * TTL math and validate every record, so corruption degrades to fewer rows,
 * never a crash.
 */
import { isExpired, trashEntrySchema, trashList, type TrashEntry } from '@learning-hub/core'

const KEY = 'lh:task-trash'
const LIMIT = 200

/** Raw stored records — created by {@link putTrashEntry} via the core schema. */
function loadRaw(): TrashEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => safeEntry(item)).filter((e): e is TrashEntry => e !== null)
  } catch {
    return []
  }
}

/** Validate one record without throwing — the FULL schema (deletedAt is the
 * stored TTL anchor and must survive the round-trip, never re-stamped). */
function safeEntry(item: unknown): TrashEntry | null {
  const parsed = trashEntrySchema.safeParse(item)
  return parsed.success ? parsed.data : null
}

function persist(entries: TrashEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)))
  } catch {
    // private mode / quota — trash stays session-local
  }
}

/** The restorable entries, newest first, expired ones purged on read. */
export function listTrashEntries(now: string): TrashEntry[] {
  const alive = trashList(loadRaw(), now)
  // Persist the purge lazily: expired rows are dropped on the next write.
  return alive
}

/** Expired entry ids (the purge list the view offers). */
export function expiredTrashIds(now: string): number[] {
  return loadRaw()
    .filter((e) => isExpired(e, now))
    .map((e) => e.taskId)
}

/** Stash an entry (from DELETE /api/tasks/[id]'s response). */
export function putTrashEntry(entry: TrashEntry, now: string): TrashEntry[] {
  const alive = trashList(loadRaw(), now).filter((e) => e.taskId !== entry.taskId)
  const next = [entry, ...alive]
  persist(next)
  return next
}

/** Remove an entry (after a successful restore) — by task id. */
export function removeTrashEntry(taskId: number): TrashEntry[] {
  const next = loadRaw().filter((e) => e.taskId !== taskId)
  persist(next)
  return next
}

/** Drop expired entries now (the purge button's call). */
export function purgeExpiredEntries(now: string): number[] {
  const ids = expiredTrashIds(now)
  persist(loadRaw().filter((e) => !isExpired(e, now)))
  return ids
}

/** Restore via POST /api/tasks/[id]/restore, then drop the entry locally. */
export async function restoreFromTrash(taskId: number, now: string): Promise<TrashEntry[]> {
  const { apiSend } = await import('./transport')
  await apiSend(`/api/tasks/${taskId}/restore`, 'POST', {})
  return removeTrashEntry(taskId)
}

/** Which surface deleted the task (the core union). */
export type TrashVia = TrashEntry['deletedVia']
export type { TrashEntry }

/**
 * Tasks — search core (S3-14): task+note search including done/archived.
 *
 * Scoring is deliberately simple and deterministic (SP parity): prefix
 * matches on the title outrank substring matches, which outrank note/notes
 * matches; ties break by recency. Case/diacritics-folded so "Jose" finds
 * "José". FTS5 (migration 003, S3-67's task index) stays the storage-side
 * accelerator — this module is the CORRECTNESS reference the repos use for
 * tests and small result sets.
 *
 * Scope options: include done tasks (default off — search mirrors the
 * Today bar's live feel) and include archived/trashed (default off).
 * Won't-do tasks never match (S3-66: excluded from everything).
 */
import type { TaskItem } from './index'

/** What a search backend must expose for one searchable row. */
export interface SearchDoc {
  id: number
  title: string
  /** Task notes (may be null). */
  notes: string | null
  isDone: boolean
  /** True when the task sits in the archive tiers or trash. */
  isArchived?: boolean
  updatedAt: string
}

/** Search options (SP parity: done/archived opt-in). */
export interface SearchOptions {
  includeDone?: boolean
  includeArchived?: boolean
  /** Max results (default 20, SP's cap). */
  limit?: number
}

/** One scored hit. */
export interface SearchHit<T> {
  doc: T
  score: number
}

/** Unicode NFD + combining-mark strip: the cheap diacritics fold. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Score one doc against a folded query (0 = no match). */
function scoreDoc(doc: SearchDoc, query: string): number {
  const title = fold(doc.title)
  const notes = fold(doc.notes ?? '')
  if (title.startsWith(query)) return 100
  const idx = title.indexOf(query)
  if (idx >= 0) return 80 - Math.min(30, idx) // earlier = slightly better
  if (notes.length > 0 && notes.includes(query)) return 40
  return 0
}

/** Whether a doc passes the scope filters. */
function inScope(
  doc: SearchDoc,
  opts: Required<Pick<SearchOptions, 'includeDone' | 'includeArchived'>>,
): boolean {
  if (doc.isDone && !opts.includeDone) return false
  if ((doc.isArchived ?? false) && !opts.includeArchived) return false
  return true
}

/**
 * Search tasks (+ notes) for a query. Deterministic ranking: title-prefix
 * (100) > title-substring (80 − offset) > notes (40); ties break by
 * updatedAt descending (recency), then id ascending for full stability.
 * Empty/whitespace query → empty results (no "search everything").
 */
export function searchTasks<T extends SearchDoc>(
  docs: T[],
  rawQuery: string,
  opts: SearchOptions = {},
): Array<SearchHit<T>> {
  const query = fold(rawQuery.trim())
  if (query.length === 0) return []
  const limit = opts.limit ?? 20
  const scope = {
    includeDone: opts.includeDone ?? false,
    includeArchived: opts.includeArchived ?? false,
  }

  const hits: Array<SearchHit<T>> = []
  for (const doc of docs) {
    if (!inScope(doc, scope)) continue
    const score = scoreDoc(doc, query)
    if (score > 0) hits.push({ doc, score })
  }
  return hits
    .sort(
      (a, b) =>
        b.score - a.score || b.doc.updatedAt.localeCompare(a.doc.updatedAt) || a.doc.id - b.doc.id,
    )
    .slice(0, limit)
}

/**
 * TaskItem → SearchDoc adapter (the common case): won't-do tasks are
 * excluded unconditionally (S3-66 — written-off work is not searchable,
 * returns `null`), and `isArchived` comes from the caller (tier rows /
 * trash membership).
 */
export function taskToSearchDoc(
  task: TaskItem,
  opts: { isArchived?: boolean } = {},
): (SearchDoc & { task: TaskItem }) | null {
  if (task.wonthado) return null
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    isDone: task.isDone,
    isArchived: opts.isArchived ?? false,
    updatedAt: task.updatedAt,
    task,
  }
}

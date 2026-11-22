/**
 * Project bookmarks (S3-74) — device-local links/files/commands per project.
 *
 * SP's project notes carry a bookmark row set; the 031/032 schema has no
 * project-attachment table, so the rows persist DEVICE-LOCAL (the same
 * pattern as board views and calendar feed caches — JSON in localStorage,
 * schema-validated, corrupted store reads as empty, never a crash). Restore
 * across devices would need a LEAD migration (`project_bookmarks`); the
 * shape here maps 1:1 onto such a table's columns.
 */
import { z } from 'zod'

/** One bookmark row (SP: links, files and shell commands on a project). */
export const projectBookmarkSchema = z.object({
  /** Stable local id (generated at add time). */
  id: z.string().min(1).max(64),
  projectId: z.number().int().positive(),
  type: z.enum(['file', 'url', 'command']),
  /** The link href, file path or command line. */
  value: z.string().min(1).max(2000),
  /** Optional display title (defaults to the value in the UI). */
  title: z.string().max(200).nullable(),
  createdAt: z.string().min(1),
})
export type ProjectBookmark = z.infer<typeof projectBookmarkSchema>

const KEY = 'lh-project-bookmarks'

/** Read the whole store. Corrupted JSON / wrong shape reads as empty. */
function loadAll(): Record<string, ProjectBookmark[]> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Record<string, ProjectBookmark[]> = {}
    for (const [projectId, rows] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(rows)) continue
      const valid = rows
        .map((r) => projectBookmarkSchema.safeParse(r))
        .filter((r): r is { success: true; data: ProjectBookmark } => r.success)
        .map((r) => r.data)
      out[projectId] = valid
    }
    return out
  } catch {
    return {}
  }
}

function saveAll(all: Record<string, ProjectBookmark[]>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* private mode — session-only bookmarks */
  }
}

/** Bookmarks of one project, oldest first. */
export function loadBookmarks(projectId: number): ProjectBookmark[] {
  return loadAll()[String(projectId)] ?? []
}

/** Add a bookmark (generates the id, stamps createdAt) and return the row. */
export function addBookmark(input: {
  projectId: number
  type: ProjectBookmark['type']
  value: string
  title?: string | null
}): ProjectBookmark {
  const bookmark: ProjectBookmark = {
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: input.projectId,
    type: input.type,
    value: input.value,
    title: input.title ?? null,
    createdAt: new Date().toISOString(),
  }
  const all = loadAll()
  const key = String(input.projectId)
  all[key] = [...(all[key] ?? []), bookmark]
  saveAll(all)
  return bookmark
}

/** Remove one bookmark; returns the remaining rows for the project. */
export function removeBookmark(projectId: number, bookmarkId: string): ProjectBookmark[] {
  const all = loadAll()
  const key = String(projectId)
  const remaining = (all[key] ?? []).filter((b) => b.id !== bookmarkId)
  all[key] = remaining
  saveAll(all)
  return remaining
}

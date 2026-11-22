'use client'

/**
 * Custom board views — device-local store for S3-24's saved rule views.
 *
 * Why device-local (audit L7a family, like `@/lib/calendar-feeds`): the
 * `task_views` rows (S3-17) persist a single filter per view — enough for
 * filtered LISTS, not for a multi-column board whose columns each carry a
 * filter+apply chip. The full shape lives here until the schema gains a
 * columns column (a LEAD batch — see docs/SHARED_CHANGES.md, not requested
 * yet); the store is zod-validated at every read so a corrupted record
 * degrades to "no custom views", never a crash.
 *
 * Views are validated through the core `boardViewSchema` (kind `custom`)
 * so the page and the engine share one contract.
 */
import { z } from 'zod'
import { boardViewSchema, type BoardView } from '@learning-hub/core/boards'

const KEY = 'lh-board-views'
const LIMIT = 20

/** Custom saved view row (kind is always 'custom'). */
const storedViewSchema = boardViewSchema.extend({ kind: z.literal('custom') })
export type StoredBoardView = z.infer<typeof storedViewSchema>

/** Read the saved custom views (empty list off-storage / corrupted). */
export function loadBoardViews(): StoredBoardView[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => storedViewSchema.safeParse(item))
      .filter((r): r is { success: true; data: StoredBoardView } => r.success)
      .map((r) => r.data)
  } catch {
    return []
  }
}

/** Persist the custom views (capped; silent on storage errors). */
export function saveBoardViews(views: StoredBoardView[]): StoredBoardView[] {
  const valid = views.slice(0, LIMIT).map((v) => storedViewSchema.parse(v))
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(valid))
    } catch {
      // private mode / quota — views stay session-local
    }
  }
  return valid
}

/** Save (upsert by id) a custom view; returns the updated list. */
export function putBoardView(view: Omit<BoardView, 'kind'>): StoredBoardView[] {
  const stored: StoredBoardView = storedViewSchema.parse({ ...view, kind: 'custom' })
  const others = loadBoardViews().filter((v) => v.id !== stored.id)
  return saveBoardViews([...others, stored])
}

/** Delete by id (idempotent). */
export function removeBoardView(id: string): StoredBoardView[] {
  return saveBoardViews(loadBoardViews().filter((v) => v.id !== id))
}

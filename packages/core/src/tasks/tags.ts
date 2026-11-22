/**
 * Tasks — tags (S3-06): the SP-parity tag model for the task system.
 *
 * Tags color-code and filter tasks (S3-23 renders them; `task_tags` +
 * `task_item_tags` persist them, S3-01). Pure model + filters, immutable,
 * no I/O. Virtual tags (Today, "no tags") live in NEGATIVE id space so the
 * UI can treat them like any other chip; Today membership math itself is
 * S3-65's (`due`-only rule) — this module only reserves the id.
 */
import { z } from 'zod'

// ── Schema ──────────────────────────────────────────────────────────────────

/**
 * The tag model — mirrors `task_tags` (S3-01). `id === 0` means "not
 * persisted yet" (draft from {@link createTag}).
 */
export const taskTagSchema = z.object({
  /** Row id; `0` for unpersisted drafts. */
  id: z.number().int().nonnegative(),
  /** Display name, 1–100 chars (normalized via {@link normalizeTagName}). */
  name: z.string().min(1).max(100),
  /** Palette color key for the UI (null = neutral). */
  color: z.string().max(40).nullable(),
  createdAt: z.string().min(1),
})

/** The parsed {@link taskTagSchema} shape. */
export type TaskTag = z.infer<typeof taskTagSchema>

/** Input for {@link createTag}. */
export const createTagInputSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(40).nullable().optional(),
})

/** The parsed {@link createTagInputSchema} shape. */
export type CreateTagInput = z.infer<typeof createTagInputSchema>

/** Input for {@link updateTag}. */
export const updateTagInputSchema = createTagInputSchema.partial()

/** The parsed {@link updateTagInputSchema} shape. */
export type UpdateTagInput = z.infer<typeof updateTagInputSchema>

// ── Virtual tags ────────────────────────────────────────────────────────────

/**
 * Virtual tags use negative ids so they can never collide with DB rows.
 * `TODAY_VIRTUAL_TAG_ID` renders tasks whose `due` is today (membership
 * math: S3-65 — due date only, exactly SP's Today rule).
 */
export const TODAY_VIRTUAL_TAG_ID = -1

/** Virtual tag for tasks without any tag (SP's "No tags" pseudo-tag). */
export const NO_TAGS_VIRTUAL_TAG_ID = -2

// ── Ops ─────────────────────────────────────────────────────────────────────

/**
 * Normalize a tag name the way SP does: trim, collapse inner whitespace,
 * case is PRESERVED (tags like "API" vs "api" stay distinct — SP is
 * case-sensitive here and dedup is enforced by the UNIQUE DB column, not
 * by folding case).
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 100)
}

/**
 * Create a tag from validated input (name normalized). Pure; `id: 0`
 * (repo assigns the row id).
 */
export function createTag(input: CreateTagInput, now: string): TaskTag {
  const name = normalizeTagName(z.string().min(1).max(100).parse(input.name))
  if (name.length === 0) {
    throw new RangeError('A tag needs a name.')
  }
  return { id: 0, name, color: input.color ?? null, createdAt: now }
}

/** Apply a validated patch immutably (name re-normalized). */
export function updateTag(tag: TaskTag, patch: UpdateTagInput): TaskTag {
  const name = patch.name !== undefined ? normalizeTagName(patch.name) : undefined
  if (name !== undefined && name.length === 0) {
    throw new RangeError('A tag needs a name.')
  }
  return {
    ...tag,
    name: name ?? tag.name,
    color: patch.color !== undefined ? patch.color : tag.color,
  }
}

// ── Filtering (SP OR / AND / no-tags) ───────────────────────────────────────

/** How multiple selected tags combine (SP: OR is default, AND is strict). */
export type TagFilterMode = 'or' | 'and'

/** A tag-filter selection: chosen ids, combine mode, optional "no tags". */
export interface TagFilter {
  /** Selected tag ids (may include virtual ids — see {@link virtualTagMembers}). */
  tagIds: number[]
  /** `'or'` = any match, `'and'` = every selected tag present (SP semantics). */
  mode: TagFilterMode
  /** Include SP's "No tags" pseudo-tag in the selection? */
  includeNoTags?: boolean
}

/**
 * Members of a virtual tag id, given the task list: Today is resolved by the
 * CALLER-provided `todayTaskIds` (S3-65 owns the due-only math — this keeps
 * this module free of clock reads), "no tags" is computed here.
 */
export function virtualTagMembers(
  tagId: number,
  tasks: TaskLike[],
  todayTaskIds: Set<number>,
): Set<number> {
  if (tagId === TODAY_VIRTUAL_TAG_ID) return new Set(todayTaskIds)
  if (tagId === NO_TAGS_VIRTUAL_TAG_ID) {
    return new Set(tasks.filter((t) => t.tagIds.length === 0).map((t) => t.id))
  }
  return new Set()
}

/** Structural subset of {@link TaskItem} the filters need (keeps tests light). */
export interface TaskLike {
  id: number
  tagIds: number[]
  isDone?: boolean
  wonthado?: boolean
}

/** True when a task matches ONE selected tag (real or virtual). */
function matchesTag(task: TaskLike, tagId: number, todayTaskIds: Set<number>): boolean {
  if (tagId === TODAY_VIRTUAL_TAG_ID) return todayTaskIds.has(task.id)
  if (tagId === NO_TAGS_VIRTUAL_TAG_ID) return task.tagIds.length === 0
  return task.tagIds.includes(tagId)
}

/**
 * Filter tasks by a tag selection (SP parity):
 *
 * - empty selection + no no-tags → everything passes (no filter active);
 * - `'or'` → tasks carrying AT LEAST ONE selected tag (or being Today /
 *   untagged when those virtual chips are selected);
 * - `'and'` → tasks carrying EVERY selected tag (virtual tags count as
 *   memberships, so Today + #work = due today AND tagged #work).
 *
 * Ordering of the input list is preserved. Open tasks only? — that is the
 * caller's concern (S3-65/S3-20 compose views); this filter is purely
 * tag-shaped.
 */
export function filterTasksByTags<T extends TaskLike>(
  tasks: T[],
  filter: TagFilter,
  todayTaskIds: Set<number> = new Set(),
): T[] {
  const { tagIds, mode, includeNoTags } = filter
  const ids =
    includeNoTags && !tagIds.includes(NO_TAGS_VIRTUAL_TAG_ID)
      ? [...tagIds, NO_TAGS_VIRTUAL_TAG_ID]
      : tagIds
  if (ids.length === 0) return [...tasks]

  return tasks.filter((task) => {
    if (mode === 'or') return ids.some((id) => matchesTag(task, id, todayTaskIds))
    return ids.every((id) => matchesTag(task, id, todayTaskIds))
  })
}

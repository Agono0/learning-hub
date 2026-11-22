/**
 * Tasks — markdown paste service (S3-36): convert pasted markdown into task
 * drafts, and render tasks back out as a markdown checklist (SP's "paste a
 * list, get tasks" flow, S3-87 wires it end-to-end through the UI).
 *
 * Contract (deliberately boring, so round-trips are exact):
 * - Every non-empty, non-heading line becomes a task draft — checkbox items
 *   (`- [ ]` / `- [x]`, any bullet marker, ordered lists too) AND bare lines
 *   (pasting a plain column of items is the common shape).
 * - Headings (`# …`) are document structure, not work — skipped.
 * - Fenced blocks (``` / ~~~) are content, not work — skipped whole.
 * - Indentation (2 spaces or 1 tab per level) nests a line under the nearest
 *   shallower task. The task model allows exactly ONE nesting level (S3-04),
 *   so deeper levels FLATTEN to level 2 (they keep their own checkbox state).
 * - `done` comes only from a checked checkbox — a bare `- [x]`-less line is
 *   open work, and the UI creates open tasks (a paste never silently checks
 *   work off).
 * - Totals are capped (200 lines, 500-char titles — the task schema's own
 *   cap) so pasting a novel cannot wedge the UI.
 *
 * Pure module: no I/O, no clock — the caller owns task creation.
 */
import { z } from 'zod'

/** One draft task parsed out of markdown. */
export const markdownTaskDraftSchema = z.object({
  /** 1–500 chars, trimmed — safe for `createTaskInputSchema`. */
  title: z.string().min(1).max(500),
  /** Checked checkbox (`[x]`); unchecked/absent → false. */
  isDone: z.boolean(),
  /** One nesting level (S3-04); deeper markdown levels flatten here. */
  subtasks: z.array(z.object({ title: z.string().min(1).max(500), isDone: z.boolean() })).max(200),
})
export type MarkdownTaskDraft = z.infer<typeof markdownTaskDraftSchema>

/** Maximum task drafts one paste can produce. */
export const MAX_PASTE_TASKS = 200

/** The task title cap (`createTaskInputSchema` shares it). */
const TITLE_MAX = 500

/** Checklist / bullet marker at line start: `- [x] `, `* `, `1) `, `+ [ ] `. */
const MARKER_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/
/** Headings are document structure — never tasks. */
const HEADING_RE = /^\s*#{1,6}\s/

/**
 * Parse pasted markdown into task drafts (S3-36). Total: junk in → `[]`
 * out, never throws; the caps keep a hostile paste bounded.
 *
 * Nesting: a stack of open frames keyed by indent width. Each frame knows
 * its DEPTH (1 = top-level draft, 2 = subtask) and the array deeper lines
 * attach to — a line deeper than a level-2 frame becomes its SIBLING
 * (flattened into the same level-2 array), because the task model allows
 * exactly one nesting level (S3-04).
 */
export function markdownToTaskDrafts(markdown: string): MarkdownTaskDraft[] {
  const lines = String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')

  const drafts: MarkdownTaskDraft[] = []
  interface Frame {
    indent: number
    depth: 1 | 2
    /** Where children attach: level-1 frames own their draft's subtasks. */
    children: Array<{ title: string; isDone: boolean }> | null
  }
  const stack: Frame[] = []
  let inFence = false
  let fenceMarker = '```'

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ')

    // Fenced blocks toggle on ``` or ~~~ (lenient about indentation).
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceMarker = fence[1]
      } else if (fence[1] === fenceMarker) {
        inFence = false
      }
      continue
    }
    if (inFence) continue

    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (HEADING_RE.test(line)) continue

    const indent = line.length - line.trimStart().length
    const marker = MARKER_RE.exec(line)
    const isDone = marker !== null && marker[2] !== undefined && marker[2].toLowerCase() === 'x'
    const title = (marker !== null ? marker[3] : trimmed).trim().slice(0, TITLE_MAX)
    if (title.length === 0) continue
    if (drafts.length >= MAX_PASTE_TASKS) break

    // Pop frames at >= this indent; the remaining top is the parent.
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack.length > 0 ? stack[stack.length - 1] : undefined

    if (parent === undefined) {
      const draft: MarkdownTaskDraft = { title, isDone, subtasks: [] }
      drafts.push(draft)
      stack.push({ indent, depth: 1, children: draft.subtasks })
    } else if (parent.depth === 1 && parent.children !== null && parent.children.length < 200) {
      parent.children.push({ title, isDone })
      stack.push({ indent, depth: 2, children: parent.children })
    } else {
      // Deeper than a subtask (flatten: sibling at level 2), or the
      // parent's subtask cap hit — attach to the nearest level-1 draft.
      const level1 = [...stack].reverse().find((f) => f.depth === 1)
      if (level1 !== undefined && level1.children !== null && level1.children.length < 200) {
        level1.children.push({ title, isDone })
        stack.push({ indent, depth: 2, children: level1.children })
      } else {
        const draft: MarkdownTaskDraft = { title, isDone, subtasks: [] }
        drafts.push(draft)
        stack.push({ indent, depth: 1, children: draft.subtasks })
      }
    }
  }

  return drafts
}

/** A minimal task shape the markdown renderer accepts. */
export interface MarkdownTaskLike {
  title: string
  isDone?: boolean
  subtasks?: ReadonlyArray<{ title: string; isDone?: boolean }>
}

/**
 * Render tasks as a markdown checklist (the inverse of
 * {@link markdownToTaskDrafts}): `- [ ] title` with two-space-indented
 * subtasks. Round-trip guaranteed: parse(render(tasks)) keeps titles, done
 * state and the one nesting level.
 */
export function tasksToMarkdown(tasks: ReadonlyArray<MarkdownTaskLike>): string {
  const out: string[] = []
  for (const task of tasks) {
    const title = String(task.title ?? '')
      .trim()
      .slice(0, TITLE_MAX)
    if (title.length === 0) continue
    out.push(task.isDone === true ? `- [x] ${title}` : `- [ ] ${title}`)
    for (const sub of task.subtasks ?? []) {
      const subTitle = String(sub.title ?? '')
        .trim()
        .slice(0, TITLE_MAX)
      if (subTitle.length === 0) continue
      out.push(sub.isDone === true ? `  - [x] ${subTitle}` : `  - [ ] ${subTitle}`)
    }
  }
  return out.join('\n')
}

/**
 * Decide whether pasted text should become multiple tasks (S3-36's UI gate):
 * multi-line text, or a single line starting with a list/checkbox marker.
 * A one-line plain sentence stays in the normal short-syntax input.
 */
export function isMarkdownPaste(text: string): boolean {
  const value = String(text ?? '')
  if (value.includes('\n')) return true
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(value)
}

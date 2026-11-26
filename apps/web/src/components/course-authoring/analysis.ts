/** Pure glue between the page and the authoring engine in core. */
import { parseCurriculum, type Issue, type LhcfCourse } from '@learning-hub/core/curriculum'
import {
  analyzeCourse,
  applyResolutions,
  buildPacket,
  diffCourses,
  mergeCourses,
  previewRefactor,
  reportToMarkdown,
  type Choice,
  type CourseDiff,
  type CourseReport,
  type MergeResult,
  type PacketResult,
  type RefactorOp,
  type RefactorPreview,
  type ResolveResult,
} from '@learning-hub/core/curriculum/authoring'

export type Loaded =
  | { ok: true; course: LhcfCourse; warnings: Issue[] }
  | { ok: false; errors: Issue[]; empty: boolean }

/** Parse the text of a course. Empty text is not an error, it just means "nothing yet". */
export function loadCourse(source: string): Loaded {
  if (source.trim() === '') return { ok: false, errors: [], empty: true }
  const r = parseCurriculum(source)
  if (!r.ok) return { ok: false, errors: r.errors, empty: false }
  return { ok: true, course: r.course, warnings: r.warnings }
}

export const courseToText = (course: LhcfCourse): string => JSON.stringify(course, null, 2)

export function reviewCourse(course: LhcfCourse, ignored: readonly string[]): CourseReport {
  return analyzeCourse(course, { ignore: ignored })
}

export function reviewMarkdown(course: LhcfCourse, ignored: readonly string[]): string {
  return reportToMarkdown(reviewCourse(course, ignored), `${course.title}: course review`)
}

// ─── refactor forms ────────────────────────────────────────────────────────

export type FieldKind = 'slug' | 'text' | 'number' | 'list' | 'check'
export interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
  hint?: string
  optional?: boolean
}
export interface RefactorKind {
  type: RefactorOp['type']
  label: string
  help: string
  fields: FieldSpec[]
}

export const REFACTOR_KINDS: RefactorKind[] = [
  {
    type: 'rename-skill',
    label: 'Rename a skill',
    help: 'Updates every lesson, project, prerequisite and exercise that names it.',
    fields: [
      { key: 'from', label: 'Current skill slug', kind: 'slug' },
      { key: 'to', label: 'New skill slug', kind: 'slug' },
      { key: 'name', label: 'New display name', kind: 'text', optional: true },
    ],
  },
  {
    type: 'rename-lesson',
    label: 'Rename a lesson slug',
    help: 'Learner progress is keyed by slug, so published courses lose progress on re-import.',
    fields: [
      { key: 'from', label: 'Current lesson slug', kind: 'slug' },
      { key: 'to', label: 'New lesson slug', kind: 'slug' },
    ],
  },
  {
    type: 'rename-module',
    label: 'Rename a module slug',
    help: 'Only the module id changes.',
    fields: [
      { key: 'from', label: 'Current module slug', kind: 'slug' },
      { key: 'to', label: 'New module slug', kind: 'slug' },
    ],
  },
  {
    type: 'move-lesson',
    label: 'Move a lesson',
    help: 'A module must keep at least one lesson.',
    fields: [
      { key: 'slug', label: 'Lesson slug', kind: 'slug' },
      { key: 'toModule', label: 'Target module slug', kind: 'slug' },
      { key: 'index', label: 'Position (0 = first)', kind: 'number', optional: true },
    ],
  },
  {
    type: 'reorder-lessons',
    label: 'Reorder lessons in a module',
    help: 'List every lesson slug once, in the new order.',
    fields: [
      { key: 'module', label: 'Module slug', kind: 'slug' },
      { key: 'order', label: 'Lesson slugs in order', kind: 'list' },
    ],
  },
  {
    type: 'reorder-modules',
    label: 'Reorder modules',
    help: 'List every module slug once, in the new order.',
    fields: [{ key: 'order', label: 'Module slugs in order', kind: 'list' }],
  },
  {
    type: 'split-lesson',
    label: 'Split a lesson',
    help: 'Theory sections and exercises from the split points on move to a new lesson.',
    fields: [
      { key: 'slug', label: 'Lesson slug', kind: 'slug' },
      { key: 'newSlug', label: 'New lesson slug', kind: 'slug' },
      { key: 'newTitle', label: 'New lesson title', kind: 'text' },
      { key: 'newObjective', label: 'New lesson objective', kind: 'text' },
      { key: 'theoryFrom', label: 'First theory section to move (0 = first)', kind: 'number' },
      { key: 'exercisesFrom', label: 'First exercise to move (0 = first)', kind: 'number' },
    ],
  },
  {
    type: 'merge-lessons',
    label: 'Merge two lessons',
    help: 'The second lesson is folded into the first. Its objective is dropped.',
    fields: [
      { key: 'keep', label: 'Lesson to keep', kind: 'slug' },
      { key: 'absorb', label: 'Lesson to fold in', kind: 'slug' },
    ],
  },
  {
    type: 'move-exercise',
    label: 'Move an exercise',
    help: 'Numbers start at 0 (the first exercise is 0).',
    fields: [
      { key: 'fromLesson', label: 'From lesson slug', kind: 'slug' },
      { key: 'index', label: 'Exercise number', kind: 'number' },
      { key: 'toLesson', label: 'To lesson slug', kind: 'slug' },
      { key: 'toIndex', label: 'Position in target', kind: 'number', optional: true },
    ],
  },
  {
    type: 'stamp-exercise-ids',
    label: 'Give exercises ids',
    help: 'Ids make diff and merge match exercises exactly. Existing ids stay.',
    fields: [{ key: 'lesson', label: 'Only this lesson slug', kind: 'slug', optional: true }],
  },
  {
    type: 'remove-skill',
    label: 'Remove a skill',
    help: 'Refuses while something still uses the skill, unless you tick detach.',
    fields: [
      { key: 'slug', label: 'Skill slug', kind: 'slug' },
      {
        key: 'detach',
        label: 'Detach it from lessons, projects and prerequisites',
        kind: 'check',
        optional: true,
      },
    ],
  },
]

export type FormValues = Record<string, string | boolean | undefined>

/** Turn form values into an operation, or say what is missing. */
export function opFromForm(
  type: RefactorOp['type'],
  values: FormValues,
): { ok: true; op: RefactorOp } | { ok: false; error: string } {
  const kind = REFACTOR_KINDS.find((k) => k.type === type)
  if (!kind) return { ok: false, error: 'Pick an operation.' }
  const out: Record<string, unknown> = { type }
  for (const f of kind.fields) {
    const raw = values[f.key]
    const empty = raw === undefined || raw === '' || raw === false
    if (empty) {
      if (f.kind === 'check') continue
      if (f.optional) continue
      return { ok: false, error: `Fill in: ${f.label}.` }
    }
    if (f.kind === 'number') {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 0)
        return { ok: false, error: `${f.label} must be a whole number, 0 or more.` }
      out[f.key] = n
    } else if (f.kind === 'list') {
      out[f.key] = String(raw)
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (f.kind === 'check') out[f.key] = raw === true
    else out[f.key] = String(raw).trim()
  }
  return { ok: true, op: out as unknown as RefactorOp }
}

export function runPreview(course: LhcfCourse, op: RefactorOp): RefactorPreview {
  return previewRefactor(course, op)
}

// ─── compare and merge ─────────────────────────────────────────────────────

export type CompareLoaded =
  | { ok: true; diff: CourseDiff; ours: LhcfCourse; theirs: LhcfCourse }
  | { ok: false; error: string }

export function compareSources(oursText: string, theirsText: string): CompareLoaded {
  const a = loadCourse(oursText)
  const b = loadCourse(theirsText)
  if (!a.ok)
    return {
      ok: false,
      error: a.empty
        ? 'Load your course first.'
        : 'Your course has errors. Fix them in the review tab.',
    }
  if (!b.ok)
    return {
      ok: false,
      error: b.empty
        ? 'Paste the other version.'
        : `The other version could not be read: ${b.errors[0]?.message ?? 'unknown problem'}`,
    }
  return { ok: true, diff: diffCourses(a.course, b.course), ours: a.course, theirs: b.course }
}

export type MergeLoaded = { ok: true; result: MergeResult } | { ok: false; error: string }

export function mergeSources(baseText: string, oursText: string, theirsText: string): MergeLoaded {
  const names = ['The base version', 'Your course', 'The other version'] as const
  const loaded = [baseText, oursText, theirsText].map(loadCourse)
  for (let i = 0; i < loaded.length; i++) {
    const l = loaded[i]!
    if (!l.ok)
      return {
        ok: false,
        error: l.empty
          ? `${names[i]} is empty.`
          : `${names[i]} could not be read: ${l.errors[0]?.message ?? 'unknown problem'}`,
      }
  }
  const [b, o, t] = loaded as { ok: true; course: LhcfCourse }[]
  return { ok: true, result: mergeCourses(b!.course, o!.course, t!.course) }
}

export function resolveMerge(result: MergeResult, choices: Record<string, Choice>): ResolveResult {
  return applyResolutions(result, choices)
}

// ─── export ────────────────────────────────────────────────────────────────

export function makePacket(course: LhcfCourse, includeAnswers: boolean): PacketResult {
  return buildPacket(course, {
    includeAnswers,
    footer: 'Exported from Learning HUB. Offline copy; no scripts or network.',
  })
}

export const formatBytes = (n: number): string =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`

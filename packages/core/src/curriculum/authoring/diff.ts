/**
 * Structural course diff.
 *
 * Compares two validated LHCF courses by identity (slugs, exercise ids) rather
 * than by text position, so moving a lesson or reordering exercises reads as
 * "moved" or "reordered" instead of a pile of removals and additions.
 *
 * Exercises without an `id` are matched by content, then by similarity (0.6+,
 * same type). That second step is a guess; such matches are reported as
 * `changed` with `detail: 'matched by similarity'` so a human can check them.
 */
import type { Exercise } from '../../practice/schema'
import type { LhcfCourse, LhcfLesson, LhcfModule } from '../lhcf/schema'
import { deepEqual, exerciseKeys, isPlainObject, keyedSegment, matchExercises } from './keyed'
import { clip } from './types'

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved' | 'reordered'
export type EntityKind = 'course' | 'skill' | 'module' | 'lesson' | 'project' | 'stage' | 'exercise' | 'exam'

export interface Change {
  kind: ChangeKind
  entity: EntityKind
  /** Slug, exercise key or similar identity of the thing that changed. */
  key: string
  /** Keyed path in the NEW document (or the old one for removals). */
  path: string
  /** Human label, e.g. the lesson title. */
  label: string
  /** For `changed`: dotted field path below the entity. */
  field?: string
  before?: unknown
  after?: unknown
  /** Extra context, e.g. `from module a to module b`. */
  detail?: string
}

export interface CourseDiff {
  changes: Change[]
  counts: Record<ChangeKind, number>
  byEntity: Partial<Record<EntityKind, number>>
  identical: boolean
}

const COURSE_SKIP = new Set(['modules', 'skills', 'projects', 'finalExam'])

interface FieldChange {
  field: string
  before: unknown
  after: unknown
}

/** Leaf-level changes between two JSON values. Arrays of objects compare by index. */
export function fieldChanges(
  before: unknown,
  after: unknown,
  prefix = '',
  skip: ReadonlySet<string> = new Set(),
): FieldChange[] {
  if (deepEqual(before, after)) return []
  if (isPlainObject(before) && isPlainObject(after)) {
    const out: FieldChange[] = []
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const k of [...keys].sort()) {
      if (!prefix && skip.has(k)) continue
      out.push(...fieldChanges(before[k], after[k], prefix ? `${prefix}.${k}` : k, skip))
    }
    return out
  }
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.some(isPlainObject) &&
    after.some(isPlainObject)
  ) {
    const out: FieldChange[] = []
    const n = Math.max(before.length, after.length)
    for (let i = 0; i < n; i++) out.push(...fieldChanges(before[i], after[i], `${prefix}[${i}]`, skip))
    return out
  }
  return [{ field: prefix, before, after }]
}

/** Common keys' order in `a` versus `b`; true when the shared items sit in a different order. */
export function sharedOrderDiffers(a: readonly string[], b: readonly string[]): boolean {
  const inB = new Set(b)
  const inA = new Set(a)
  const sa = a.filter((k) => inB.has(k))
  const sb = b.filter((k) => inA.has(k))
  return sa.some((k, i) => k !== sb[i])
}

function pushFields(
  out: Change[],
  entity: EntityKind,
  key: string,
  path: string,
  label: string,
  before: unknown,
  after: unknown,
  skip: ReadonlySet<string>,
  detail?: string,
): void {
  for (const f of fieldChanges(before, after, '', skip))
    out.push({ kind: 'changed', entity, key, path, label, field: f.field, before: f.before, after: f.after, detail })
}

function lessonLocations(course: LhcfCourse): Map<string, { module: LhcfModule; lesson: LhcfLesson }> {
  const m = new Map<string, { module: LhcfModule; lesson: LhcfLesson }>()
  for (const module of course.modules) for (const lesson of module.lessons) if (!m.has(lesson.slug)) m.set(lesson.slug, { module, lesson })
  return m
}

const lessonPath = (moduleSlug: string, lessonSlug: string) =>
  `modules${keyedSegment('slug', moduleSlug)}.lessons${keyedSegment('slug', lessonSlug)}`

function diffExercises(
  out: Change[],
  base: readonly Exercise[],
  next: readonly Exercise[],
  parentPath: string,
  parentLabel: string,
): void {
  const baseKeys = exerciseKeys(base)
  const match = matchExercises(base, next)
  const nextKeys = match.keys
  const baseSet = new Set(baseKeys)
  const nextSet = new Set(nextKeys)
  next.forEach((e, i) => {
    const key = nextKeys[i]!
    const path = `${parentPath}.exercises[${i}]`
    const label = `${parentLabel}: ${clip(e.prompt, 50)}`
    if (!baseSet.has(key)) {
      out.push({ kind: 'added', entity: 'exercise', key, path, label, after: e })
      return
    }
    const old = base[baseKeys.indexOf(key)]!
    const detail = match.edited.has(i) ? 'matched by similarity' : undefined
    if (!deepEqual(old, e)) pushFields(out, 'exercise', key, path, label, old, e, new Set(), detail)
  })
  baseKeys.forEach((key, i) => {
    if (nextSet.has(key)) return
    out.push({
      kind: 'removed',
      entity: 'exercise',
      key,
      path: `${parentPath}.exercises[${i}]`,
      label: `${parentLabel}: ${clip(base[i]!.prompt, 50)}`,
      before: base[i],
    })
  })
  if (sharedOrderDiffers(baseKeys, nextKeys))
    out.push({
      kind: 'reordered',
      entity: 'exercise',
      key: parentPath,
      path: `${parentPath}.exercises`,
      label: parentLabel,
      before: baseKeys.filter((k) => nextSet.has(k)),
      after: nextKeys.filter((k) => baseSet.has(k)),
    })
}

/** Diff two courses. `a` is the older version, `b` the newer. */
export function diffCourses(a: LhcfCourse, b: LhcfCourse): CourseDiff {
  const out: Change[] = []
  pushFields(out, 'course', b.slug, '', b.title, a, b, COURSE_SKIP)

  // skills
  const aSkills = new Map(a.skills.map((s) => [s.slug, s]))
  const bSkills = new Map(b.skills.map((s) => [s.slug, s]))
  for (const [slug, s] of bSkills) {
    const path = `skills${keyedSegment('slug', slug)}`
    const old = aSkills.get(slug)
    if (!old) out.push({ kind: 'added', entity: 'skill', key: slug, path, label: s.name, after: s })
    else pushFields(out, 'skill', slug, path, s.name, old, s, new Set())
  }
  for (const [slug, s] of aSkills)
    if (!bSkills.has(slug)) out.push({ kind: 'removed', entity: 'skill', key: slug, path: `skills${keyedSegment('slug', slug)}`, label: s.name, before: s })
  if (sharedOrderDiffers([...aSkills.keys()], [...bSkills.keys()]))
    out.push({ kind: 'reordered', entity: 'skill', key: 'skills', path: 'skills', label: 'Skills', before: [...aSkills.keys()], after: [...bSkills.keys()] })

  // modules and lessons
  const aMods = new Map(a.modules.map((m) => [m.slug, m]))
  const bMods = new Map(b.modules.map((m) => [m.slug, m]))
  const aLoc = lessonLocations(a)
  const bLoc = lessonLocations(b)
  for (const [slug, m] of bMods) {
    const path = `modules${keyedSegment('slug', slug)}`
    const old = aMods.get(slug)
    if (!old) out.push({ kind: 'added', entity: 'module', key: slug, path, label: m.title, after: { slug, title: m.title, lessons: m.lessons.map((l) => l.slug) } })
    else {
      pushFields(out, 'module', slug, path, m.title, old, m, new Set(['lessons']))
      if (sharedOrderDiffers(old.lessons.map((l) => l.slug), m.lessons.map((l) => l.slug)))
        out.push({ kind: 'reordered', entity: 'lesson', key: slug, path: `${path}.lessons`, label: m.title, before: old.lessons.map((l) => l.slug), after: m.lessons.map((l) => l.slug) })
    }
  }
  for (const [slug, m] of aMods)
    if (!bMods.has(slug)) out.push({ kind: 'removed', entity: 'module', key: slug, path: `modules${keyedSegment('slug', slug)}`, label: m.title, before: { slug, title: m.title, lessons: m.lessons.map((l) => l.slug) } })
  if (sharedOrderDiffers([...aMods.keys()], [...bMods.keys()]))
    out.push({ kind: 'reordered', entity: 'module', key: 'modules', path: 'modules', label: 'Modules', before: [...aMods.keys()], after: [...bMods.keys()] })

  for (const [slug, nb] of bLoc) {
    const path = lessonPath(nb.module.slug, slug)
    const old = aLoc.get(slug)
    if (!old) {
      out.push({ kind: 'added', entity: 'lesson', key: slug, path, label: nb.lesson.title, after: nb.lesson })
      continue
    }
    if (old.module.slug !== nb.module.slug)
      out.push({ kind: 'moved', entity: 'lesson', key: slug, path, label: nb.lesson.title, before: old.module.slug, after: nb.module.slug, detail: `module ${old.module.slug} → ${nb.module.slug}` })
    pushFields(out, 'lesson', slug, path, nb.lesson.title, old.lesson, nb.lesson, new Set(['exercises']))
    diffExercises(out, old.lesson.exercises, nb.lesson.exercises, path, nb.lesson.title)
  }
  for (const [slug, old] of aLoc)
    if (!bLoc.has(slug)) out.push({ kind: 'removed', entity: 'lesson', key: slug, path: lessonPath(old.module.slug, slug), label: old.lesson.title, before: old.lesson })

  // projects and stages
  const aProj = new Map(a.projects.map((p) => [p.slug, p]))
  const bProj = new Map(b.projects.map((p) => [p.slug, p]))
  for (const [slug, p] of bProj) {
    const path = `projects${keyedSegment('slug', slug)}`
    const old = aProj.get(slug)
    if (!old) {
      out.push({ kind: 'added', entity: 'project', key: slug, path, label: p.title, after: p })
      continue
    }
    pushFields(out, 'project', slug, path, p.title, old, p, new Set(['stages']))
    const aSt = new Map(old.stages.map((s) => [s.slug, s]))
    const bSt = new Map(p.stages.map((s) => [s.slug, s]))
    for (const [ss, st] of bSt) {
      const sp = `${path}.stages${keyedSegment('slug', ss)}`
      const o = aSt.get(ss)
      if (!o) out.push({ kind: 'added', entity: 'stage', key: ss, path: sp, label: st.title, after: st })
      else pushFields(out, 'stage', ss, sp, st.title, o, st, new Set())
    }
    for (const [ss, st] of aSt)
      if (!bSt.has(ss)) out.push({ kind: 'removed', entity: 'stage', key: ss, path: `${path}.stages${keyedSegment('slug', ss)}`, label: st.title, before: st })
    if (sharedOrderDiffers([...aSt.keys()], [...bSt.keys()]))
      out.push({ kind: 'reordered', entity: 'stage', key: slug, path: `${path}.stages`, label: p.title, before: [...aSt.keys()], after: [...bSt.keys()] })
  }
  for (const [slug, p] of aProj)
    if (!bProj.has(slug)) out.push({ kind: 'removed', entity: 'project', key: slug, path: `projects${keyedSegment('slug', slug)}`, label: p.title, before: p })

  // final exam
  if (a.finalExam && b.finalExam) {
    pushFields(out, 'exam', 'finalExam', 'finalExam', 'Final exam', a.finalExam, b.finalExam, new Set(['exercises']))
    diffExercises(out, a.finalExam.exercises, b.finalExam.exercises, 'finalExam', 'Final exam')
  } else if (b.finalExam) out.push({ kind: 'added', entity: 'exam', key: 'finalExam', path: 'finalExam', label: 'Final exam', after: b.finalExam })
  else if (a.finalExam) out.push({ kind: 'removed', entity: 'exam', key: 'finalExam', path: 'finalExam', label: 'Final exam', before: a.finalExam })

  return summarizeDiff(out)
}

/** Wrap a change list with counts. */
export function summarizeDiff(changes: Change[]): CourseDiff {
  const counts: Record<ChangeKind, number> = { added: 0, removed: 0, changed: 0, moved: 0, reordered: 0 }
  const byEntity: Partial<Record<EntityKind, number>> = {}
  for (const c of changes) {
    counts[c.kind] += 1
    byEntity[c.entity] = (byEntity[c.entity] ?? 0) + 1
  }
  return { changes, counts, byEntity, identical: changes.length === 0 }
}

function show(v: unknown): string {
  if (v === undefined) return '(unset)'
  if (typeof v === 'string') return `"${clip(v, 60)}"`
  if (typeof v === 'object' && v !== null) return clip(JSON.stringify(v), 60)
  return String(v)
}

/** One-line description of a change for lists and changelogs. */
export function describeChange(c: Change): string {
  const what = `${c.entity} "${c.label}"`
  switch (c.kind) {
    case 'added':
      return `Added ${what}`
    case 'removed':
      return `Removed ${what}`
    case 'moved':
      return `Moved ${what}${c.detail ? ` (${c.detail})` : ''}`
    case 'reordered':
      return `Reordered ${c.entity === 'exercise' ? 'exercises' : `${c.entity}s`} in "${c.label}"`
    default:
      return `Changed ${what} ${c.field ?? ''}: ${show(c.before)} → ${show(c.after)}${c.detail ? ` (${c.detail})` : ''}`.replace(/\s+:/, ':')
  }
}

/** Markdown changelog grouped by entity. */
export function diffToMarkdown(diff: CourseDiff, title = 'Course changes'): string {
  if (diff.identical) return `# ${title}\n\nNo changes.\n`
  const lines = [`# ${title}`, '']
  const c = diff.counts
  lines.push(`${c.added} added, ${c.removed} removed, ${c.changed} changed, ${c.moved} moved, ${c.reordered} reordered.`, '')
  const order: EntityKind[] = ['course', 'skill', 'module', 'lesson', 'exercise', 'project', 'stage', 'exam']
  for (const entity of order) {
    const items = diff.changes.filter((x) => x.entity === entity)
    if (items.length === 0) continue
    lines.push(`## ${entity[0]!.toUpperCase()}${entity.slice(1)}`, '')
    for (const it of items) lines.push(`- ${describeChange(it)}`)
    lines.push('')
  }
  return lines.join('\n')
}

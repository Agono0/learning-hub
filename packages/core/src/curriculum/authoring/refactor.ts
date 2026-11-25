/**
 * Safe course refactors: preview, explicit apply, revalidate.
 *
 * `previewRefactor` never changes its input. It returns the proposed course,
 * the structural diff against the current one, warnings and a `token`.
 * `applyRefactor` needs that token: it refuses when the course changed after
 * the preview or the operation differs, and it returns the new course only if
 * it still passes `validateLhcf`. Names are never merged silently: a rename
 * onto an existing slug is refused, and a split or merge lists what it moved.
 */
import type { Exercise } from '../../practice/schema'
import type { LhcfCourse, LhcfLesson } from '../lhcf/schema'
import { validateLhcf, type LhcfValidation } from '../lhcf/validate'
import { slugSchema } from '../lhcf/schema'
import { cloneCourse } from './course-index'
import { diffCourses, type CourseDiff } from './diff'
import { contentHash } from './keyed'

export type RefactorOp =
  | { type: 'rename-skill'; from: string; to: string; name?: string }
  | { type: 'rename-lesson'; from: string; to: string }
  | { type: 'rename-module'; from: string; to: string }
  | { type: 'move-lesson'; slug: string; toModule: string; index?: number }
  | { type: 'reorder-lessons'; module: string; order: string[] }
  | { type: 'reorder-modules'; order: string[] }
  | {
      type: 'split-lesson'
      slug: string
      newSlug: string
      newTitle: string
      newObjective: string
      /** Theory sections from this index on go to the new lesson. */
      theoryFrom: number
      /** Exercises from this index on go to the new lesson. */
      exercisesFrom: number
    }
  | { type: 'merge-lessons'; keep: string; absorb: string }
  | { type: 'move-exercise'; fromLesson: string; index: number; toLesson: string; toIndex?: number }
  | { type: 'stamp-exercise-ids'; lesson?: string }
  | { type: 'remove-skill'; slug: string; detach?: boolean }

export interface RefactorPreview {
  ok: boolean
  /** Why the operation cannot run. Empty when `ok`. */
  errors: string[]
  /** Things the author should know before applying (lost fields, unset minutes). */
  warnings: string[]
  /** Number of references rewritten (skills, requires, exercise skill names). */
  rewritten: number
  /** The proposed course; equal to the input when `ok` is false. */
  course: LhcfCourse
  diff: CourseDiff
  validation: LhcfValidation
  /** Pass to `applyRefactor`. Bound to this exact course and operation. */
  token: string
}

type Draft = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

interface Run {
  c: Draft
  errors: string[]
  warnings: string[]
  rewritten: number
}

const lessonsOf = (c: Draft): { lesson: Draft; module: Draft }[] =>
  (c.modules as Draft[]).flatMap((module) => (module.lessons as Draft[]).map((lesson) => ({ lesson, module })))

function findLesson(r: Run, slug: string): { lesson: Draft; module: Draft } | null {
  const hit = lessonsOf(r.c).find((x) => x.lesson.slug === slug)
  if (!hit) r.errors.push(`No lesson with slug "${slug}".`)
  return hit ?? null
}

function checkSlug(r: Run, slug: string, what: string): boolean {
  if (!slugSchema.safeParse(slug).success) {
    r.errors.push(`"${slug}" is not a valid ${what} slug (lowercase words joined by dashes).`)
    return false
  }
  return true
}

export function opToken(course: LhcfCourse, op: RefactorOp): string {
  return `${contentHash(course)}.${contentHash(op)}`
}

function replaceInList(list: unknown, from: string, to: string): { list: string[]; hits: number } {
  const arr = Array.isArray(list) ? (list as string[]) : []
  let hits = 0
  const out: string[] = []
  for (const x of arr) {
    const v = x === from ? to : x
    if (x === from) hits += 1
    if (!out.includes(v)) out.push(v)
  }
  return { list: out, hits }
}

function lessonExercises(l: Draft): Exercise[] {
  return l.exercises as Exercise[]
}

const ops: { [K in RefactorOp['type']]: (r: Run, op: Extract<RefactorOp, { type: K }>) => void } = {
  'rename-skill'(r, op) {
    if (!checkSlug(r, op.to, 'skill')) return
    const skills = r.c.skills as Draft[]
    const src = skills.find((s) => s.slug === op.from)
    if (!src) return void r.errors.push(`No skill "${op.from}".`)
    if (op.from !== op.to && skills.some((s) => s.slug === op.to))
      return void r.errors.push(`A skill "${op.to}" already exists; renaming would merge two skills.`)
    const oldName = String(src.name).toLowerCase()
    src.slug = op.to
    if (op.name) src.name = op.name
    for (const s of skills) {
      const x = replaceInList(s.requires, op.from, op.to)
      s.requires = x.list
      r.rewritten += x.hits
    }
    for (const { lesson } of lessonsOf(r.c)) {
      const x = replaceInList(lesson.skills, op.from, op.to)
      lesson.skills = x.list
      r.rewritten += x.hits
      for (const e of lessonExercises(lesson)) {
        if (e.skill && [op.from, oldName].includes(e.skill.trim().toLowerCase())) {
          e.skill = op.name ?? op.to
          r.rewritten += 1
        }
      }
    }
    for (const p of r.c.projects as Draft[]) {
      const x = replaceInList(p.skills, op.from, op.to)
      p.skills = x.list
      r.rewritten += x.hits
    }
    for (const e of (r.c.finalExam?.exercises ?? []) as Exercise[]) {
      if (e.skill && [op.from, oldName].includes(e.skill.trim().toLowerCase())) {
        e.skill = op.name ?? op.to
        r.rewritten += 1
      }
    }
  },
  'rename-lesson'(r, op) {
    if (!checkSlug(r, op.to, 'lesson')) return
    const hit = findLesson(r, op.from)
    if (!hit) return
    if (op.from !== op.to && lessonsOf(r.c).some((x) => x.lesson.slug === op.to))
      return void r.errors.push(`A lesson "${op.to}" already exists.`)
    hit.lesson.slug = op.to
    r.warnings.push('Learner progress is stored by lesson slug; renaming a published lesson resets its progress on re-import.')
  },
  'rename-module'(r, op) {
    if (!checkSlug(r, op.to, 'module')) return
    const mods = r.c.modules as Draft[]
    const m = mods.find((x) => x.slug === op.from)
    if (!m) return void r.errors.push(`No module "${op.from}".`)
    if (op.from !== op.to && mods.some((x) => x.slug === op.to)) return void r.errors.push(`A module "${op.to}" already exists.`)
    m.slug = op.to
  },
  'move-lesson'(r, op) {
    const hit = findLesson(r, op.slug)
    if (!hit) return
    const target = (r.c.modules as Draft[]).find((m) => m.slug === op.toModule)
    if (!target) return void r.errors.push(`No module "${op.toModule}".`)
    if (hit.module.slug === target.slug && op.index === undefined) return void r.errors.push('The lesson is already in that module.')
    if (hit.module.lessons.length === 1 && hit.module !== target)
      return void r.errors.push(`"${hit.module.slug}" would be left with no lessons; a module needs at least one.`)
    const from = hit.module.lessons as Draft[]
    from.splice(from.indexOf(hit.lesson), 1)
    const to = target.lessons as Draft[]
    const at = op.index === undefined ? to.length : Math.max(0, Math.min(op.index, to.length))
    to.splice(at, 0, hit.lesson)
  },
  'reorder-lessons'(r, op) {
    const m = (r.c.modules as Draft[]).find((x) => x.slug === op.module)
    if (!m) return void r.errors.push(`No module "${op.module}".`)
    const have = (m.lessons as Draft[]).map((l) => l.slug as string)
    if (op.order.length !== have.length || [...op.order].sort().join() !== [...have].sort().join() || new Set(op.order).size !== op.order.length)
      return void r.errors.push(`The new order must list exactly these lessons once each: ${have.join(', ')}.`)
    const by = new Map((m.lessons as Draft[]).map((l) => [l.slug, l]))
    m.lessons = op.order.map((s) => by.get(s))
  },
  'reorder-modules'(r, op) {
    const have = (r.c.modules as Draft[]).map((m) => m.slug as string)
    if (op.order.length !== have.length || [...op.order].sort().join() !== [...have].sort().join() || new Set(op.order).size !== op.order.length)
      return void r.errors.push(`The new order must list exactly these modules once each: ${have.join(', ')}.`)
    const by = new Map((r.c.modules as Draft[]).map((m) => [m.slug, m]))
    r.c.modules = op.order.map((s) => by.get(s))
  },
  'split-lesson'(r, op) {
    if (!checkSlug(r, op.newSlug, 'lesson')) return
    const hit = findLesson(r, op.slug)
    if (!hit) return
    if (lessonsOf(r.c).some((x) => x.lesson.slug === op.newSlug)) return void r.errors.push(`A lesson "${op.newSlug}" already exists.`)
    const l = hit.lesson
    const theory = l.theory as Draft[]
    const exs = lessonExercises(l)
    if (!Number.isInteger(op.theoryFrom) || op.theoryFrom < 0 || op.theoryFrom > theory.length) return void r.errors.push(`theoryFrom must be between 0 and ${theory.length}.`)
    if (!Number.isInteger(op.exercisesFrom) || op.exercisesFrom < 0 || op.exercisesFrom > exs.length) return void r.errors.push(`exercisesFrom must be between 0 and ${exs.length}.`)
    if (!op.newTitle.trim() || !op.newObjective.trim()) return void r.errors.push('The new lesson needs a title and an objective.')
    const moveTheory = theory.splice(op.theoryFrom)
    const moveExercises = exs.splice(op.exercisesFrom)
    if (moveTheory.length + moveExercises.length === 0) {
      theory.push(...moveTheory)
      exs.push(...moveExercises)
      return void r.errors.push('Nothing would move to the new lesson. Pick a split point inside the lesson.')
    }
    if (theory.length + exs.length === 0) {
      theory.unshift(...moveTheory)
      exs.unshift(...moveExercises)
      return void r.errors.push('The original lesson would be left empty.')
    }
    const fresh: Draft = {
      slug: op.newSlug,
      title: op.newTitle,
      objective: op.newObjective,
      type: l.type,
      skills: [...(l.skills as string[])],
      theory: moveTheory,
      workedExamples: [],
      keyTerms: [],
      resources: [],
      exercises: moveExercises,
      reflection: [],
    }
    const mod = hit.module.lessons as Draft[]
    mod.splice(mod.indexOf(l) + 1, 0, fresh)
    if (l.estMinutes !== undefined) {
      r.warnings.push(`"${l.slug}" keeps its ${l.estMinutes} min estimate and the new lesson has none. Enter minutes for both.`)
    }
    if (l.workedExamples.length + l.keyTerms.length + l.reflection.length + l.resources.length > 0)
      r.warnings.push('Worked examples, key terms, resources and reflection prompts stay in the original lesson. Move them by hand if they belong to the new part.')
    r.warnings.push('Both lessons share the same skills. Adjust them if the parts train different skills.')
  },
  'merge-lessons'(r, op) {
    if (op.keep === op.absorb) return void r.errors.push('Pick two different lessons.')
    const a = findLesson(r, op.keep)
    const b = findLesson(r, op.absorb)
    if (!a || !b) return
    const keep = a.lesson
    const take = b.lesson
    keep.theory = [...keep.theory, ...take.theory]
    keep.workedExamples = [...keep.workedExamples, ...take.workedExamples]
    const terms = new Set((keep.keyTerms as Draft[]).map((t) => String(t.term).toLowerCase()))
    keep.keyTerms = [...keep.keyTerms, ...(take.keyTerms as Draft[]).filter((t) => !terms.has(String(t.term).toLowerCase()))]
    const urls = new Set((keep.resources as Draft[]).map((x) => x.url))
    keep.resources = [...keep.resources, ...(take.resources as Draft[]).filter((x) => !urls.has(x.url))]
    const ids = new Set(lessonExercises(keep).map((e) => e.id).filter(Boolean))
    for (const e of lessonExercises(take)) {
      if (e.id && ids.has(e.id)) {
        r.warnings.push(`Exercise id "${e.id}" clashed and was renamed to "${take.slug}-${e.id}".`)
        e.id = `${take.slug}-${e.id}`
      }
      if (e.id) ids.add(e.id)
    }
    keep.exercises = [...keep.exercises, ...take.exercises]
    keep.reflection = [...keep.reflection, ...take.reflection].slice(0, 10)
    keep.skills = [...new Set([...(keep.skills as string[]), ...(take.skills as string[])])]
    if (keep.estMinutes !== undefined && take.estMinutes !== undefined) keep.estMinutes = Math.min(600, keep.estMinutes + take.estMinutes)
    else if (take.estMinutes !== undefined && keep.estMinutes === undefined) r.warnings.push('Only the absorbed lesson had minutes; the merged lesson has none.')
    if (!keep.summary && take.summary) keep.summary = take.summary
    r.warnings.push(`The objective of "${take.slug}" ("${String(take.objective).slice(0, 60)}") is dropped; "${keep.slug}" keeps its own.`)
    if (lessonExercises(keep).length > 60) {
      r.errors.push('The merged lesson would have more than 60 exercises.')
      return
    }
    if (b.module.lessons.length === 1 && b.module !== a.module) return void r.errors.push(`Merging would leave module "${b.module.slug}" empty.`)
    const arr = b.module.lessons as Draft[]
    arr.splice(arr.indexOf(take), 1)
  },
  'move-exercise'(r, op) {
    const from = findLesson(r, op.fromLesson)
    const to = findLesson(r, op.toLesson)
    if (!from || !to) return
    const src = lessonExercises(from.lesson)
    if (!Number.isInteger(op.index) || op.index < 0 || op.index >= src.length) return void r.errors.push(`index must be between 0 and ${src.length - 1}.`)
    const dst = lessonExercises(to.lesson)
    const [e] = src.splice(op.index, 1)
    if (e!.id && dst.some((x) => x.id === e!.id)) {
      r.warnings.push(`Exercise id "${e!.id}" clashed in the target lesson and was cleared.`)
      delete e!.id
    }
    const at = op.toIndex === undefined ? dst.length : Math.max(0, Math.min(op.toIndex, dst.length))
    if (dst.length >= 60 && from.lesson !== to.lesson) return void r.errors.push('The target lesson already has 60 exercises.')
    dst.splice(at, 0, e!)
  },
  'stamp-exercise-ids'(r, op) {
    const targets = op.lesson ? lessonsOf(r.c).filter((x) => x.lesson.slug === op.lesson) : lessonsOf(r.c)
    if (targets.length === 0) return void r.errors.push(`No lesson "${op.lesson}".`)
    let stamped = 0
    for (const { lesson } of targets) {
      const used = new Set(lessonExercises(lesson).map((e) => e.id).filter(Boolean) as string[])
      let n = 1
      for (const e of lessonExercises(lesson)) {
        if (e.id) continue
        while (used.has(`e${n}`)) n += 1
        e.id = `e${n}`
        used.add(e.id)
        stamped += 1
      }
    }
    if (stamped === 0) r.warnings.push('Every exercise already has an id.')
    r.rewritten += stamped
  },
  'remove-skill'(r, op) {
    const skills = r.c.skills as Draft[]
    const idx = skills.findIndex((s) => s.slug === op.slug)
    if (idx < 0) return void r.errors.push(`No skill "${op.slug}".`)
    const refs: string[] = []
    for (const s of skills) if ((s.requires as string[]).includes(op.slug)) refs.push(`skill ${s.slug}`)
    for (const { lesson } of lessonsOf(r.c)) if ((lesson.skills as string[]).includes(op.slug)) refs.push(`lesson ${lesson.slug}`)
    for (const p of r.c.projects as Draft[]) if ((p.skills as string[]).includes(op.slug)) refs.push(`project ${p.slug}`)
    if (refs.length > 0 && !op.detach) return void r.errors.push(`Still used by ${refs.slice(0, 6).join(', ')}${refs.length > 6 ? ` and ${refs.length - 6} more` : ''}. Detach it first or set detach.`)
    skills.splice(idx, 1)
    const strip = (list: unknown) => (list as string[]).filter((x) => x !== op.slug)
    for (const s of skills) s.requires = strip(s.requires)
    for (const { lesson } of lessonsOf(r.c)) lesson.skills = strip(lesson.skills)
    for (const p of r.c.projects as Draft[]) p.skills = strip(p.skills)
    r.rewritten += refs.length
    if (refs.length) r.warnings.push(`Detached from ${refs.length} place(s): ${refs.slice(0, 6).join(', ')}.`)
  },
}

/** Compute a refactor without changing the input. */
export function previewRefactor(course: LhcfCourse, op: RefactorOp): RefactorPreview {
  const r: Run = { c: cloneCourse(course) as Draft, errors: [], warnings: [], rewritten: 0 }
  ;(ops[op.type] as (run: Run, o: RefactorOp) => void)(r, op)
  const token = opToken(course, op)
  if (r.errors.length > 0) {
    return { ok: false, errors: r.errors, warnings: r.warnings, rewritten: 0, course, diff: diffCourses(course, course), validation: validateLhcf(course), token }
  }
  const validation = validateLhcf(r.c)
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors.map((e) => `${e.path}: ${e.message}`),
      warnings: r.warnings,
      rewritten: 0,
      course,
      diff: diffCourses(course, course),
      validation,
      token,
    }
  }
  return {
    ok: true,
    errors: [],
    warnings: r.warnings,
    rewritten: r.rewritten,
    course: validation.course,
    diff: diffCourses(course, validation.course),
    validation,
    token,
  }
}

export type ApplyResult =
  | { ok: true; course: LhcfCourse; preview: RefactorPreview }
  | { ok: false; reason: 'stale-token' | 'invalid'; errors: string[] }

/** Apply a previewed refactor. Needs the token from the matching preview. */
export function applyRefactor(course: LhcfCourse, op: RefactorOp, token: string): ApplyResult {
  if (token !== opToken(course, op))
    return { ok: false, reason: 'stale-token', errors: ['The course or the operation changed since the preview. Preview again.'] }
  const preview = previewRefactor(course, op)
  if (!preview.ok) return { ok: false, reason: 'invalid', errors: preview.errors }
  return { ok: true, course: preview.course, preview }
}

/** Short human description of an operation, for buttons and logs. */
export function describeRefactor(op: RefactorOp): string {
  switch (op.type) {
    case 'rename-skill':
      return `Rename skill ${op.from} to ${op.to}`
    case 'rename-lesson':
      return `Rename lesson ${op.from} to ${op.to}`
    case 'rename-module':
      return `Rename module ${op.from} to ${op.to}`
    case 'move-lesson':
      return `Move lesson ${op.slug} to module ${op.toModule}`
    case 'reorder-lessons':
      return `Reorder lessons in ${op.module}`
    case 'reorder-modules':
      return 'Reorder modules'
    case 'split-lesson':
      return `Split ${op.slug} into ${op.slug} and ${op.newSlug}`
    case 'merge-lessons':
      return `Merge ${op.absorb} into ${op.keep}`
    case 'move-exercise':
      return `Move exercise ${op.index + 1} from ${op.fromLesson} to ${op.toLesson}`
    case 'stamp-exercise-ids':
      return op.lesson ? `Give exercises in ${op.lesson} ids` : 'Give every exercise an id'
    case 'remove-skill':
      return `Remove skill ${op.slug}`
  }
}


/**
 * Three-way course merge.
 *
 * `mergeCourses(base, ours, theirs)` combines two edited copies of one course.
 * It applies a change only when the two sides agree or only one side touched
 * the thing. Everything else is returned as a conflict with both values. The
 * merged document keeps OUR value at a conflict, so it is always complete, but
 * `status` stays `conflicts` until every conflict has an explicit choice in
 * `applyResolutions`. Nothing is resolved silently: same-field edits, a delete
 * against an edit, two adds with one key, a lesson moved to two places, and
 * two different reorders all surface.
 *
 * Exercises without `id` are matched across versions by content, then by
 * similarity. When both sides edit the same unnamed exercise, similarity may
 * pair them wrongly; set ids (see `stampExerciseIds`) to make matching exact.
 */
import type { Exercise } from '../../practice/schema'
import { lhcfCourseSchema, type LhcfCourse } from '../lhcf/schema'
import { validateLhcf, type LhcfValidation } from '../lhcf/validate'
import { cloneCourse } from './course-index'
import { sharedOrderDiffers } from './diff'
import {
  deepEqual,
  exerciseKeys,
  getAtPath,
  isPlainObject,
  keyedSegment,
  matchExercises,
  setAtPath,
} from './keyed'
import { clip } from './types'

export type ConflictKind = 'field' | 'add-add' | 'delete-modify' | 'move' | 'order'

export type Patch =
  | { op: 'set'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'order'; path: string; value: unknown[] }
  | { op: 'move-lesson'; slug: string; toModule: string }

export interface MergeConflict {
  id: string
  kind: ConflictKind
  /** Keyed path in the merged document. */
  path: string
  /** What the author sees, e.g. the lesson title. */
  label: string
  message: string
  base: unknown
  ours: unknown
  theirs: unknown
  /** Applied to the merged document when the author picks that side. */
  patches: { ours: Patch[]; theirs: Patch[] }
}

export interface MergeResult {
  /** Merged course input. Conflicts hold OUR value unless the default is noted on the conflict. */
  merged: Record<string, unknown>
  conflicts: MergeConflict[]
  status: 'clean' | 'conflicts'
  /** Number of independent changes from either side that merged without a conflict. */
  autoMerged: number
  /** Present when the clean result passes validation. */
  validation: LhcfValidation | null
  /** Internal: the merged document with temporary exercise keys, used to apply choices. */
  keyed: Record<string, unknown>
}

export type Choice = 'ours' | 'theirs'

interface Ctx {
  conflicts: MergeConflict[]
  auto: number
  n: number
}

const KEY = '__key'
const SET_FIELDS = new Set(['skills', 'tags', 'requires', 'outcomes', 'prerequisites'])

function conflict(
  ctx: Ctx,
  c: Omit<MergeConflict, 'id'>,
): void {
  ctx.n += 1
  ctx.conflicts.push({ id: `c${ctx.n}`, ...c })
}

const show = (v: unknown) => (typeof v === 'string' ? clip(v, 40) : clip(JSON.stringify(v) ?? 'unset', 40))

// ─── values ─────────────────────────────────────────────────────────────────

function mergeValue(
  ctx: Ctx,
  path: string,
  label: string,
  b: unknown,
  o: unknown,
  t: unknown,
  skip: ReadonlySet<string> = new Set(),
  top = true,
): unknown {
  if (deepEqual(o, t)) {
    if (!deepEqual(b, o)) ctx.auto += 1
    return o
  }
  if (deepEqual(b, o)) {
    ctx.auto += 1
    return t
  }
  if (deepEqual(b, t)) {
    ctx.auto += 1
    return o
  }
  if (isPlainObject(o) && isPlainObject(t)) {
    const bo = isPlainObject(b) ? b : {}
    const out: Record<string, unknown> = {}
    const keys = new Set([...Object.keys(o), ...Object.keys(t), ...Object.keys(bo)])
    for (const k of keys) {
      if (top && skip.has(k)) {
        out[k] = o[k] ?? t[k]
        continue
      }
      const sub = path ? `${path}.${k}` : k
      const merged = mergeValue(ctx, sub, label, bo[k], o[k], t[k], skip, false)
      if (merged !== undefined) out[k] = merged
    }
    return out
  }
  const lastKey = path.split('.').pop() ?? ''
  if (Array.isArray(o) && Array.isArray(t) && SET_FIELDS.has(lastKey) && [...o, ...t].every((x) => typeof x === 'string')) {
    const bs = new Set(Array.isArray(b) ? (b as string[]) : [])
    const os = new Set(o as string[])
    const ts = new Set(t as string[])
    const keep = (x: string) => (!bs.has(x) || (os.has(x) && ts.has(x)))
    const merged = [...(o as string[]).filter(keep), ...(t as string[]).filter((x) => !os.has(x) && keep(x))]
    ctx.auto += 1
    return merged
  }
  if (Array.isArray(o) && Array.isArray(t) && Array.isArray(b) && o.length === t.length && b.length === o.length) {
    const out: unknown[] = []
    for (let i = 0; i < o.length; i++) out.push(mergeValue(ctx, `${path}[${i}]`, label, b[i], o[i], t[i], skip, false))
    return out
  }
  conflict(ctx, {
    kind: 'field',
    path,
    label,
    message: `Both sides changed ${path || 'this value'}: ${show(o)} vs ${show(t)}.`,
    base: b,
    ours: o,
    theirs: t,
    patches: { ours: [], theirs: [{ op: 'set', path, value: t }] },
  })
  return o
}

// ─── ordering ───────────────────────────────────────────────────────────────

function mergeOrder(
  ctx: Ctx,
  path: string,
  label: string,
  b: readonly string[],
  o: readonly string[],
  t: readonly string[],
  final: ReadonlySet<string>,
  items: ReadonlyMap<string, unknown>,
): string[] {
  const oursChanged = sharedOrderDiffers(b, o)
  const theirsChanged = sharedOrderDiffers(b, t)
  const oFinal = o.filter((k) => final.has(k))
  const tFinal = t.filter((k) => final.has(k))
  const preferTheirs = theirsChanged && !oursChanged
  const primary = preferTheirs ? tFinal : oFinal
  const secondary = preferTheirs ? o : t
  const result = [...primary]
  const placed = new Set(result)
  for (const k of final) {
    if (placed.has(k)) continue
    // insert after its predecessor in the other list, else at the end
    const idx = secondary.indexOf(k)
    let at = result.length
    for (let j = idx - 1; j >= 0; j--) {
      const pos = result.indexOf(secondary[j]!)
      if (pos >= 0) {
        at = pos + 1
        break
      }
    }
    // keep this side's own additions ahead of the other side's at the same anchor
    const secondarySet = new Set(secondary)
    while (at < result.length && !secondarySet.has(result[at]!) && !b.includes(result[at]!)) at += 1
    result.splice(at, 0, k)
    placed.add(k)
  }
  if (oursChanged && theirsChanged) {
    const sharedO = oFinal.filter((k) => tFinal.includes(k))
    const sharedT = tFinal.filter((k) => oFinal.includes(k))
    if (sharedO.some((k, i) => k !== sharedT[i])) {
      const theirsOrder = (() => {
        const r = [...tFinal]
        for (const k of result) if (!r.includes(k)) r.push(k)
        return r
      })()
      conflict(ctx, {
        kind: 'order',
        path,
        label,
        message: `Both sides reordered ${path} differently.`,
        base: [...b],
        ours: oFinal,
        theirs: tFinal,
        patches: { ours: [], theirs: [{ op: 'order', path, value: theirsOrder.map((k) => items.get(k)) }] },
      })
    }
  } else if (oursChanged || theirsChanged) ctx.auto += 1
  return result
}

// ─── keyed lists ────────────────────────────────────────────────────────────

interface ListSpec {
  path: string
  label: string
  keyProp: string
  base: Record<string, unknown>[]
  ours: Record<string, unknown>[]
  theirs: Record<string, unknown>[]
  /** Merge two edited entities that exist on all three sides. */
  item: (key: string, path: string, b: Record<string, unknown>, o: Record<string, unknown>, t: Record<string, unknown>) => Record<string, unknown>
  itemLabel: (x: Record<string, unknown>) => string
  /** Skip the order step (when the caller decides placement itself). */
  noOrder?: boolean
}

const byKey = (list: Record<string, unknown>[], keyProp: string) =>
  new Map(list.map((x) => [String(x[keyProp]), x]))

function mergeList(ctx: Ctx, s: ListSpec): Record<string, unknown>[] {
  const bm = byKey(s.base, s.keyProp)
  const om = byKey(s.ours, s.keyProp)
  const tm = byKey(s.theirs, s.keyProp)
  const keys = new Set([...bm.keys(), ...om.keys(), ...tm.keys()])
  const result = new Map<string, Record<string, unknown>>()
  for (const k of keys) {
    const b = bm.get(k)
    const o = om.get(k)
    const t = tm.get(k)
    const path = `${s.path}${keyedSegment(s.keyProp, k)}`
    if (!b) {
      if (o && t) {
        if (deepEqual(o, t)) result.set(k, o)
        else {
          conflict(ctx, {
            kind: 'add-add',
            path,
            label: s.itemLabel(o),
            message: `Both sides added "${s.itemLabel(o)}" with different content.`,
            base: undefined,
            ours: o,
            theirs: t,
            patches: { ours: [], theirs: [{ op: 'set', path, value: t }] },
          })
          result.set(k, o)
        }
      } else if (o || t) {
        ctx.auto += 1
        result.set(k, (o ?? t)!)
      }
      continue
    }
    if (o && t) {
      result.set(k, s.item(k, path, b, o, t))
    } else if (o && !t) {
      if (deepEqual(b, o)) ctx.auto += 1
      else {
        conflict(ctx, {
          kind: 'delete-modify',
          path,
          label: s.itemLabel(o),
          message: `Theirs removed "${s.itemLabel(o)}" but ours edited it. Kept for now.`,
          base: b,
          ours: o,
          theirs: undefined,
          patches: { ours: [], theirs: [{ op: 'remove', path }] },
        })
        result.set(k, o)
      }
    } else if (t && !o) {
      if (deepEqual(b, t)) ctx.auto += 1
      else {
        conflict(ctx, {
          kind: 'delete-modify',
          path,
          label: s.itemLabel(t),
          message: `Ours removed "${s.itemLabel(t)}" but theirs edited it. Kept for now.`,
          base: b,
          ours: undefined,
          theirs: t,
          patches: { ours: [{ op: 'remove', path }], theirs: [] },
        })
        result.set(k, t)
      }
    } else ctx.auto += 0
  }
  if (s.noOrder) return [...result.values()]
  const order = mergeOrder(
    ctx,
    s.path,
    s.label,
    s.base.map((x) => String(x[s.keyProp])),
    s.ours.map((x) => String(x[s.keyProp])),
    s.theirs.map((x) => String(x[s.keyProp])),
    new Set(result.keys()),
    result,
  )
  return order.map((k) => result.get(k)!)
}

// ─── exercises ──────────────────────────────────────────────────────────────

function decorate(list: readonly Exercise[], keys: string[]): Record<string, unknown>[] {
  return list.map((e, i) => ({ ...(e as Record<string, unknown>), [KEY]: keys[i]! }))
}

function mergeExercises(
  ctx: Ctx,
  path: string,
  label: string,
  base: readonly Exercise[],
  ours: readonly Exercise[],
  theirs: readonly Exercise[],
): Record<string, unknown>[] {
  const bk = exerciseKeys(base)
  const ok = matchExercises(base, ours).keys
  const tk = matchExercises(base, theirs).keys
  return mergeList(ctx, {
    path: `${path}.exercises`,
    label,
    keyProp: KEY,
    base: decorate(base, bk),
    ours: decorate(ours, ok),
    theirs: decorate(theirs, tk),
    item: (key, p, b, o, t) => mergeValue(ctx, p, label, b, o, t) as Record<string, unknown>,
    itemLabel: (x) => clip(String(x.prompt ?? 'exercise'), 40),
  })
}

function undecorate<T>(value: T): T {
  if (Array.isArray(value)) return value.map(undecorate) as unknown as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (k !== KEY) out[k] = undecorate(v)
    return out as T
  }
  return value
}

// ─── course ─────────────────────────────────────────────────────────────────

const asList = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : [])

function mergeLesson(
  ctx: Ctx,
  path: string,
  b: Record<string, unknown>,
  o: Record<string, unknown>,
  t: Record<string, unknown>,
): Record<string, unknown> {
  const label = String(o.title ?? t.title ?? b.title ?? 'lesson')
  const merged = mergeValue(ctx, path, label, { ...b, exercises: undefined }, { ...o, exercises: undefined }, { ...t, exercises: undefined }) as Record<string, unknown>
  delete merged.exercises
  merged.exercises = mergeExercises(
    ctx,
    path,
    label,
    asList(b.exercises) as unknown as Exercise[],
    asList(o.exercises) as unknown as Exercise[],
    asList(t.exercises) as unknown as Exercise[],
  )
  return merged
}

interface Placed {
  lesson: Record<string, unknown>
  moduleSlug: string
}

function placements(course: Record<string, unknown>): Map<string, Placed> {
  const m = new Map<string, Placed>()
  for (const mod of asList(course.modules))
    for (const l of asList(mod.lessons)) m.set(String(l.slug), { lesson: l, moduleSlug: String(mod.slug) })
  return m
}

/** Merge three versions of a course. Inputs must be validated courses. */
export function mergeCourses(base: LhcfCourse, ours: LhcfCourse, theirs: LhcfCourse): MergeResult {
  const ctx: Ctx = { conflicts: [], auto: 0, n: 0 }
  const B = cloneCourse(base) as unknown as Record<string, unknown>
  const O = cloneCourse(ours) as unknown as Record<string, unknown>
  const T = cloneCourse(theirs) as unknown as Record<string, unknown>
  const collections = new Set(['modules', 'skills', 'projects', 'finalExam'])

  const merged = mergeValue(ctx, '', 'Course', B, O, T, collections) as Record<string, unknown>

  merged.skills = mergeList(ctx, {
    path: 'skills',
    label: 'Skills',
    keyProp: 'slug',
    base: asList(B.skills),
    ours: asList(O.skills),
    theirs: asList(T.skills),
    item: (_k, p, b, o, t) => mergeValue(ctx, p, String(o.name ?? ''), b, o, t) as Record<string, unknown>,
    itemLabel: (x) => String(x.name ?? x.slug),
  })

  // modules: meta only; lessons are merged globally and then placed
  const bP = placements(B)
  const oP = placements(O)
  const tP = placements(T)
  const mods = mergeList(ctx, {
    path: 'modules',
    label: 'Modules',
    keyProp: 'slug',
    base: asList(B.modules),
    ours: asList(O.modules),
    theirs: asList(T.modules),
    item: (_k, p, b, o, t) =>
      mergeValue(ctx, p, String(o.title ?? ''), { ...b, lessons: undefined }, { ...o, lessons: undefined }, { ...t, lessons: undefined }) as Record<string, unknown>,
    itemLabel: (x) => String(x.title ?? x.slug),
  })
  const moduleSlugs = new Set(mods.map((m) => String(m.slug)))

  const lessonKeys = new Set([...bP.keys(), ...oP.keys(), ...tP.keys()])
  const finalLessons = new Map<string, Record<string, unknown>>()
  const placeAt = new Map<string, string>()
  for (const slug of lessonKeys) {
    const b = bP.get(slug)
    const o = oP.get(slug)
    const t = tP.get(slug)
    const lp = (mod: string) => `modules${keyedSegment('slug', mod)}.lessons${keyedSegment('slug', slug)}`
    if (!b) {
      if (o && t) {
        if (deepEqual(o.lesson, t.lesson) && o.moduleSlug === t.moduleSlug) {
          finalLessons.set(slug, o.lesson)
          placeAt.set(slug, o.moduleSlug)
        } else {
          conflict(ctx, {
            kind: 'add-add',
            path: lp(o.moduleSlug),
            label: String(o.lesson.title ?? slug),
            message: `Both sides added a lesson "${slug}" with different content or placement.`,
            base: undefined,
            ours: o.lesson,
            theirs: t.lesson,
            patches: { ours: [], theirs: [{ op: 'set', path: lp(o.moduleSlug), value: t.lesson }] },
          })
          finalLessons.set(slug, o.lesson)
          placeAt.set(slug, o.moduleSlug)
        }
      } else {
        const x = (o ?? t)!
        ctx.auto += 1
        finalLessons.set(slug, x.lesson)
        placeAt.set(slug, x.moduleSlug)
      }
      continue
    }
    if (o && t) {
      const lesson = mergeLesson(ctx, lp(o.moduleSlug), b.lesson, o.lesson, t.lesson)
      finalLessons.set(slug, lesson)
      let place = o.moduleSlug
      if (o.moduleSlug !== t.moduleSlug) {
        if (o.moduleSlug === b.moduleSlug) {
          place = t.moduleSlug
          ctx.auto += 1
        } else if (t.moduleSlug === b.moduleSlug) ctx.auto += 1
        else
          conflict(ctx, {
            kind: 'move',
            path: lp(o.moduleSlug),
            label: String(lesson.title ?? slug),
            message: `Lesson "${slug}" was moved to different modules: ${o.moduleSlug} vs ${t.moduleSlug}.`,
            base: b.moduleSlug,
            ours: o.moduleSlug,
            theirs: t.moduleSlug,
            patches: { ours: [], theirs: [{ op: 'move-lesson', slug, toModule: t.moduleSlug }] },
          })
      }
      placeAt.set(slug, place)
    } else if (o && !t) {
      if (deepEqual(b.lesson, o.lesson) && b.moduleSlug === o.moduleSlug) ctx.auto += 1
      else {
        conflict(ctx, {
          kind: 'delete-modify',
          path: lp(o.moduleSlug),
          label: String(o.lesson.title ?? slug),
          message: `Theirs removed lesson "${slug}" but ours edited or moved it. Kept for now.`,
          base: b.lesson,
          ours: o.lesson,
          theirs: undefined,
          patches: { ours: [], theirs: [{ op: 'remove', path: lp(o.moduleSlug) }] },
        })
        finalLessons.set(slug, o.lesson)
        placeAt.set(slug, o.moduleSlug)
      }
    } else if (t && !o) {
      if (deepEqual(b.lesson, t.lesson) && b.moduleSlug === t.moduleSlug) ctx.auto += 1
      else {
        conflict(ctx, {
          kind: 'delete-modify',
          path: lp(t.moduleSlug),
          label: String(t.lesson.title ?? slug),
          message: `Ours removed lesson "${slug}" but theirs edited or moved it. Kept for now.`,
          base: b.lesson,
          ours: undefined,
          theirs: t.lesson,
          patches: { ours: [{ op: 'remove', path: lp(t.moduleSlug) }], theirs: [] },
        })
        finalLessons.set(slug, t.lesson)
        placeAt.set(slug, t.moduleSlug)
      }
    }
  }
  // a lesson whose module vanished needs a human decision
  const fallback = mods[0] ? String(mods[0].slug) : ''
  for (const [slug, mod] of [...placeAt]) {
    if (moduleSlugs.has(mod)) continue
    placeAt.set(slug, fallback)
    conflict(ctx, {
      kind: 'delete-modify',
      path: `modules${keyedSegment('slug', fallback)}.lessons${keyedSegment('slug', slug)}`,
      label: String(finalLessons.get(slug)?.title ?? slug),
      message: `Lesson "${slug}" belongs to module "${mod}", which is gone after the merge. Placed in "${fallback}" for now.`,
      base: undefined,
      ours: undefined,
      theirs: undefined,
      patches: {
        ours: [{ op: 'remove', path: `modules${keyedSegment('slug', fallback)}.lessons${keyedSegment('slug', slug)}` }],
        theirs: [],
      },
    })
  }
  merged.modules = mods.map((m) => {
    const slug = String(m.slug)
    const here = [...placeAt].filter(([, mod]) => mod === slug).map(([s]) => s)
    const listOf = (p: Map<string, Placed>) => [...p].filter(([, v]) => v.moduleSlug === slug).map(([s]) => s)
    const ordered = mergeOrder(
      ctx,
      `modules${keyedSegment('slug', slug)}.lessons`,
      String(m.title ?? slug),
      listOf(bP),
      listOf(oP),
      listOf(tP),
      new Set(here),
      finalLessons,
    )
    return { ...m, lessons: ordered.map((s) => finalLessons.get(s)!) }
  })

  // projects with stages
  merged.projects = mergeList(ctx, {
    path: 'projects',
    label: 'Projects',
    keyProp: 'slug',
    base: asList(B.projects),
    ours: asList(O.projects),
    theirs: asList(T.projects),
    item: (_k, p, b, o, t) => {
      const label = String(o.title ?? '')
      const meta = mergeValue(ctx, p, label, { ...b, stages: undefined }, { ...o, stages: undefined }, { ...t, stages: undefined }) as Record<string, unknown>
      meta.stages = mergeList(ctx, {
        path: `${p}.stages`,
        label,
        keyProp: 'slug',
        base: asList(b.stages),
        ours: asList(o.stages),
        theirs: asList(t.stages),
        item: (_sk, sp, sb, so, st) => mergeValue(ctx, sp, String(so.title ?? ''), sb, so, st) as Record<string, unknown>,
        itemLabel: (x) => String(x.title ?? x.slug),
      })
      return meta
    },
    itemLabel: (x) => String(x.title ?? x.slug),
  })

  // final exam
  const bx = B.finalExam as Record<string, unknown> | undefined
  const ox = O.finalExam as Record<string, unknown> | undefined
  const tx = T.finalExam as Record<string, unknown> | undefined
  if (ox && tx && bx) {
    const meta = mergeValue(ctx, 'finalExam', 'Final exam', { ...bx, exercises: undefined }, { ...ox, exercises: undefined }, { ...tx, exercises: undefined }) as Record<string, unknown>
    meta.exercises = mergeExercises(ctx, 'finalExam', 'Final exam', asList(bx.exercises) as unknown as Exercise[], asList(ox.exercises) as unknown as Exercise[], asList(tx.exercises) as unknown as Exercise[])
    merged.finalExam = meta
  } else if (ox && tx) {
    if (deepEqual(ox, tx)) merged.finalExam = ox
    else {
      conflict(ctx, { kind: 'add-add', path: 'finalExam', label: 'Final exam', message: 'Both sides added a final exam.', base: undefined, ours: ox, theirs: tx, patches: { ours: [], theirs: [{ op: 'set', path: 'finalExam', value: tx }] } })
      merged.finalExam = ox
    }
  } else if (ox || tx) {
    const only = (ox ?? tx)!
    if (bx && deepEqual(bx, only)) ctx.auto += 1
    else if (bx) {
      const oursSide = !!ox
      conflict(ctx, {
        kind: 'delete-modify',
        path: 'finalExam',
        label: 'Final exam',
        message: `${oursSide ? 'Theirs' : 'Ours'} removed the final exam but ${oursSide ? 'ours' : 'theirs'} edited it. Kept for now.`,
        base: bx,
        ours: ox,
        theirs: tx,
        patches: oursSide
          ? { ours: [], theirs: [{ op: 'remove', path: 'finalExam' }] }
          : { ours: [{ op: 'remove', path: 'finalExam' }], theirs: [] },
      })
      merged.finalExam = only
    } else {
      ctx.auto += 1
      merged.finalExam = only
    }
  } else delete merged.finalExam

  const clean = undecorate(merged)
  const status = ctx.conflicts.length === 0 ? 'clean' : 'conflicts'
  return {
    merged: clean,
    conflicts: ctx.conflicts,
    status,
    autoMerged: ctx.auto,
    validation: status === 'clean' ? validateLhcf(clean) : null,
    keyed: merged,
  }
}

// ─── resolution ─────────────────────────────────────────────────────────────

function applyPatch(root: Record<string, unknown>, patch: Patch): boolean {
  if (patch.op === 'set') return setAtPath(root, patch.path, patch.value)
  if (patch.op === 'remove') return setAtPath(root, patch.path, undefined)
  if (patch.op === 'order') return setAtPath(root, patch.path, patch.value)
  // move-lesson
  const modules = root.modules
  if (!Array.isArray(modules)) return false
  let moved: unknown
  for (const m of modules) {
    if (!isPlainObject(m) || !Array.isArray(m.lessons)) continue
    const i = m.lessons.findIndex((l) => isPlainObject(l) && l.slug === patch.slug)
    if (i >= 0) {
      moved = m.lessons.splice(i, 1)[0]
      break
    }
  }
  const target = modules.find((m) => isPlainObject(m) && m.slug === patch.toModule)
  if (!moved || !isPlainObject(target) || !Array.isArray(target.lessons)) return false
  target.lessons.push(moved)
  return true
}

export interface ResolveResult {
  /** Merged course input after the choices were applied. */
  merged: Record<string, unknown>
  /** Conflict ids that still have no choice. */
  unresolved: string[]
  /** Patches that could not be applied (target no longer exists). */
  failed: { id: string; patch: Patch }[]
  validation: LhcfValidation | null
}

/**
 * Apply explicit choices. Without a choice a conflict stays unresolved and the
 * result carries no validation, so it cannot be mistaken for a finished merge.
 */
export function applyResolutions(result: MergeResult, choices: Readonly<Record<string, Choice>>): ResolveResult {
  const keyed = cloneCourse(result.keyed)
  const unresolved: string[] = []
  const failed: { id: string; patch: Patch }[] = []
  const chosen: { id: string; patch: Patch }[] = []
  for (const c of result.conflicts) {
    const choice = choices[c.id]
    if (!choice) {
      unresolved.push(c.id)
      continue
    }
    chosen.push(...c.patches[choice].map((patch) => ({ id: c.id, patch })))
  }
  // order patches replace whole lists, so they go first; later patches then edit inside them
  chosen.sort((a, b) => Number(b.patch.op === 'order') - Number(a.patch.op === 'order'))
  for (const { id, patch } of chosen) if (!applyPatch(keyed, patch)) failed.push({ id, patch })
  const merged = undecorate(keyed)
  const done = unresolved.length === 0 && failed.length === 0
  return { merged, unresolved, failed, validation: done ? validateLhcf(merged) : null }
}

/** Strict parse of a merged document, for callers that only want the typed course. */
export function parseMerged(merged: unknown): LhcfCourse | null {
  const r = lhcfCourseSchema.safeParse(merged)
  return r.success ? r.data : null
}

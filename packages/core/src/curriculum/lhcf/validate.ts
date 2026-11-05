/**
 * LHCF validation: lenient repair → schema → semantic checks.
 *
 * Errors block an import; warnings don't (they teach the author how to make
 * the course better — e.g. "add an exercise: retrieval practice is what makes
 * it stick"). Every issue has a path like `modules[0].lessons[2].objective`
 * and, where we can, a concrete hint.
 */
import type { z } from 'zod'
import { isBloomVerb } from '../pedagogy'
import { normalizeLhcfInput, type Fix } from './normalize'
import { lhcfCourseSchema, type LhcfCourse } from './schema'

/** One problem found in a curriculum. */
export interface Issue {
  path: string
  message: string
  hint?: string
}

export type LhcfValidation =
  | { ok: true; course: LhcfCourse; warnings: Issue[]; fixes: Fix[] }
  | { ok: false; errors: Issue[]; warnings: Issue[]; fixes: Fix[] }

/** Hard ceilings so a malicious or runaway document can't exhaust the app. */
export const LHCF_LIMITS = { exercises: 3000, lessons: 600 } as const

/** `['modules', 0, 'title']` → `modules[0].title`. */
export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (acc, key) =>
      typeof key === 'number' ? `${acc}[${key}]` : acc ? `${acc}.${String(key)}` : String(key),
    '',
  )
}

function hintFor(issue: z.core.$ZodIssue): string | undefined {
  const last = issue.path[issue.path.length - 1]
  if (last === 'slug') return 'Use lowercase words joined by dashes, e.g. "variables-and-types".'
  if (last === 'type' && issue.code === 'invalid_union')
    return 'Exercise type must be one of: mcq, multi, truefalse, numeric, typein, cloze, ordering, parsons, matching, categorize, freetext, code.'
  if (last === 'modules' || last === 'lessons')
    return 'Every course needs at least one module, and every module at least one lesson.'
  if (last === 'lhcf') return 'Add "lhcf": 1 at the top of the document.'
  if (issue.code === 'invalid_type' && issue.input === undefined) return 'This field is required.'
  return undefined
}

/**
 * Find one cycle in the prerequisite graph (slug → required slugs), or null.
 * Cycles make skills impossible to unlock, so they are hard errors.
 */
export function findPrerequisiteCycle(
  requires: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const WHITE = 0,
    GREY = 1,
    BLACK = 2
  const color = new Map<string, number>()
  const stack: string[] = []
  const visit = (node: string): string[] | null => {
    color.set(node, GREY)
    stack.push(node)
    for (const next of requires.get(node) ?? []) {
      const c = color.get(next) ?? WHITE
      if (c === GREY) return [...stack.slice(stack.indexOf(next)), next]
      if (c === WHITE) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    color.set(node, BLACK)
    return null
  }
  for (const node of requires.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cycle = visit(node)
      if (cycle) return cycle
    }
  }
  return null
}

const titleCase = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

/**
 * Validate (and leniently repair) a parsed curriculum object.
 * Pure: never touches the database.
 */
export function validateLhcf(input: unknown): LhcfValidation {
  const { value, fixes } = normalizeLhcfInput(input)
  const warnings: Issue[] = []

  const parsed = lhcfCourseSchema.safeParse(value)
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      path: formatPath(i.path),
      message: i.message,
      hint: hintFor(i),
    }))
    return { ok: false, errors, warnings, fixes }
  }
  const course = parsed.data
  const errors: Issue[] = []

  // ── size ceilings ──
  const lessons = course.modules.flatMap((m) => m.lessons)
  const exerciseCount =
    lessons.reduce((n, l) => n + l.exercises.length, 0) + (course.finalExam?.exercises.length ?? 0)
  if (lessons.length > LHCF_LIMITS.lessons)
    errors.push({
      path: 'modules',
      message: `too many lessons (${lessons.length} > ${LHCF_LIMITS.lessons})`,
      hint: 'Split it into several courses on the same track.',
    })
  if (exerciseCount > LHCF_LIMITS.exercises)
    errors.push({
      path: 'modules',
      message: `too many exercises (${exerciseCount} > ${LHCF_LIMITS.exercises})`,
      hint: 'Split it into several courses on the same track.',
    })

  // ── skills: auto-create referenced-but-undeclared skills, drop unknown requirements ──
  const skillSlugs = new Set(course.skills.map((s) => s.slug))
  const referenced = [
    ...lessons.flatMap((l) => l.skills),
    ...course.projects.flatMap((p) => p.skills),
  ]
  for (const slug of referenced) {
    if (!skillSlugs.has(slug)) {
      course.skills.push({ slug, name: titleCase(slug), requires: [] })
      skillSlugs.add(slug)
      fixes.push({
        path: 'skills',
        message: `added skill "${slug}" referenced by a lesson or project`,
      })
    }
  }
  course.skills.forEach((s, i) => {
    const unknown = s.requires.filter((r) => !skillSlugs.has(r))
    if (unknown.length) {
      s.requires = s.requires.filter((r) => skillSlugs.has(r))
      warnings.push({
        path: `skills[${i}].requires`,
        message: `ignored unknown prerequisite(s): ${unknown.join(', ')}`,
        hint: 'Each "requires" entry must be the slug of another skill in this course.',
      })
    }
    if (s.requires.includes(s.slug)) {
      s.requires = s.requires.filter((r) => r !== s.slug)
      warnings.push({
        path: `skills[${i}].requires`,
        message: 'a skill cannot require itself — removed',
      })
    }
  })
  const cycle = findPrerequisiteCycle(new Map(course.skills.map((s) => [s.slug, s.requires])))
  if (cycle) {
    errors.push({
      path: 'skills',
      message: `prerequisite cycle: ${cycle.join(' → ')}`,
      hint: 'Remove one "requires" link so the skills form a tree/DAG.',
    })
  }

  // ── pedagogy warnings (don't block import) ──
  course.modules.forEach((m, mi) =>
    m.lessons.forEach((l, li) => {
      const path = `modules[${mi}].lessons[${li}]`
      const verb = l.objective.split(/\s+/)[0]?.replace(/[^\p{L}]/gu, '') ?? ''
      if (!isBloomVerb(verb)) {
        warnings.push({
          path: `${path}.objective`,
          message: `objective should start with a measurable verb (got "${verb}")`,
          hint: 'e.g. Explain, Calculate, Compare, Implement, Evaluate, Design (Bloom’s taxonomy).',
        })
      }
      if (l.exercises.length === 0 && l.type !== 'reading' && l.type !== 'video') {
        warnings.push({
          path: `${path}.exercises`,
          message: 'lesson has no exercises',
          hint: 'Add at least one: retrieval practice is what makes learning stick (testing effect).',
        })
      }
      if (l.theory.length === 0 && l.workedExamples.length === 0 && l.type === 'concept') {
        warnings.push({
          path: `${path}.theory`,
          message: 'concept lesson has no theory or worked example',
        })
      }
    }),
  )

  if (errors.length) return { ok: false, errors, warnings, fixes }
  return { ok: true, course, warnings, fixes }
}

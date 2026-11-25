/**
 * References to skills that the course does not define.
 *
 * `validateLhcf` repairs these silently (it adds a placeholder skill for a
 * lesson or project reference and drops an unknown prerequisite). That is
 * right for importing a rough file, but wrong after a refactor or a merge:
 * a skill someone deleted would come back, and a prerequisite would vanish.
 * These helpers look at the draft before validation so the caller can refuse.
 */

type Draft = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []

export function danglingSkillRefs(course: Draft): string[] {
  const skills = Array.isArray(course.skills) ? (course.skills as Draft[]) : []
  const known = new Set(skills.map((s) => String(s?.slug)))
  const out: string[] = []
  for (const s of skills)
    for (const r of list(s?.requires))
      if (!known.has(r)) out.push(`skill "${s.slug}" requires "${r}"`)
  for (const m of (Array.isArray(course.modules) ? course.modules : []) as Draft[])
    for (const l of (Array.isArray(m?.lessons) ? m.lessons : []) as Draft[])
      for (const r of list(l?.skills)) if (!known.has(r)) out.push(`lesson "${l.slug}" uses "${r}"`)
  for (const p of (Array.isArray(course.projects) ? course.projects : []) as Draft[])
    for (const r of list(p?.skills)) if (!known.has(r)) out.push(`project "${p.slug}" uses "${r}"`)
  return out
}

/** Dangling references in `after` that were not already dangling in `before`. */
export function newDanglingRefs(before: Draft, after: Draft): string[] {
  const had = new Set(danglingSkillRefs(before))
  return danglingSkillRefs(after).filter((x) => !had.has(x))
}

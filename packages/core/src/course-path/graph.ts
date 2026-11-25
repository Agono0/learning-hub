/**
 * Prerequisite graph analysis over course skills.
 *
 * Cycle detection is `findPrerequisiteCycle` from the LHCF validator, not a copy.
 * With a cycle present, closures still terminate (each node is visited once) and
 * the cycle is reported so callers can stop and show it.
 */
import { findPrerequisiteCycle } from '../curriculum/lhcf/validate'
import { unlockProbability } from '../bkt'
import { PREREQ_MASTERY_THRESHOLD } from '../curriculum/progress'
import type { CourseModel } from './model'

export interface GraphAnalysis {
  /** Slugs along one cycle (first slug repeated at the end), or null. */
  cycle: string[] | null
  /** skill id to every skill it needs, directly or not. */
  ancestors: Map<number, Set<number>>
  /** skill id to every skill that needs it, directly or not. */
  dependants: Map<number, Set<number>>
  /** Length of the longest requirement chain ending at the skill (0 = no prerequisites). */
  depth: Map<number, number>
}

function closure(start: number, edges: ReadonlyMap<number, readonly number[]>): Set<number> {
  const seen = new Set<number>()
  const stack = [...(edges.get(start) ?? [])]
  while (stack.length) {
    const n = stack.pop()!
    if (seen.has(n)) continue
    seen.add(n)
    for (const next of edges.get(n) ?? []) if (!seen.has(next)) stack.push(next)
  }
  seen.delete(start)
  return seen
}

export function analyzeGraph(model: CourseModel): GraphAnalysis {
  const slugOf = new Map(model.skills.map((s) => [s.id, s.slug]))
  const bySlug = new Map<string, string[]>()
  for (const s of model.skills) {
    bySlug.set(
      s.slug,
      (model.prereqs.get(s.id) ?? []).map((id) => slugOf.get(id)!),
    )
  }
  const cycle = findPrerequisiteCycle(bySlug)

  const forward = new Map<number, number[]>()
  for (const [skill, reqs] of model.prereqs) {
    for (const r of reqs) forward.set(r, [...(forward.get(r) ?? []), skill])
  }
  const ancestors = new Map<number, Set<number>>()
  const dependants = new Map<number, Set<number>>()
  for (const s of model.skills) {
    ancestors.set(s.id, closure(s.id, model.prereqs))
    dependants.set(s.id, closure(s.id, forward))
  }

  const depth = new Map<number, number>()
  const visiting = new Set<number>()
  const depthOf = (id: number): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 0 // back edge of a cycle: ignored
    visiting.add(id)
    let d = 0
    for (const r of model.prereqs.get(id) ?? []) d = Math.max(d, depthOf(r) + 1)
    visiting.delete(id)
    depth.set(id, d)
    return d
  }
  for (const s of model.skills) depthOf(s.id)
  return { cycle, ancestors, dependants, depth }
}

/** Same test `lockedSkills` applies to one prerequisite. */
export function isMastered(
  pKnown: number | undefined,
  threshold = PREREQ_MASTERY_THRESHOLD,
): boolean {
  return unlockProbability(pKnown ?? 0) >= threshold
}

/**
 * The skills to work on first to unlock `skillId`: unmastered prerequisites that
 * have no unmastered prerequisite of their own. Empty when the skill is unlocked.
 */
export function rootBlockers(
  model: CourseModel,
  skillId: number,
  pKnown: ReadonlyMap<number, number>,
  threshold = PREREQ_MASTERY_THRESHOLD,
): number[] {
  const roots = new Set<number>()
  const seen = new Set<number>()
  const walk = (id: number): void => {
    for (const r of model.prereqs.get(id) ?? []) {
      if (isMastered(pKnown.get(r), threshold) || seen.has(r)) continue
      seen.add(r)
      const deeper = (model.prereqs.get(r) ?? []).some((x) => !isMastered(pKnown.get(x), threshold))
      if (deeper) walk(r)
      else roots.add(r)
    }
  }
  walk(skillId)
  // a cycle can leave no root; fall back to the direct blockers so the answer is never empty
  if (!roots.size) {
    for (const r of model.prereqs.get(skillId) ?? []) {
      if (!isMastered(pKnown.get(r), threshold)) roots.add(r)
    }
  }
  return [...roots].sort((a, b) => a - b)
}

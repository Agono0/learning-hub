/**
 * What can be studied now, what is soft-locked and why, and which skills unlock
 * the most remaining work.
 *
 * Locking is the course rule from `curriculum/progress.ts` (soft lock, direct
 * prerequisites, `unlockProbability >= threshold`), called as-is. Nothing here
 * hard-blocks a lesson.
 */
import {
  PREREQ_MASTERY_THRESHOLD,
  isLessonLocked,
  lockedSkills,
  nextLessonId,
  type LessonFacts,
} from '../curriculum/progress'
import { analyzeGraph, isMastered, rootBlockers } from './graph'
import { masteryById, statusOf, type CourseModel, type LearnerState } from './model'

export type LessonStage = 'completed' | 'in-progress' | 'ready' | 'soft-locked'

export interface LessonFrontier {
  slug: string
  title: string
  stage: LessonStage
  minutes: number
  /** Direct prerequisites below the bar that lock this lesson (skill slugs). */
  blockedBy: string[]
  /** Skills to work on first, deepest unmastered prerequisites (skill slugs). */
  fixFirst: string[]
}

export interface Unlocker {
  skill: string
  name: string
  /** Not-completed lessons that need this skill, directly or through later skills. */
  downstreamLessons: number
  /** Minutes of not-completed lessons that train this skill. */
  minutesToTrain: number
  /** Lessons that are soft-locked right now and become ready only after this skill (and others) improve. */
  lockedLessons: number
}

export interface FrontierResult {
  lessons: LessonFrontier[]
  /** The lesson the course page would continue with (`nextLessonId`), or null. */
  next: string | null
  unlockers: Unlocker[]
  completed: number
  total: number
}

export interface FrontierOptions {
  threshold?: number
  /** Cap for `unlockers`. */
  maxUnlockers?: number
}

export function computeFrontier(
  model: CourseModel,
  state: LearnerState,
  options: FrontierOptions = {},
): FrontierResult {
  const threshold = options.threshold ?? PREREQ_MASTERY_THRESHOLD
  const pKnown = masteryById(model, state)
  const locked = lockedSkills(model.prereqs, pKnown, threshold)
  const slug = (id: number) => model.skills[id - 1]!.slug

  const facts: LessonFacts[] = model.lessons.map((l) => ({
    id: l.id,
    status: statusOf(model, state, l.id),
    skillIds: l.skillIds,
  }))

  const lessons: LessonFrontier[] = model.lessons.map((l, i) => {
    const f = facts[i]!
    const lockedHere = l.skillIds.filter((s) => locked.has(s))
    const soft = isLessonLocked(f, locked)
    const blocked = new Set<number>()
    const roots = new Set<number>()
    if (soft) {
      for (const s of lockedHere) {
        for (const r of model.prereqs.get(s) ?? []) {
          if (!isMastered(pKnown.get(r), threshold)) blocked.add(r)
        }
        for (const r of rootBlockers(model, s, pKnown, threshold)) roots.add(r)
      }
    }
    const stage: LessonStage =
      f.status === 'completed'
        ? 'completed'
        : soft
          ? 'soft-locked'
          : f.status === 'in_progress'
            ? 'in-progress'
            : 'ready'
    return {
      slug: l.slug,
      title: l.title,
      stage,
      minutes: l.minutes,
      blockedBy: [...blocked].sort((a, b) => a - b).map(slug),
      fixFirst: [...roots].sort((a, b) => a - b).map(slug),
    }
  })

  const nextId = nextLessonId(facts, locked)
  const graph = analyzeGraph(model)
  const open = model.lessons.filter((l) => facts[l.id - 1]!.status !== 'completed')

  const unlockers: Unlocker[] = []
  for (const s of model.skills) {
    if (locked.has(s.id) || isMastered(pKnown.get(s.id), threshold)) continue
    const later = graph.dependants.get(s.id) ?? new Set<number>()
    if (!later.size) continue
    const trainers = open.filter((l) => l.skillIds.includes(s.id))
    const downstream = open.filter((l) => l.skillIds.some((x) => later.has(x)))
    if (!downstream.length) continue
    unlockers.push({
      skill: s.slug,
      name: s.name,
      downstreamLessons: downstream.length,
      minutesToTrain: trainers.reduce((sum, l) => sum + l.minutes, 0),
      lockedLessons: downstream.filter((l) => lessons[l.id - 1]!.stage === 'soft-locked').length,
    })
  }
  unlockers.sort(
    (a, b) =>
      b.downstreamLessons - a.downstreamLessons ||
      a.minutesToTrain - b.minutesToTrain ||
      a.skill.localeCompare(b.skill),
  )

  return {
    lessons,
    next: nextId === null ? null : model.lessons[nextId - 1]!.slug,
    unlockers: unlockers.slice(0, options.maxUnlockers ?? 5),
    completed: lessons.filter((l) => l.stage === 'completed').length,
    total: lessons.length,
  }
}

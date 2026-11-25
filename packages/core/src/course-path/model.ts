/**
 * Course model for path planning.
 *
 * Reads an LHCF course (read-only) and re-indexes it with numeric ids so the
 * existing course rules in `curriculum/progress.ts` (`lockedSkills`,
 * `isLessonLocked`, `nextLessonId`) can be called unchanged. The prerequisite
 * graph is over SKILLS (`skill.requires`); lessons only name the skills they
 * train. References to unknown skills are ignored and listed in
 * `unknownSkillRefs` (validateLhcf normally repairs those before we run).
 */
import type { LhcfCourse } from '../curriculum/lhcf/schema'
import type { LessonStatus } from '../curriculum/progress'

/** Minutes assumed for a lesson without `estMinutes`. Such lessons are flagged. */
export const DEFAULT_LESSON_MINUTES = 20

/** The parts of an LHCF course the planner reads. */
export type CourseInput = Pick<LhcfCourse, 'modules' | 'skills'>

export interface ModelSkill {
  id: number
  slug: string
  name: string
}

export interface ModelLesson {
  /** 1-based position in course order. */
  id: number
  slug: string
  title: string
  moduleSlug: string
  minutes: number
  /** True when `minutes` is the default because the lesson has no estimate. */
  estimated: boolean
  skillIds: number[]
}

export interface CourseModel {
  skills: ModelSkill[]
  lessons: ModelLesson[]
  skillIdBySlug: Map<string, number>
  /** First lesson wins when slugs repeat. */
  lessonIdBySlug: Map<string, number>
  /** skill id to the ids of the skills it requires (a `PrereqMap`). */
  prereqs: Map<number, number[]>
  unknownSkillRefs: string[]
}

export function buildCourseModel(course: CourseInput): CourseModel {
  const skills: ModelSkill[] = course.skills.map((s, i) => ({
    id: i + 1,
    slug: s.slug,
    name: s.name,
  }))
  const skillIdBySlug = new Map<string, number>()
  for (const s of skills) if (!skillIdBySlug.has(s.slug)) skillIdBySlug.set(s.slug, s.id)

  const unknown = new Set<string>()
  const ref = (slug: string): number | undefined => {
    const id = skillIdBySlug.get(slug)
    if (id === undefined) unknown.add(slug)
    return id
  }

  const prereqs = new Map<number, number[]>()
  course.skills.forEach((s, i) => {
    const ids = [...new Set(s.requires.map(ref))].filter(
      (id): id is number => id !== undefined && id !== i + 1,
    )
    if (ids.length) prereqs.set(i + 1, ids)
  })

  const lessons: ModelLesson[] = []
  const lessonIdBySlug = new Map<string, number>()
  for (const mod of course.modules) {
    for (const l of mod.lessons) {
      const id = lessons.length + 1
      lessons.push({
        id,
        slug: l.slug,
        title: l.title,
        moduleSlug: mod.slug,
        minutes: l.estMinutes ?? DEFAULT_LESSON_MINUTES,
        estimated: l.estMinutes === undefined,
        skillIds: [...new Set(l.skills.map(ref))].filter((x): x is number => x !== undefined),
      })
      if (!lessonIdBySlug.has(l.slug)) lessonIdBySlug.set(l.slug, id)
    }
  }
  return {
    skills,
    lessons,
    skillIdBySlug,
    lessonIdBySlug,
    prereqs,
    unknownSkillRefs: [...unknown].sort(),
  }
}

/** What the learner has done, keyed by slug. Missing entries mean "no data". */
export interface LearnerState {
  /** BKT pKnown per skill slug. Missing means 0, the same default `lockedSkills` uses. */
  mastery?: Readonly<Record<string, number>>
  /** Status per lesson slug. Missing means not started. */
  status?: Readonly<Record<string, LessonStatus>>
}

export function masteryById(model: CourseModel, state: LearnerState): Map<number, number> {
  const out = new Map<number, number>()
  for (const [slug, p] of Object.entries(state.mastery ?? {})) {
    const id = model.skillIdBySlug.get(slug)
    if (id !== undefined && Number.isFinite(p)) out.set(id, Math.min(1, Math.max(0, p)))
  }
  return out
}

export function statusOf(model: CourseModel, state: LearnerState, lessonId: number): LessonStatus {
  const lesson = model.lessons[lessonId - 1]
  return (lesson && state.status?.[lesson.slug]) || 'not_started'
}

/**
 * Summary numbers for a curriculum — the import preview ("6 modules,
 * 28 lessons, 190 exercises, ~24 h") and the course overview header.
 */
import type { ExerciseType } from '../../practice/schema'
import type { LhcfCourse } from './schema'

export interface LhcfStats {
  modules: number
  lessons: number
  exercises: number
  /** Exercise count per type (for "mixes 7 exercise types"). */
  exerciseTypes: Partial<Record<ExerciseType, number>>
  workedExamples: number
  keyTerms: number
  skills: number
  projects: number
  projectStages: number
  finalExamQuestions: number
  /** Sum of lesson + stage estimates, in minutes (0 when none given). */
  estMinutes: number
}

/** Count everything in a validated course. */
export function lhcfStats(course: LhcfCourse): LhcfStats {
  const lessons = course.modules.flatMap((m) => m.lessons)
  const exerciseTypes: LhcfStats['exerciseTypes'] = {}
  for (const l of lessons)
    for (const e of l.exercises) exerciseTypes[e.type] = (exerciseTypes[e.type] ?? 0) + 1
  const stages = course.projects.flatMap((p) => p.stages)
  return {
    modules: course.modules.length,
    lessons: lessons.length,
    exercises: lessons.reduce((n, l) => n + l.exercises.length, 0),
    exerciseTypes,
    workedExamples: lessons.reduce((n, l) => n + l.workedExamples.length, 0),
    keyTerms: lessons.reduce((n, l) => n + l.keyTerms.length, 0),
    skills: course.skills.length,
    projects: course.projects.length,
    projectStages: stages.length,
    finalExamQuestions: course.finalExam?.exercises.length ?? 0,
    estMinutes:
      lessons.reduce((n, l) => n + (l.estMinutes ?? 0), 0) +
      stages.reduce((n, s) => n + (s.estMinutes ?? 0), 0),
  }
}

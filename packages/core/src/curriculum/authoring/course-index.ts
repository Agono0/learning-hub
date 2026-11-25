/**
 * A flat, path-addressed view of a validated LHCF course. Every authoring
 * check walks this index instead of re-implementing nested loops, so paths in
 * findings, diffs and refactors always use the same notation as `validateLhcf`.
 */
import type { Exercise } from '../../practice/schema'
import type { LhcfCourse, LhcfLesson, LhcfModule } from '../lhcf/schema'

/** Where an exercise lives. */
export type ExerciseHome =
  | { kind: 'lesson'; moduleIndex: number; lessonIndex: number }
  | { kind: 'finalExam' }

export interface IndexedExercise {
  exercise: Exercise
  /** Position inside its lesson or the final exam. */
  index: number
  path: string
  home: ExerciseHome
  /** Lesson slug, or `null` for final exam exercises. */
  lessonSlug: string | null
  /** Module slug, or `null` for final exam exercises. */
  moduleSlug: string | null
}

export interface IndexedLesson {
  lesson: LhcfLesson
  module: LhcfModule
  moduleIndex: number
  lessonIndex: number
  path: string
  /** 0-based position across the whole course. */
  order: number
}

export interface CourseIndex {
  lessons: IndexedLesson[]
  exercises: IndexedExercise[]
  lessonBySlug: Map<string, IndexedLesson>
  moduleBySlug: Map<string, { module: LhcfModule; index: number }>
  skillSlugs: Set<string>
  /** Slugs seen more than once, per scope (`lesson`, `module`, `skill`). */
  duplicateSlugs: { lesson: string[]; module: string[]; skill: string[] }
}

/** Build the index. Never throws; duplicates are reported, first one wins in maps. */
export function indexCourse(course: LhcfCourse): CourseIndex {
  const lessons: IndexedLesson[] = []
  const exercises: IndexedExercise[] = []
  const lessonBySlug = new Map<string, IndexedLesson>()
  const moduleBySlug = new Map<string, { module: LhcfModule; index: number }>()
  const dup = { lesson: new Set<string>(), module: new Set<string>(), skill: new Set<string>() }
  let order = 0

  course.modules.forEach((module, moduleIndex) => {
    if (moduleBySlug.has(module.slug)) dup.module.add(module.slug)
    else moduleBySlug.set(module.slug, { module, index: moduleIndex })
    module.lessons.forEach((lesson, lessonIndex) => {
      const path = `modules[${moduleIndex}].lessons[${lessonIndex}]`
      const entry: IndexedLesson = { lesson, module, moduleIndex, lessonIndex, path, order: order++ }
      lessons.push(entry)
      if (lessonBySlug.has(lesson.slug)) dup.lesson.add(lesson.slug)
      else lessonBySlug.set(lesson.slug, entry)
      lesson.exercises.forEach((exercise, index) => {
        exercises.push({
          exercise,
          index,
          path: `${path}.exercises[${index}]`,
          home: { kind: 'lesson', moduleIndex, lessonIndex },
          lessonSlug: lesson.slug,
          moduleSlug: module.slug,
        })
      })
    })
  })
  course.finalExam?.exercises.forEach((exercise, index) => {
    exercises.push({
      exercise,
      index,
      path: `finalExam.exercises[${index}]`,
      home: { kind: 'finalExam' },
      lessonSlug: null,
      moduleSlug: null,
    })
  })

  const skillSlugs = new Set<string>()
  for (const s of course.skills) {
    if (skillSlugs.has(s.slug)) dup.skill.add(s.slug)
    skillSlugs.add(s.slug)
  }
  return {
    lessons,
    exercises,
    lessonBySlug,
    moduleBySlug,
    skillSlugs,
    duplicateSlugs: {
      lesson: [...dup.lesson],
      module: [...dup.module],
      skill: [...dup.skill],
    },
  }
}

/** Deep clone a plain JSON-compatible value. Courses are JSON by construction. */
export function cloneCourse<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Exercises of one lesson, with their paths. */
export function exercisesOfLesson(index: CourseIndex, lessonSlug: string): IndexedExercise[] {
  return index.exercises.filter((e) => e.lessonSlug === lessonSlug)
}

/**
 * Time estimates: author-entered minutes versus a content-size reference.
 *
 * IMPORTANT: `estMinutes`, `estHours` and exam `minutes` are numbers the AUTHOR
 * typed. This module never measures how long real learners take. It compares
 * those numbers with a rough reading-and-answering budget derived from the
 * amount of content, so authors can spot entries that look far off. The
 * reference speeds are conventional defaults and can be overridden.
 */
import type { Exercise, ExerciseType } from '../../practice/schema'
import type { LhcfCourse, LhcfLesson } from '../lhcf/schema'
import { stripMarkdown, wordCount } from './terms'
import { finding, type Finding, type RuleInfo } from './types'

export interface TimeModel {
  /** Silent reading speed for theory, words per minute. */
  readingWpm: number
  /** Minutes to study one worked example. */
  workedExampleMin: number
  /** Seconds per exercise, by type (answering only, no feedback reading). */
  exerciseSeconds: Record<ExerciseType, number>
  /** Seconds for each reflection prompt. */
  reflectionSeconds: number
  /** Seconds to read the explanation after an answer. */
  feedbackSeconds: number
}

export const DEFAULT_TIME_MODEL: TimeModel = {
  readingWpm: 180,
  workedExampleMin: 3,
  exerciseSeconds: {
    truefalse: 20,
    mcq: 45,
    multi: 60,
    matching: 75,
    categorize: 90,
    ordering: 75,
    typein: 40,
    cloze: 50,
    numeric: 90,
    parsons: 150,
    freetext: 300,
    code: 480,
  },
  reflectionSeconds: 90,
  feedbackSeconds: 15,
}

export interface LessonTimeReference {
  lessonSlug: string
  path: string
  /** What the author typed, if anything. */
  authorMinutes: number | undefined
  /** Content-size reference in minutes (never less than 1). */
  referenceMinutes: number
  parts: { reading: number; examples: number; exercises: number; reflection: number }
  /** authorMinutes / referenceMinutes, when both exist. */
  ratio: number | undefined
}

export function exerciseSeconds(e: Exercise, model: TimeModel = DEFAULT_TIME_MODEL): number {
  const base = model.exerciseSeconds[e.type]
  const promptExtra = Math.max(0, wordCount(e.prompt) - 25) * (60 / model.readingWpm)
  return base + promptExtra + (e.explanation ? model.feedbackSeconds : 0)
}

/** Reference minutes for one lesson. */
export function lessonReference(lesson: LhcfLesson, model: TimeModel = DEFAULT_TIME_MODEL): LessonTimeReference['parts'] & { total: number } {
  const readWords =
    lesson.theory.reduce((n, s) => n + wordCount(stripMarkdown(s.body)), 0) +
    (lesson.summary ? wordCount(stripMarkdown(lesson.summary)) : 0)
  const reading = readWords / model.readingWpm
  const examples = lesson.workedExamples.length * model.workedExampleMin
  const exercises = lesson.exercises.reduce((n, e) => n + exerciseSeconds(e, model), 0) / 60
  const reflection = (lesson.reflection.length * model.reflectionSeconds) / 60
  const total = Math.max(1, Math.round((reading + examples + exercises + reflection) * 10) / 10)
  return { reading, examples, exercises, reflection, total }
}

/** Per-lesson comparison of author minutes and reference minutes. */
export function timeReferences(course: LhcfCourse, model: TimeModel = DEFAULT_TIME_MODEL): LessonTimeReference[] {
  const out: LessonTimeReference[] = []
  course.modules.forEach((m, mi) =>
    m.lessons.forEach((lesson, li) => {
      const r = lessonReference(lesson, model)
      out.push({
        lessonSlug: lesson.slug,
        path: `modules[${mi}].lessons[${li}]`,
        authorMinutes: lesson.estMinutes,
        referenceMinutes: r.total,
        parts: { reading: r.reading, examples: r.examples, exercises: r.exercises, reflection: r.reflection },
        ratio: lesson.estMinutes === undefined ? undefined : Math.round((lesson.estMinutes / r.total) * 100) / 100,
      })
    }),
  )
  return out
}

export interface TimeSummary {
  authorMinutesTotal: number
  referenceMinutesTotal: number
  lessonsWithAuthorMinutes: number
  lessonCount: number
  projectMinutes: number
  /** Total course hours the author entered, if any. */
  authorHours: number | undefined
  /** Hours implied by lesson and project minutes entered by the author. */
  impliedHours: number
}

export function summarizeTime(course: LhcfCourse, refs = timeReferences(course)): TimeSummary {
  const authorMinutesTotal = refs.reduce((n, r) => n + (r.authorMinutes ?? 0), 0)
  const projectMinutes = course.projects.reduce((n, p) => n + p.stages.reduce((m, s) => m + (s.estMinutes ?? 0), 0), 0)
  return {
    authorMinutesTotal,
    referenceMinutesTotal: Math.round(refs.reduce((n, r) => n + r.referenceMinutes, 0)),
    lessonsWithAuthorMinutes: refs.filter((r) => r.authorMinutes !== undefined).length,
    lessonCount: refs.length,
    projectMinutes,
    authorHours: course.estHours,
    impliedHours: Math.round(((authorMinutesTotal + projectMinutes) / 60) * 10) / 10,
  }
}

export const TIME_RULES: RuleInfo[] = [
  {
    ruleId: 'time.lesson-estimate-low',
    title: 'Author estimate is far below the content-size reference',
    severity: 'info',
    measures: 'Author minutes divided by reference minutes (below 0.4).',
    falsePositive: 'Skimmable lessons, or readers who already know the material, take less than the reference.',
  },
  {
    ruleId: 'time.lesson-estimate-high',
    title: 'Author estimate is far above the content-size reference',
    severity: 'info',
    measures: 'Author minutes divided by reference minutes (above 2.5).',
    falsePositive: 'Lessons with videos, labs or external reading carry time that the text does not show.',
  },
  {
    ruleId: 'time.hours-mismatch',
    title: 'Course hours do not match lesson and project minutes',
    severity: 'notice',
    measures: 'estHours versus the sum of lesson and project minutes (differs by more than 25%).',
    falsePositive: 'estHours may include self-study time that no lesson lists.',
  },
  {
    ruleId: 'time.estimates-missing',
    title: 'Most lessons have no minutes',
    severity: 'info',
    measures: 'Share of lessons without estMinutes (over half).',
    falsePositive: 'Estimates are optional.',
  },
  {
    ruleId: 'time.exam-minutes-tight',
    title: 'Exam time limit is below the content-size reference',
    severity: 'notice',
    measures: 'Exam minutes versus the reference time to answer every exam item (below 70%).',
    falsePositive: 'Learners who know the material answer faster than the reference.',
  },
]

const info = new Map(TIME_RULES.map((r) => [r.ruleId, r]))
function mk(ruleId: string, path: string, message: string, evidence: string, suggestion?: string): Finding {
  const r = info.get(ruleId)!
  return finding({ ruleId, severity: r.severity, path, message, evidence, falsePositive: r.falsePositive, suggestion })
}

const NOTE = 'Reference is a content-size budget, not measured learner time.'

/** Findings that compare author-entered minutes with the reference. */
export function timeFindings(course: LhcfCourse, model: TimeModel = DEFAULT_TIME_MODEL): Finding[] {
  const refs = timeReferences(course, model)
  const out: Finding[] = []
  for (const r of refs) {
    if (r.ratio === undefined) continue
    if (r.ratio < 0.4)
      out.push(mk('time.lesson-estimate-low', `${r.path}.estMinutes`, `Author estimate ${r.authorMinutes} min is well below the reference ${r.referenceMinutes} min.`, `${NOTE} Reading ${r.parts.reading.toFixed(1)}, examples ${r.parts.examples.toFixed(1)}, exercises ${r.parts.exercises.toFixed(1)}, reflection ${r.parts.reflection.toFixed(1)} min.`))
    else if (r.ratio > 2.5 && r.referenceMinutes >= 3)
      out.push(mk('time.lesson-estimate-high', `${r.path}.estMinutes`, `Author estimate ${r.authorMinutes} min is well above the reference ${r.referenceMinutes} min.`, `${NOTE} Lesson type counts videos and projects at their typed minutes only.`))
  }
  const summary = summarizeTime(course, refs)
  if (summary.lessonCount >= 4 && summary.lessonsWithAuthorMinutes / summary.lessonCount < 0.5)
    out.push(mk('time.estimates-missing', 'modules', `${summary.lessonCount - summary.lessonsWithAuthorMinutes} of ${summary.lessonCount} lessons have no estimated minutes.`, `Reference total ${summary.referenceMinutesTotal} min.`))
  if (summary.authorHours !== undefined && summary.authorMinutesTotal + summary.projectMinutes > 0) {
    const diff = Math.abs(summary.authorHours - summary.impliedHours) / Math.max(summary.authorHours, 0.1)
    if (diff > 0.25)
      out.push(mk('time.hours-mismatch', 'estHours', `estHours is ${summary.authorHours} but lesson and project minutes add up to ${summary.impliedHours} h.`, `Author-entered: lessons ${summary.authorMinutesTotal} min, projects ${summary.projectMinutes} min. ${summary.lessonCount - summary.lessonsWithAuthorMinutes} lesson(s) have no minutes.`))
  }
  if (course.finalExam?.minutes) {
    const refMin = course.finalExam.exercises.reduce((n, e) => n + exerciseSeconds(e, model), 0) / 60
    if (course.finalExam.minutes < refMin * 0.7)
      out.push(mk('time.exam-minutes-tight', 'finalExam.minutes', `The exam allows ${course.finalExam.minutes} min; the reference is about ${Math.round(refMin)} min.`, `${course.finalExam.exercises.length} items. ${NOTE}`))
  }
  return out
}

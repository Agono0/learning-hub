/** Pure glue between the page state and the course-path core module. */
import { parseCurriculum, type Issue, type LhcfCourse } from '@learning-hub/core/curriculum'
import {
  CoursePathInputError,
  buildCourseModel,
  computeFrontier,
  lintCourse,
  planCourse,
  type CourseModel,
  type FrontierResult,
  type LearnerState,
  type LintFinding,
  type PlanResult,
} from '@learning-hub/core/course-path'
import { pKnownFor, type PathPrefs } from './state'

export interface Analysis {
  course: LhcfCourse
  model: CourseModel
  learner: LearnerState
  frontier: FrontierResult
  lint: LintFinding[]
  plan: PlanResult | null
  /** Why there is no plan: a deadline is missing or the input is invalid. */
  planNote: string | null
  warnings: Issue[]
}

export type AnalyzeResult = { ok: true; value: Analysis } | { ok: false; errors: Issue[] }

export function learnerFromPrefs(prefs: PathPrefs): LearnerState {
  return {
    mastery: Object.fromEntries(Object.entries(prefs.levels).map(([k, v]) => [k, pKnownFor(v)])),
    status: prefs.status,
  }
}

/** The calendar date after `YYYY-MM-DD` (UTC date math, no time zone involved). */
export function nextDate(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`)
  return new Date(t + 86_400_000).toISOString().slice(0, 10)
}

export function analyze(prefs: PathPrefs, today: string): AnalyzeResult {
  const parsed = parseCurriculum(prefs.source)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const course = parsed.course
  const model = buildCourseModel(course)
  const learner = learnerFromPrefs(prefs)
  const frontier = computeFrontier(model, learner)
  const lint = lintCourse(model)
  let plan: PlanResult | null = null
  let planNote: string | null = null
  if (!prefs.deadline) planNote = 'Pick your last study day to get a day-by-day plan.'
  else if (prefs.deadline < today) planNote = 'The last study day cannot be in the past.'
  else {
    try {
      plan = planCourse(model, learner, {
        startDate: today,
        // The page asks for the LAST study day (inclusive); the core deadline is exclusive.
        deadline: nextDate(prefs.deadline),
        minutesPerDay: prefs.minutesPerDay,
        restWeekdays: prefs.restWeekdays,
      })
    } catch (err) {
      planNote = err instanceof CoursePathInputError ? err.message : 'The plan could not be made.'
    }
  }
  return {
    ok: true,
    value: { course, model, learner, frontier, lint, plan, planNote, warnings: parsed.warnings },
  }
}

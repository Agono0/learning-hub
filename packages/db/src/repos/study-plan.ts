/**
 * Study Plan repository — weekly study template, workload distribution,
 * rest-day handling, and exam timeline integration.
 */
import { asc, eq } from 'drizzle-orm'
import { buildStudyPlan, type PlanCourse, type WeeklyPlan } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { examDates, studyPlans } from '../schema'
import { listCourses } from './learning'

export type StudyPlanRow = typeof studyPlans.$inferSelect

export interface SaveStudyPlanInput {
  weeklyMinutes: number
  restDay?: number | null
  plan: WeeklyPlan
}

/**
 * Fetch active courses and exam deadlines shaped for the study planner.
 */
export function getPlanCourses(opts: { db?: LearningHubDB } = {}): PlanCourse[] {
  const db = opts.db ?? getDb()
  const catalog = listCourses(opts.db)
  const exams = db
    .select({ courseId: examDates.courseId, date: examDates.date })
    .from(examDates)
    .all()
  const examByCourse = new Map<number, string>()
  for (const e of exams) {
    if (e.courseId != null) examByCourse.set(e.courseId, e.date)
  }

  return catalog.map((c) => ({
    courseId: c.id,
    title: c.title,
    estHours: c.estHours ?? 4,
    progressFraction: c.progress.total > 0 ? c.progress.completed / c.progress.total : 0,
    examDate: examByCourse.get(c.id) ?? null,
  }))
}

/**
 * Get the currently active saved weekly study plan.
 */
export function getSavedStudyPlan(opts: { db?: LearningHubDB } = {}): StudyPlanRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(studyPlans).orderBy(asc(studyPlans.id)).limit(1).all()
  return row ?? null
}

/**
 * Save or update the single weekly study plan template.
 */
export function saveStudyPlan(
  input: SaveStudyPlanInput,
  opts: { db?: LearningHubDB } = {},
): StudyPlanRow {
  const db = opts.db ?? getDb()
  const nowIso = new Date().toISOString()
  const existing = getSavedStudyPlan({ db })

  const values = {
    weeklyMinutes: input.weeklyMinutes,
    restDay: input.restDay ?? null,
    plan: input.plan as unknown as Record<string, unknown>,
    updatedAt: nowIso,
  }

  if (existing) {
    const [row] = db
      .update(studyPlans)
      .set(values)
      .where(eq(studyPlans.id, existing.id))
      .returning()
      .all()
    return row!
  }

  const [row] = db
    .insert(studyPlans)
    .values({ ...values, createdAt: nowIso })
    .returning()
    .all()
  return row!
}

/**
 * Generate a new weekly plan from live course progress and save it.
 */
export function generateAndSaveStudyPlan(
  input: { weeklyMinutes: number; restDay?: number | null },
  opts: { db?: LearningHubDB } = {},
): { plan: WeeklyPlan; record: StudyPlanRow } {
  const db = opts.db ?? getDb()
  const courses = getPlanCourses({ db })
  const plan = buildStudyPlan(courses, input)
  const record = saveStudyPlan(
    { weeklyMinutes: input.weeklyMinutes, restDay: input.restDay, plan },
    { db },
  )
  return { plan, record }
}

/**
 * Delete all saved study plans.
 */
export function deleteStudyPlan(opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(studyPlans).run()
  return (res?.changes ?? 0) > 0
}

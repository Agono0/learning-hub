/**
 * Learning repository — everything a learner does inside a course: the
 * catalog, the course overview, the lesson player, practice bookkeeping,
 * project checklists, the final exam and the certificate.
 *
 * Decisions (locking, next lesson, eligibility) are pure functions from
 * @learning-hub/core/curriculum; this module only gathers facts and persists.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  certificateCode,
  certificateEligibility,
  courseProgress,
  isLessonLocked,
  lockedSkills,
  nextLessonId,
  type LessonFacts,
  type LessonStatus,
  type LhcfCourse,
} from '@learning-hub/core/curriculum'
import type { Exercise } from '@learning-hub/core/practice'
import { getDb, type LearningHubDB } from '../index'
import {
  cards,
  certificates,
  courseExamAttempts,
  courseProjectStages,
  courses,
  lessonProgress,
  lessons,
  mastery,
  skillEdges,
  tracks,
  units,
} from '../schema'
import { withTransaction } from '../transaction'

const now = () => new Date().toISOString()

// ─── facts gathering ────────────────────────────────────────────────────────

interface LessonRow {
  id: number
  unitId: number
  slug: string | null
  title: string
  type: string
  objective: string | null
  estMinutes: number | null
  order: number
  skillIds: number[]
  status: LessonStatus
}

/** All lessons of a course in study order, with their status and skill ids. */
function courseLessons(
  db: LearningHubDB,
  courseId: number,
): { units: (typeof units.$inferSelect)[]; lessons: LessonRow[] } {
  const courseUnits = db
    .select()
    .from(units)
    .where(eq(units.courseId, courseId))
    .orderBy(units.order)
    .all()
  if (!courseUnits.length) return { units: courseUnits, lessons: [] }
  const rows = db
    .select()
    .from(lessons)
    .where(
      inArray(
        lessons.unitId,
        courseUnits.map((u) => u.id),
      ),
    )
    .all()
  const progress = rows.length
    ? db
        .select()
        .from(lessonProgress)
        .where(
          inArray(
            lessonProgress.lessonId,
            rows.map((l) => l.id),
          ),
        )
        .all()
    : []
  const statusOf = new Map(progress.map((p) => [p.lessonId, p.status]))
  const unitOrder = new Map(courseUnits.map((u) => [u.id, u.order]))
  const ordered = rows
    .map((l) => ({
      id: l.id,
      unitId: l.unitId,
      slug: l.slug,
      title: l.title,
      type: l.type,
      objective: l.objective,
      estMinutes: l.estMinutes,
      order: l.order,
      // skill ids: the lesson's primary skill plus none else stored as rows (LHCF skills live in content)
      skillIds: l.skillId !== null ? [l.skillId] : [],
      status: (l.completedAt ? 'completed' : (statusOf.get(l.id) ?? 'not_started')) as LessonStatus,
    }))
    .sort((a, b) => unitOrder.get(a.unitId)! - unitOrder.get(b.unitId)! || a.order - b.order)
  return { units: courseUnits, lessons: ordered }
}

/** Locked skill ids given the current mastery (whole skill graph). */
function currentLockedSkills(db: LearningHubDB): Set<number> {
  const prereqs = new Map<number, number[]>()
  for (const e of db.select().from(skillEdges).all()) {
    prereqs.set(e.toSkillId, [...(prereqs.get(e.toSkillId) ?? []), e.fromSkillId])
  }
  const pKnown = new Map(
    db
      .select()
      .from(mastery)
      .all()
      .map((m) => [m.skillId, m.pKnown]),
  )
  return lockedSkills(prereqs, pKnown)
}

function stageStats(db: LearningHubDB, courseId: number) {
  const stages = db
    .select()
    .from(courseProjectStages)
    .where(eq(courseProjectStages.courseId, courseId))
    .orderBy(courseProjectStages.order)
    .all()
  return { stages, total: stages.length, completed: stages.filter((s) => s.completedAt).length }
}

function bestExamScore(db: LearningHubDB, courseId: number): number | null {
  const best = db
    .select({ score: courseExamAttempts.score })
    .from(courseExamAttempts)
    .where(eq(courseExamAttempts.courseId, courseId))
    .orderBy(desc(courseExamAttempts.score))
    .limit(1)
    .get()
  return best?.score ?? null
}

// ─── catalog ────────────────────────────────────────────────────────────────

/** One course card on the catalog. */
export interface CatalogCourse {
  id: number
  slug: string | null
  title: string
  subtitle: string | null
  emoji: string | null
  level: string | null
  estHours: number | null
  track: { id: number; title: string; emoji: string | null }
  progress: { completed: number; total: number; fraction: number }
  nextLesson: { id: number; title: string } | null
  certified: boolean
  /** Imported from LHCF (has theory, exercises, export). */
  lhcf: boolean
  updatedAt: string | null
}

/** Every course with progress — the catalog / "continue learning" rail. */
export function listCourses(database?: LearningHubDB): CatalogCourse[] {
  const db = database ?? getDb()
  const locked = currentLockedSkills(db)
  const certified = new Set(
    db
      .select({ courseId: certificates.courseId })
      .from(certificates)
      .all()
      .map((c) => c.courseId),
  )
  const rows = db
    .select({ course: courses, track: tracks })
    .from(courses)
    .innerJoin(tracks, eq(courses.trackId, tracks.id))
    .all()
  return rows.map(({ course, track }) => {
    const { lessons: ls } = courseLessons(db, course.id)
    const nextId = nextLessonId(ls as LessonFacts[], locked)
    const next = ls.find((l) => l.id === nextId)
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      emoji: course.emoji,
      level: course.level,
      estHours: course.estHours,
      track: { id: track.id, title: track.title, emoji: track.emoji },
      progress: courseProgress(ls),
      nextLesson: next ? { id: next.id, title: next.title } : null,
      certified: certified.has(course.id),
      lhcf: course.spec !== null,
      updatedAt: course.updatedAt ?? course.createdAt,
    }
  })
}

// ─── course overview ────────────────────────────────────────────────────────

export interface CourseOverview {
  course: CatalogCourse & {
    description: string | null
    outcomes: string[]
    prerequisites: string[]
    audience: string | null
    tags: string[]
    language: string | null
  }
  modules: {
    id: number
    slug: string | null
    title: string
    description: string | null
    lessons: {
      id: number
      title: string
      type: string
      objective: string | null
      estMinutes: number | null
      status: LessonStatus
      locked: boolean
      exercises: number
    }[]
  }[]
  projects: {
    slug: string
    title: string
    stages: (typeof courseProjectStages.$inferSelect)[]
  }[]
  exam: {
    questions: number
    passScore: number
    minutes: number | null
    bestScore: number | null
    attempts: number
  } | null
  certificate: {
    eligible: boolean
    missing: string[]
    issued: typeof certificates.$inferSelect | null
  }
}

/** Everything the course page shows. Null when the course does not exist. */
export function getCourseOverview(
  courseId: number,
  database?: LearningHubDB,
): CourseOverview | null {
  const db = database ?? getDb()
  const base = listCourses(db).find((c) => c.id === courseId)
  if (!base) return null
  const row = db.select().from(courses).where(eq(courses.id, courseId)).get()!
  const spec = row.spec as LhcfCourse | null
  const locked = currentLockedSkills(db)
  const { units: courseUnits, lessons: ls } = courseLessons(db, courseId)
  const exerciseCount = new Map(
    db
      .select({ id: lessons.id, content: lessons.content })
      .from(lessons)
      .where(inArray(lessons.id, ls.length ? ls.map((l) => l.id) : [-1]))
      .all()
      .map((l) => [l.id, l.content?.cardIds?.length ?? 0]),
  )
  const { stages, total: stagesTotal, completed: stagesCompleted } = stageStats(db, courseId)
  const projects = [...new Set(stages.map((s) => s.projectSlug))].map((slug) => ({
    slug,
    title: stages.find((s) => s.projectSlug === slug)!.projectTitle,
    stages: stages.filter((s) => s.projectSlug === slug),
  }))
  const attempts = db
    .select({ id: courseExamAttempts.id })
    .from(courseExamAttempts)
    .where(eq(courseExamAttempts.courseId, courseId))
    .all().length
  const best = bestExamScore(db, courseId)
  const issued =
    db.select().from(certificates).where(eq(certificates.courseId, courseId)).get() ?? null
  const rules = spec?.certificate ?? {
    minLessonCompletion: 1,
    requireFinalExam: true,
    requireProjects: true,
  }
  const eligibility = certificateEligibility({
    rules,
    progress: courseProgress(ls),
    hasFinalExam: Boolean(spec?.finalExam),
    bestExamScore: best,
    examPassScore: spec?.finalExam?.passScore ?? 0.8,
    stagesTotal,
    stagesCompleted,
  })

  return {
    course: {
      ...base,
      description: row.description,
      outcomes: spec?.outcomes ?? [],
      prerequisites: spec?.prerequisites ?? [],
      audience: spec?.audience ?? null,
      tags: spec?.tags ?? [],
      language: row.language,
    },
    modules: courseUnits.map((u) => ({
      id: u.id,
      slug: u.slug,
      title: u.title,
      description: u.description,
      lessons: ls
        .filter((l) => l.unitId === u.id)
        .map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          objective: l.objective,
          estMinutes: l.estMinutes,
          status: l.status,
          locked: isLessonLocked(l as LessonFacts, locked),
          exercises: exerciseCount.get(l.id) ?? 0,
        })),
    })),
    projects,
    exam: spec?.finalExam
      ? {
          questions: spec.finalExam.exercises.length,
          passScore: spec.finalExam.passScore,
          minutes: spec.finalExam.minutes ?? null,
          bestScore: best,
          attempts,
        }
      : null,
    certificate: { ...eligibility, issued },
  }
}

// ─── lesson player ──────────────────────────────────────────────────────────

export interface LessonView {
  lesson: typeof lessons.$inferSelect
  course: { id: number; title: string; emoji: string | null }
  module: { id: number; title: string }
  status: LessonStatus
  locked: boolean
  /** The lesson's exercise cards, in lesson order (content + id). */
  exercises: { cardId: number; exercise: Exercise; due: string; reps: number }[]
  progress: typeof lessonProgress.$inferSelect | null
  prevLessonId: number | null
  nextLessonId: number | null
}

/** Everything the lesson player needs. Null when the lesson does not exist. */
export function getLessonView(lessonId: number, database?: LearningHubDB): LessonView | null {
  const db = database ?? getDb()
  const lesson = db.select().from(lessons).where(eq(lessons.id, lessonId)).get()
  if (!lesson) return null
  const unit = db.select().from(units).where(eq(units.id, lesson.unitId)).get()!
  const course = db.select().from(courses).where(eq(courses.id, unit.courseId)).get()!
  const { lessons: ls } = courseLessons(db, course.id)
  const index = ls.findIndex((l) => l.id === lessonId)
  const cardIds = lesson.content?.cardIds ?? []
  const cardRows = cardIds.length
    ? db.select().from(cards).where(inArray(cards.id, cardIds)).all()
    : []
  const byId = new Map(cardRows.map((c) => [c.id, c]))
  const facts = ls[index]!
  return {
    lesson,
    course: { id: course.id, title: course.title, emoji: course.emoji },
    module: { id: unit.id, title: unit.title },
    status: facts.status,
    locked: isLessonLocked(facts as LessonFacts, currentLockedSkills(db)),
    exercises: cardIds
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c?.content.exercise) && !c!.suspended)
      .map((c) => ({ cardId: c.id, exercise: c.content.exercise!, due: c.due, reps: c.reps })),
    progress:
      db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, lessonId)).get() ?? null,
    prevLessonId: ls[index - 1]?.id ?? null,
    nextLessonId: ls[index + 1]?.id ?? null,
  }
}

// ─── progress events ────────────────────────────────────────────────────────

/** Mark a lesson as started (idempotent) and optionally add study time. */
export function startLesson(lessonId: number, timeSpentSec = 0, database?: LearningHubDB): void {
  withTransaction((tx) => {
    const stamp = now()
    const existing = tx
      .select()
      .from(lessonProgress)
      .where(eq(lessonProgress.lessonId, lessonId))
      .get()
    if (existing) {
      tx.update(lessonProgress)
        .set({
          timeSpentSec: existing.timeSpentSec + Math.max(0, Math.round(timeSpentSec)),
          updatedAt: stamp,
        })
        .where(eq(lessonProgress.id, existing.id))
        .run()
    } else {
      tx.insert(lessonProgress)
        .values({
          lessonId,
          startedAt: stamp,
          updatedAt: stamp,
          timeSpentSec: Math.max(0, Math.round(timeSpentSec)),
        })
        .run()
    }
  }, database)
}

/**
 * Complete a lesson (keeps `lessons.completedAt` in sync for older readers).
 * Returns true only the FIRST time — callers award XP exactly once.
 */
export function completeLesson(
  lessonId: number,
  opts: { reflections?: string[]; timeSpentSec?: number } = {},
  database?: LearningHubDB,
): boolean {
  return withTransaction((tx) => {
    const stamp = now()
    const lesson = tx.select().from(lessons).where(eq(lessons.id, lessonId)).get()
    if (!lesson) return false
    const firstTime = !lesson.completedAt
    const existing = tx
      .select()
      .from(lessonProgress)
      .where(eq(lessonProgress.lessonId, lessonId))
      .get()
    const values = {
      status: 'completed' as const,
      completedAt: existing?.completedAt ?? stamp,
      reflections: opts.reflections ?? existing?.reflections ?? null,
      timeSpentSec: (existing?.timeSpentSec ?? 0) + Math.max(0, Math.round(opts.timeSpentSec ?? 0)),
      updatedAt: stamp,
    }
    if (existing)
      tx.update(lessonProgress).set(values).where(eq(lessonProgress.id, existing.id)).run()
    else
      tx.insert(lessonProgress)
        .values({ ...values, lessonId, startedAt: stamp })
        .run()
    if (firstTime)
      tx.update(lessons).set({ completedAt: stamp }).where(eq(lessons.id, lessonId)).run()
    return firstTime
  }, database)
}

/** Re-open a completed lesson (status back to in progress). */
export function reopenLesson(lessonId: number, database?: LearningHubDB): void {
  withTransaction((tx) => {
    tx.update(lessonProgress)
      .set({ status: 'in_progress', completedAt: null, updatedAt: now() })
      .where(eq(lessonProgress.lessonId, lessonId))
      .run()
    tx.update(lessons).set({ completedAt: null }).where(eq(lessons.id, lessonId)).run()
  }, database)
}

/** The lesson an LHCF exercise card belongs to (via its source key), or null. */
export function lessonIdForCard(cardId: number, database?: LearningHubDB): number | null {
  const db = database ?? getDb()
  const card = db
    .select({ sourceKey: cards.sourceKey })
    .from(cards)
    .where(eq(cards.id, cardId))
    .get()
  const m = card?.sourceKey ? /^lhcf:([^/]+)\/([^/]+)\//.exec(card.sourceKey) : null
  if (!m) return null
  const course = db.select({ id: courses.id }).from(courses).where(eq(courses.slug, m[1]!)).get()
  if (!course) return null
  const row = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .where(and(eq(units.courseId, course.id), eq(lessons.slug, m[2]!)))
    .get()
  return row?.id ?? null
}

/** Count one practice attempt on a lesson (starts the lesson if needed). */
export function recordLessonAttempt(
  lessonId: number,
  correct: boolean,
  database?: LearningHubDB,
): void {
  withTransaction((tx) => {
    const stamp = now()
    const existing = tx
      .select()
      .from(lessonProgress)
      .where(eq(lessonProgress.lessonId, lessonId))
      .get()
    if (existing) {
      tx.update(lessonProgress)
        .set({
          attempts: existing.attempts + 1,
          correct: existing.correct + (correct ? 1 : 0),
          updatedAt: stamp,
        })
        .where(eq(lessonProgress.id, existing.id))
        .run()
    } else {
      tx.insert(lessonProgress)
        .values({
          lessonId,
          startedAt: stamp,
          updatedAt: stamp,
          attempts: 1,
          correct: correct ? 1 : 0,
        })
        .run()
    }
  }, database)
}

// ─── projects, exam, certificate ────────────────────────────────────────────

/** Update a stage's ticked checklist; the stage completes when every item is ticked. */
export function setStageChecks(
  stageId: number,
  checked: boolean[],
  database?: LearningHubDB,
): typeof courseProjectStages.$inferSelect | null {
  return withTransaction((tx) => {
    const stage = tx
      .select()
      .from(courseProjectStages)
      .where(eq(courseProjectStages.id, stageId))
      .get()
    if (!stage) return null
    const normalized = stage.checklist.map((_, i) => Boolean(checked[i]))
    const done = stage.checklist.length === 0 ? Boolean(checked[0]) : normalized.every(Boolean)
    const [row] = tx
      .update(courseProjectStages)
      .set({ checked: normalized, completedAt: done ? (stage.completedAt ?? now()) : null })
      .where(eq(courseProjectStages.id, stageId))
      .returning()
      .all()
    return row ?? null
  }, database)
}

/** Store a final-exam attempt (append-only) from per-question scores. */
export function recordExamAttempt(
  courseId: number,
  results: number[],
  passScore: number,
  database?: LearningHubDB,
): { score: number; passed: boolean } {
  const score = results.length ? results.reduce((a, b) => a + b, 0) / results.length : 0
  const passed = score >= passScore
  withTransaction((tx) => {
    tx.insert(courseExamAttempts).values({ courseId, score, passed, results, takenAt: now() }).run()
  }, database)
  return { score, passed }
}

/**
 * Issue (or return the existing) certificate when the course rules are met.
 * Returns `{ issued: null, missing }` when not yet eligible.
 */
export function issueCertificate(
  courseId: number,
  database?: LearningHubDB,
): { issued: typeof certificates.$inferSelect | null; missing: string[] } {
  const db = database ?? getDb()
  const overview = getCourseOverview(courseId, db)
  if (!overview) return { issued: null, missing: ['Course not found'] }
  if (overview.certificate.issued) return { issued: overview.certificate.issued, missing: [] }
  if (!overview.certificate.eligible) return { issued: null, missing: overview.certificate.missing }
  const issued = withTransaction((tx) => {
    const [row] = tx
      .insert(certificates)
      .values({
        courseId,
        code: certificateCode(),
        issuedAt: now(),
        snapshot: {
          title: overview.course.title,
          level: overview.course.level,
          lessons: overview.course.progress.total,
          estHours: overview.course.estHours,
          examScore: overview.exam?.bestScore ?? null,
          projects: overview.projects.map((p) => p.title),
        },
      })
      .returning()
      .all()
    return row!
  }, db)
  return { issued, missing: [] }
}

/**
 * The learner journey through an imported course, end to end at the
 * repository level: catalog → overview → lesson → practice → completion →
 * project stages → final exam → certificate.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { parseCurriculum } from '@learning-hub/core/curriculum'
import { initDb, getRawDb, type LearningHubDB } from '../src/index'
import { lessons } from '../src/schema'
import {
  completeLesson,
  getCourseOverview,
  getLessonView,
  importCurriculum,
  issueCertificate,
  lessonIdForCard,
  listCourses,
  recordExamAttempt,
  recordLessonAttempt,
  reopenLesson,
  setStageChecks,
  startLesson,
} from '../src/repos'

let dir: string
let db: LearningHubDB
let courseId: number

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lh-learning-'))
  db = await initDb({ path: join(dir, 'test.db') })
  const file = resolve(__dirname, '../../../curricula/examples/sql-essentials.yaml')
  const parsed = parseCurriculum(readFileSync(file, 'utf8'), { filename: file })
  if (!parsed.ok) throw new Error('fixture invalid')
  courseId = importCurriculum(parsed.course, db).courseId
})

afterAll(() => {
  getRawDb().close()
  rmSync(dir, { recursive: true, force: true })
})

describe('learner journey', () => {
  it('lists the course on the catalog with 0% progress and a next lesson', () => {
    const [course] = listCourses(db)
    expect(course).toMatchObject({
      id: courseId,
      slug: 'sql-essentials',
      lhcf: true,
      certified: false,
    })
    expect(course!.progress).toEqual({ completed: 0, total: 4, fraction: 0 })
    expect(course!.nextLesson?.title).toBe('SELECT and FROM')
    expect(course!.track.title).toBe('Data')
  })

  it('builds the overview: modules, soft-locks from prerequisites, projects, exam, certificate status', () => {
    const o = getCourseOverview(courseId, db)!
    expect(o.modules.map((m) => m.lessons.length)).toEqual([2, 2])
    expect(o.course.outcomes).toHaveLength(3)
    // fresh learner: skills that require earlier skills are soft-locked
    expect(o.modules[0]!.lessons[0]!.locked).toBe(false)
    expect(o.modules[1]!.lessons[0]!.locked).toBe(true)
    expect(o.projects[0]!.stages).toHaveLength(2)
    expect(o.exam).toMatchObject({ questions: 3, passScore: 0.75, bestScore: null })
    expect(o.certificate.eligible).toBe(false)
    expect(o.certificate.missing).toEqual([
      'Complete 4 more lesson(s)',
      'Take the final exam',
      'Finish 2 project stage(s)',
    ])
  })

  it('opens a lesson with theory and its exercise cards, plus neighbours', () => {
    const first = getCourseOverview(courseId, db)!.modules[0]!.lessons[0]!
    const view = getLessonView(first.id, db)!
    expect(view.status).toBe('not_started')
    expect(view.exercises.map((e) => e.exercise.type)).toEqual(['parsons', 'typein'])
    expect(view.prevLessonId).toBeNull()
    expect(view.nextLessonId).not.toBeNull()
    expect(lessonIdForCard(view.exercises[0]!.cardId, db)).toBe(first.id)
  })

  it('tracks start, time, attempts and completion (XP flag only the first time)', () => {
    const id = getCourseOverview(courseId, db)!.modules[0]!.lessons[0]!.id
    startLesson(id, 30, db)
    startLesson(id, 15, db)
    recordLessonAttempt(id, true, db)
    recordLessonAttempt(id, false, db)
    expect(getLessonView(id, db)!.progress).toMatchObject({
      status: 'in_progress',
      timeSpentSec: 45,
      attempts: 2,
      correct: 1,
    })
    expect(completeLesson(id, { reflections: ['because'] }, db)).toBe(true)
    expect(completeLesson(id, {}, db)).toBe(false)
    expect(db.select().from(lessons).where(eq(lessons.id, id)).get()!.completedAt).not.toBeNull()
    expect(listCourses(db)[0]!.progress.completed).toBe(1)
    reopenLesson(id, db)
    expect(getLessonView(id, db)!.status).toBe('in_progress')
    completeLesson(id, {}, db)
  })

  it('completes project stages when every checklist item is ticked', () => {
    const stage = getCourseOverview(courseId, db)!.projects[0]!.stages[0]!
    expect(setStageChecks(stage.id, [true, true, false], db)!.completedAt).toBeNull()
    expect(setStageChecks(stage.id, [true, true, true], db)!.completedAt).not.toBeNull()
  })

  it('issues the certificate only when lessons, exam and projects are all done', () => {
    const o = getCourseOverview(courseId, db)!
    expect(issueCertificate(courseId, db).issued).toBeNull()

    for (const m of o.modules) for (const l of m.lessons) completeLesson(l.id, {}, db)
    for (const p of o.projects)
      for (const s of p.stages)
        setStageChecks(
          s.id,
          s.checklist.map(() => true),
          db,
        )
    expect(recordExamAttempt(courseId, [1, 0, 0], 0.75, db).passed).toBe(false)
    expect(issueCertificate(courseId, db).missing).toEqual(['Pass the final exam (75% needed)'])
    expect(recordExamAttempt(courseId, [1, 1, 1], 0.75, db).passed).toBe(true)

    const { issued } = issueCertificate(courseId, db)
    expect(issued?.code).toMatch(/^LH-/)
    expect(issued?.snapshot).toMatchObject({ title: 'SQL Essentials', examScore: 1 })
    // idempotent: same certificate on a second call
    expect(issueCertificate(courseId, db).issued?.code).toBe(issued?.code)
    expect(listCourses(db)[0]!.certified).toBe(true)
  })
})

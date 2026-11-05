/**
 * The curriculum import contract: idempotent upserts keyed by slugs, exercises
 * as real cards whose FSRS state survives re-imports, and exact round-trips.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, like } from 'drizzle-orm'
import { parseCurriculum, type LhcfCourse } from '@learning-hub/core/curriculum'
import { initDb, getRawDb, type LearningHubDB } from '../src/index'
import {
  cards,
  courseProjectStages,
  courses,
  lessons,
  mastery,
  skillEdges,
  skills,
  units,
} from '../src/schema'
import { exerciseSourceKey, exportCurriculum, importCurriculum } from '../src/repos'

const examples = resolve(__dirname, '../../../curricula/examples')
function example(file: string): LhcfCourse {
  const r = parseCurriculum(readFileSync(join(examples, file), 'utf8'), { filename: file })
  if (!r.ok) throw new Error(`fixture ${file} invalid: ${JSON.stringify(r.errors)}`)
  return r.course
}

let dir: string
let db: LearningHubDB

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lh-curriculum-'))
  // initDb creates every table from schema.ts — no drizzle-kit push needed
  db = await initDb({ path: join(dir, 'test.db') })
})

afterAll(() => {
  getRawDb().close()
  rmSync(dir, { recursive: true, force: true })
})

describe('importCurriculum', () => {
  it('imports a course: tree, exercise cards, skills graph, mastery, project stages', () => {
    const course = example('sql-essentials.yaml')
    const report = importCurriculum(course, db)
    expect(report.created).toBe(true)
    expect(report.modules.added).toBe(2)
    expect(report.lessons.added).toBe(4)
    expect(report.exercises.added).toBe(
      course.modules.flatMap((m) => m.lessons).reduce((n, l) => n + l.exercises.length, 0),
    )
    expect(report.skills.added).toBe(4)
    expect(report.skills.edges).toBe(3)
    expect(report.stages.added).toBe(2)

    const row = db.select().from(courses).where(eq(courses.id, report.courseId)).get()!
    expect(row.slug).toBe('sql-essentials')
    expect(row.deckId).toBe(report.deckId)

    const exerciseCards = db
      .select()
      .from(cards)
      .where(like(cards.sourceKey, 'lhcf:sql-essentials/%'))
      .all()
    expect(exerciseCards.every((c) => c.type === 'exercise' && c.deckId === report.deckId)).toBe(
      true,
    )
    expect(exerciseCards.every((c) => c.skillId !== null)).toBe(true)

    const lesson = db.select().from(lessons).where(eq(lessons.slug, 'where-order-limit')).get()!
    expect(lesson.bloomVerb).toBe('use')
    expect(lesson.content?.workedExamples).toHaveLength(1)
    expect(lesson.content?.cardIds).toHaveLength(3)

    const skillIds = db
      .select({ id: skills.id })
      .from(skills)
      .all()
      .map((s) => s.id)
    expect(
      db
        .select()
        .from(mastery)
        .all()
        .filter((m) => skillIds.includes(m.skillId)),
    ).toHaveLength(4)
    expect(db.select().from(skillEdges).all().length).toBeGreaterThanOrEqual(3)
  })

  it('re-importing the same course is idempotent (no duplicates)', () => {
    const before = db.select().from(cards).all().length
    const report = importCurriculum(example('sql-essentials.yaml'), db)
    expect(report.created).toBe(false)
    expect(report.lessons).toEqual({ added: 0, updated: 4, removed: 0 })
    expect(report.exercises.added).toBe(0)
    expect(db.select().from(cards).all().length).toBe(before)
    expect(db.select().from(courses).where(eq(courses.slug, 'sql-essentials')).all()).toHaveLength(
      1,
    )
  })

  it('keeps FSRS state on re-import and suspends removed exercises', () => {
    const key = exerciseSourceKey('sql-essentials', 'select-from', undefined, 0)
    const card = db.select().from(cards).where(eq(cards.sourceKey, key)).get()!
    // pretend it was reviewed
    db.update(cards).set({ reps: 5, stability: 12.5, state: 2 }).where(eq(cards.id, card.id)).run()

    const changed = structuredClone(example('sql-essentials.yaml'))
    const lesson = changed.modules[0]!.lessons[0]!
    lesson.exercises[0] = {
      ...lesson.exercises[0]!,
      prompt: 'Arrange the improved query.',
    } as (typeof lesson.exercises)[0]
    lesson.exercises.pop() // remove the second exercise
    const report = importCurriculum(changed, db)
    expect(report.exercises.suspended).toBe(1)

    const after = db.select().from(cards).where(eq(cards.id, card.id)).get()!
    expect(after.reps).toBe(5)
    expect(after.stability).toBe(12.5)
    expect(after.content.exercise?.prompt).toBe('Arrange the improved query.')
    const removed = db
      .select()
      .from(cards)
      .where(eq(cards.sourceKey, exerciseSourceKey('sql-essentials', 'select-from', undefined, 1)))
      .get()!
    expect(removed.suspended).toBe(true)
  })

  it('preserves ticked project checklist items when the checklist is unchanged', () => {
    const stage = db
      .select()
      .from(courseProjectStages)
      .where(eq(courseProjectStages.stageSlug, 'top-products'))
      .get()!
    db.update(courseProjectStages)
      .set({ checked: [true, false, true] })
      .where(eq(courseProjectStages.id, stage.id))
      .run()
    importCurriculum(example('sql-essentials.yaml'), db)
    expect(
      db.select().from(courseProjectStages).where(eq(courseProjectStages.id, stage.id)).get()!
        .checked,
    ).toEqual([true, false, true])
  })

  it('removes modules and lessons that left the course', () => {
    const smaller = structuredClone(example('sql-essentials.yaml'))
    smaller.modules = smaller.modules.slice(0, 1)
    const report = importCurriculum(smaller, db)
    expect(report.modules.removed).toBe(1)
    expect(report.lessons.removed).toBe(2)
    const courseId = report.courseId
    expect(db.select().from(units).where(eq(units.courseId, courseId)).all()).toHaveLength(1)
  })

  it('reuses skills by name across courses and groups courses by track', () => {
    const a = importCurriculum(example('learning-how-to-learn.md'), db)
    const b = importCurriculum(example('javascript-functions.json'), db)
    expect(a.trackId).not.toBe(b.trackId) // "Meta-learning" vs "Programming"
    const again = importCurriculum(example('learning-how-to-learn.md'), db)
    expect(again.skills.reused).toBe(4)
    expect(again.skills.added).toBe(0)
  })
})

describe('exportCurriculum', () => {
  it('round-trips an imported course exactly', () => {
    const course = example('javascript-functions.json')
    const { courseId } = importCurriculum(course, db)
    expect(exportCurriculum(courseId, db)).toEqual(course)
  })

  it('returns null for unknown courses', () => {
    expect(exportCurriculum(999_999, db)).toBeNull()
  })
})

describe('deleteCourse', () => {
  it('removes the course, its lessons and deck cards but keeps shared skills', async () => {
    const { deleteCourse } = await import('../src/repos')
    const { decks } = await import('../src/schema')
    const { courseId, deckId } = importCurriculum(example('learning-how-to-learn.md'), db)
    const skillsBefore = db.select().from(skills).all().length
    expect(deleteCourse(courseId, db)).toBe(true)
    expect(db.select().from(courses).where(eq(courses.id, courseId)).get()).toBeUndefined()
    expect(db.select().from(decks).where(eq(decks.id, deckId)).get()).toBeUndefined()
    expect(
      db.select().from(cards).where(like(cards.sourceKey, 'lhcf:learning-how-to-learn/%')).all(),
    ).toHaveLength(0)
    expect(db.select().from(skills).all().length).toBe(skillsBefore)
    expect(deleteCourse(courseId, db)).toBe(false)
  })
})

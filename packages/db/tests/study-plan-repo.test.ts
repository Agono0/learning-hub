import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteStudyPlan,
  examDates,
  generateAndSaveStudyPlan,
  getPlanCourses,
  getSavedStudyPlan,
  initDb,
  saveStudyPlan,
  setDb,
  studyPlans,
  type LearningHubDB,
} from '../src/index'

let testDb: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-study-plan-'))
  testDb = await initDb({ path: join(tmp, 'study-plan.db') })
  setDb(testDb)
})

beforeEach(() => {
  testDb.delete(studyPlans).run()
  testDb.delete(examDates).run()
})

afterAll(() => {
  try {
    ;(testDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('study-plan repository', () => {
  it('saves, retrieves, updates, and deletes weekly study plans', () => {
    const initial = getSavedStudyPlan()
    expect(initial).toBeNull()

    const saved = saveStudyPlan({
      weeklyMinutes: 180,
      restDay: 0,
      plan: {
        weeks: 4,
        weeklyMinutes: 180,
        restDay: 0,
        blocks: [
          { day: 1, minutes: 60, courseId: null, label: 'Review' },
          { day: 2, minutes: 60, courseId: null, label: 'Theory' },
          { day: 3, minutes: 60, courseId: null, label: 'Practice' },
        ],
      },
    })

    expect(saved.id).toBeGreaterThan(0)
    expect(saved.weeklyMinutes).toBe(180)
    expect(saved.restDay).toBe(0)

    const retrieved = getSavedStudyPlan()
    expect(retrieved).not.toBeNull()
    expect(retrieved?.id).toBe(saved.id)

    // Update existing plan
    const updated = saveStudyPlan({
      weeklyMinutes: 240,
      restDay: 6,
      plan: {
        weeks: 3,
        weeklyMinutes: 240,
        restDay: 6,
        blocks: [],
      },
    })
    expect(updated.id).toBe(saved.id)
    expect(updated.weeklyMinutes).toBe(240)
    expect(updated.restDay).toBe(6)

    // Delete
    const deleted = deleteStudyPlan()
    expect(deleted).toBe(true)
    expect(getSavedStudyPlan()).toBeNull()
  })

  it('generates and saves plan from current course catalog and exam dates', () => {
    const courses = getPlanCourses()
    expect(Array.isArray(courses)).toBe(true)

    const { plan, record } = generateAndSaveStudyPlan({
      weeklyMinutes: 200,
      restDay: 0,
    })

    expect(plan.weeklyMinutes).toBe(200)
    expect(record.weeklyMinutes).toBe(200)
    expect(getSavedStudyPlan()).not.toBeNull()
  })
})

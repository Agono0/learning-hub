import { describe, expect, it } from 'vitest'
import {
  certificateCode,
  certificateEligibility,
  courseProgress,
  isLessonLocked,
  lockedSkills,
  nextLessonId,
  type LessonFacts,
} from '../src/curriculum'

const lesson = (
  id: number,
  status: LessonFacts['status'],
  skillIds: number[] = [],
): LessonFacts => ({ id, status, skillIds })

describe('prerequisite soft-locking', () => {
  it('locks skills whose prerequisites are not mastered', () => {
    const prereqs = new Map([
      [2, [1]],
      [3, [2]],
    ])
    expect([...lockedSkills(prereqs, new Map([[1, 0.2]]))].sort()).toEqual([2, 3])
    expect([
      ...lockedSkills(
        prereqs,
        new Map([
          [1, 0.99],
          [2, 0.1],
        ]),
      ),
    ]).toEqual([3])
  })

  it('never locks a completed lesson', () => {
    const locked = new Set([5])
    expect(isLessonLocked(lesson(1, 'completed', [5]), locked)).toBe(false)
    expect(isLessonLocked(lesson(1, 'not_started', [5]), locked)).toBe(true)
  })
})

describe('next lesson', () => {
  it('prefers in-progress, then the first unlocked, then any unfinished', () => {
    expect(
      nextLessonId(
        [lesson(1, 'completed'), lesson(2, 'not_started'), lesson(3, 'in_progress')],
        new Set(),
      ),
    ).toBe(3)
    expect(
      nextLessonId([lesson(1, 'not_started', [9]), lesson(2, 'not_started')], new Set([9])),
    ).toBe(2)
    expect(nextLessonId([lesson(1, 'not_started', [9])], new Set([9]))).toBe(1)
    expect(nextLessonId([lesson(1, 'completed')], new Set())).toBeNull()
  })
})

describe('certificate', () => {
  const base = {
    rules: { minLessonCompletion: 1, requireFinalExam: true, requireProjects: true },
    progress: courseProgress([lesson(1, 'completed'), lesson(2, 'completed')]),
    hasFinalExam: true,
    bestExamScore: 0.9,
    examPassScore: 0.8,
    stagesTotal: 2,
    stagesCompleted: 2,
  }

  it('is eligible when every rule is met', () => {
    expect(certificateEligibility(base)).toEqual({ eligible: true, missing: [] })
  })

  it('lists exactly what is missing', () => {
    const r = certificateEligibility({
      ...base,
      progress: courseProgress([lesson(1, 'completed'), lesson(2, 'in_progress')]),
      bestExamScore: 0.5,
      stagesCompleted: 1,
    })
    expect(r.eligible).toBe(false)
    expect(r.missing).toEqual([
      'Complete 1 more lesson(s)',
      'Pass the final exam (80% needed)',
      'Finish 1 project stage(s)',
    ])
  })

  it('ignores exam/project rules when the course has none or they are disabled', () => {
    expect(
      certificateEligibility({
        ...base,
        hasFinalExam: false,
        bestExamScore: null,
        stagesTotal: 0,
        stagesCompleted: 0,
      }).eligible,
    ).toBe(true)
    expect(
      certificateEligibility({
        ...base,
        rules: { ...base.rules, requireProjects: false },
        stagesCompleted: 0,
      }).eligible,
    ).toBe(true)
  })

  it('makes readable codes without ambiguous characters', () => {
    const code = certificateCode()
    expect(code).toMatch(/^LH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(certificateCode(() => new Uint8Array(8))).toBe('LH-AAAA-AAAA')
  })
})

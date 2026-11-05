import { describe, expect, it } from 'vitest'
import { buildStudyPlan, type PlanCourse } from '../src/study-plan'
import { nextDay, toICS, type IcsEvent } from '../src/ics'

const course = (over: Partial<PlanCourse> = {}): PlanCourse => ({
  courseId: 1,
  title: 'Linear Algebra',
  estHours: 20,
  progressFraction: 0,
  examDate: null,
  ...over,
})

describe('buildStudyPlan', () => {
  it('splits minutes across study days, honoring the rest day', () => {
    const plan = buildStudyPlan([course()], { weeklyMinutes: 120, restDay: 0 })
    expect(plan.restDay).toBe(0)
    expect(plan.blocks.every((b) => b.day !== 0)).toBe(true)
    expect(plan.blocks.reduce((a, b) => a + b.minutes, 0)).toBe(120)
    expect(plan.weeks).toBe(10) // 20 h ÷ 2 h/week
  })

  it('splits minutes between courses proportionally to remaining hours', () => {
    const plan = buildStudyPlan(
      [course({ courseId: 1, estHours: 30 }), course({ courseId: 2, title: 'SQL', estHours: 10 })],
      { weeklyMinutes: 200 },
    )
    const byCourse = new Map<number, number>()
    for (const b of plan.blocks)
      byCourse.set(b.courseId!, (byCourse.get(b.courseId!) ?? 0) + b.minutes)
    const m1 = byCourse.get(1) ?? 0
    const m2 = byCourse.get(2) ?? 0
    expect(m1).toBeGreaterThan(m2) // 3× the remaining hours → clearly more minutes
    expect(m1 + m2).toBe(200)
  })

  it('doubles the weight of a course with an exam within 30 days', () => {
    const examSoon = new Date(Date.now() + 10 * 86_400_000).toISOString()
    const plan = buildStudyPlan(
      [
        course({ courseId: 1, estHours: 10 }),
        course({ courseId: 2, title: 'Exam course', estHours: 10, examDate: examSoon }),
      ],
      { weeklyMinutes: 100 },
    )
    const byCourse = new Map<number, number>()
    for (const b of plan.blocks)
      byCourse.set(b.courseId!, (byCourse.get(b.courseId!) ?? 0) + b.minutes)
    expect(byCourse.get(2)!).toBeGreaterThan(byCourse.get(1)!)
  })

  it('finished courses drop out; an empty plan becomes spaced review', () => {
    const plan = buildStudyPlan([course({ progressFraction: 1 })], { weeklyMinutes: 120 })
    expect(plan.weeks).toBe(0)
    expect(plan.blocks.every((b) => b.label === 'Spaced review')).toBe(true)
  })
})

describe('toICS', () => {
  const events: IcsEvent[] = [
    { date: '2026-11-10', title: 'Study: Linear Algebra', description: '45 min' },
    { date: '2026-11-11', title: 'Study: SQL, part 1; joins, etc.' },
  ]

  it('produces a valid all-day VCALENDAR with escaped text', () => {
    const ics = toICS(events, 'My; calendar')
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics).toContain('X-WR-CALNAME:My\\; calendar')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261110')
    expect(ics).toContain('DTEND;VALUE=DATE:20261111')
    expect(ics).toContain('SUMMARY:Study: SQL\\, part 1\\; joins\\, etc.')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('folds long lines with a leading space', () => {
    const long = toICS([{ date: '2026-11-10', title: 'x'.repeat(120) }])
    const lines = long.split('\r\n')
    expect(lines.some((l) => l.startsWith(' ') && l.length <= 75)).toBe(true)
  })

  it('nextDay crosses months and years', () => {
    expect(nextDay('20261130')).toBe('20261201')
    expect(nextDay('20261231')).toBe('20270101')
  })
})

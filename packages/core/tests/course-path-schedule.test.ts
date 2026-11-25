import { describe, expect, it } from 'vitest'
import { CoursePathInputError, buildCourseModel, planCourse } from '../src/course-path'
import { basicModel, course } from './course-path-fixtures'

const opts = { startDate: '2026-12-01', deadline: '2026-12-08', minutesPerDay: 60 }
const lessonMinutes = (r: ReturnType<typeof planCourse>, slug: string) =>
  r.days
    .flatMap((d) => d.entries)
    .filter((e) => e.kind === 'lesson' && e.lesson === slug)
    .reduce((s, e) => s + e.minutes, 0)

describe('planCourse', () => {
  it('fits a small course into a week and keeps prerequisites first', () => {
    const r = planCourse(basicModel(), {}, opts)
    expect(r.status).toBe('fits')
    expect(r.shortfallMinutes).toBe(0)
    expect(r.totalRemainingMinutes).toBe(140)
    expect(r.days).toHaveLength(7) // Dec 1..7, the day before the deadline is the last
    const firstDay = (slug: string) =>
      r.days.findIndex((d) => d.entries.some((e) => e.kind === 'lesson' && e.lesson === slug))
    expect(firstDay('l1')).toBeLessThanOrEqual(firstDay('l2'))
    expect(firstDay('l2')).toBeLessThanOrEqual(firstDay('l3'))
    for (const s of ['l1', 'l2', 'l3', 'l4'])
      expect(lessonMinutes(r, s)).toBe({ l1: 30, l2: 40, l3: 50, l4: 20 }[s])
  })

  it('never exceeds the daily budget', () => {
    const r = planCourse(basicModel(), {}, { ...opts, minutesPerDay: 25 })
    for (const d of r.days) expect(d.minutes).toBeLessThanOrEqual(25)
    for (const d of r.days) expect(d.entries.reduce((s, e) => s + e.minutes, 0)).toBe(d.minutes)
  })

  it('splits long lessons across days and marks the continuing part', () => {
    const r = planCourse(basicModel(), {}, { ...opts, minutesPerDay: 25 })
    const l3 = r.days
      .flatMap((d) => d.entries)
      .filter((e) => e.kind === 'lesson' && e.lesson === 'l3')
    expect(l3.length).toBeGreaterThan(1)
    expect(l3.slice(0, -1).every((e) => e.continues)).toBe(true)
    expect(l3[l3.length - 1]!.continues).toBeUndefined()
  })

  it('reports an honest shortfall when the deadline is too close', () => {
    const r = planCourse(
      basicModel(),
      {},
      { startDate: '2026-12-01', deadline: '2026-12-03', minutesPerDay: 30 },
    )
    expect(r.status).toBe('does-not-fit')
    expect(r.capacityMinutes).toBe(60)
    expect(r.shortfallMinutes).toBe(r.unfinished.reduce((s, u) => s + u.minutesLeft, 0))
    expect(r.shortfallMinutes).toBe(80) // 140 minutes of content, 60 available
    expect(r.reviewsScheduled).toBe(0) // no review time taken from content that does not fit
    expect(r.days.flatMap((d) => d.entries).some((e) => e.kind === 'review')).toBe(false)
    expect(r.unfinished.map((u) => u.lesson)).toContain('l3')
  })

  it('skips rest weekdays', () => {
    // 2026-12-05 is a Saturday, 2026-12-06 a Sunday
    const r = planCourse(basicModel(), {}, { ...opts, restWeekdays: [0, 6] })
    expect(r.days.map((d) => d.date)).not.toContain('2026-12-05')
    expect(r.days.map((d) => d.date)).not.toContain('2026-12-06')
    expect(r.days).toHaveLength(5)
  })

  it('leaves completed lessons out and counts only the rest', () => {
    const r = planCourse(basicModel(), { status: { l1: 'completed', l2: 'completed' } }, opts)
    expect(r.totalRemainingMinutes).toBe(70)
    expect(
      r.days.flatMap((d) => d.entries).some((e) => e.kind === 'lesson' && e.lesson === 'l1'),
    ).toBe(false)
  })

  it('puts a lesson after the lessons of an unmastered prerequisite even when it comes first in the course', () => {
    const m = buildCourseModel(
      course(
        [
          ['base', []],
          ['adv', ['base']],
        ],
        [
          [
            'm',
            [
              { slug: 'adv-lesson', est: 30, skills: ['adv'] },
              { slug: 'base-lesson', est: 30, skills: ['base'] },
            ],
          ],
        ],
      ),
    )
    const r = planCourse(
      m,
      {},
      { startDate: '2026-12-01', deadline: '2026-12-04', minutesPerDay: 30, reviewShare: 0 },
    )
    expect(r.days[0]!.entries[0]!.lesson).toBe('base-lesson')
    expect(r.days[1]!.entries[0]!.lesson).toBe('adv-lesson')
    expect(r.outOfOrder).toEqual([])
  })

  it('does not wait for a prerequisite the learner has mastered or that no lesson trains', () => {
    const m = buildCourseModel(
      course(
        [
          ['base', []],
          ['adv', ['base']],
        ],
        [['m', [{ slug: 'adv-lesson', est: 30, skills: ['adv'] }]]],
      ),
    )
    expect(planCourse(m, {}, opts).days[0]!.entries[0]!.lesson).toBe('adv-lesson')
    expect(planCourse(m, { mastery: { base: 0.95 } }, opts).status).toBe('fits')
  })

  it('flags a lesson placed out of order when prerequisite lessons wait on each other', () => {
    const m = buildCourseModel(
      course(
        [
          ['x', ['y']],
          ['y', ['x']],
        ],
        [
          [
            'm',
            [
              { slug: 'lx', est: 10, skills: ['x'] },
              { slug: 'ly', est: 10, skills: ['y'] },
            ],
          ],
        ],
      ),
    )
    const r = planCourse(m, {}, opts)
    expect(r.status).toBe('fits')
    expect(r.outOfOrder.map((o) => o.lesson)).toEqual(['lx'])
  })

  it('adds one spaced review per finished lesson, within the review share', () => {
    const r = planCourse(
      basicModel(),
      {},
      { startDate: '2026-12-01', deadline: '2026-12-31', minutesPerDay: 60 },
    )
    const reviews = r.days.flatMap((d) => d.entries).filter((e) => e.kind === 'review')
    expect(reviews.map((e) => e.lesson).sort()).toEqual(['l1', 'l2', 'l3', 'l4'])
    for (const d of r.days) {
      const rev = d.entries.filter((e) => e.kind === 'review').reduce((s, e) => s + e.minutes, 0)
      expect(rev).toBeLessThanOrEqual(18)
    }
    // a review comes after its lesson finished
    const dayOf = (kind: string, slug: string) =>
      r.days.findIndex((d) => d.entries.some((e) => e.kind === kind && e.lesson === slug))
    expect(dayOf('review', 'l1')).toBeGreaterThan(dayOf('lesson', 'l1'))
  })

  it('counts reviews that come due after the last study day', () => {
    const r = planCourse(
      basicModel(),
      {},
      { startDate: '2026-12-01', deadline: '2026-12-02', minutesPerDay: 200 },
    )
    expect(r.status).toBe('fits')
    expect(r.reviewsAfterLastStudyDay).toBe(4)
    expect(r.reviewsOverdueUnscheduled).toBe(0)
    expect(r.reviewsScheduled).toBe(0)
  })

  it('lists lessons that use the default estimate', () => {
    const m = buildCourseModel(course([['a', []]], [['m', [{ slug: 'x', skills: ['a'] }]]]))
    expect(planCourse(m, {}, opts).defaultEstimate).toEqual(['x'])
  })

  it('rejects bad input with a clear error', () => {
    const m = basicModel()
    expect(() => planCourse(m, {}, { ...opts, startDate: '12/01/2026' })).toThrow(
      CoursePathInputError,
    )
    expect(() => planCourse(m, {}, { ...opts, deadline: '2026-02-31' })).toThrow(
      /real calendar date/,
    )
    expect(() => planCourse(m, {}, { ...opts, minutesPerDay: 0 })).toThrow(/at least 1/)
    expect(() => planCourse(m, {}, { ...opts, minutesPerDay: Number.NaN })).toThrow(
      CoursePathInputError,
    )
  })

  it('returns an empty plan when the deadline is not after the start', () => {
    const r = planCourse(basicModel(), {}, { ...opts, deadline: opts.startDate })
    expect(r.days).toEqual([])
    expect(r.status).toBe('does-not-fit')
    expect(r.shortfallMinutes).toBe(140)
  })

  it('is deterministic', () => {
    const a = planCourse(basicModel(), { mastery: { a: 0.5 } }, opts)
    const b = planCourse(basicModel(), { mastery: { a: 0.5 } }, opts)
    expect(a).toEqual(b)
  })

  it('separates fits-without-reviews from fits with reviews', () => {
    const tight = { startDate: '2026-12-01', deadline: '2026-12-03', minutesPerDay: 70 }
    const r = planCourse(basicModel(), {}, tight)
    expect(r.status).toBe('fits-without-reviews')
    expect(r.reviewsScheduled).toBe(0)
    expect(r.shortfallMinutes).toBe(0)
    expect(r.unfinished).toEqual([])
    // the same course with room for reviews is plain "fits" and has review entries
    const roomy = planCourse(basicModel(), {}, { ...tight, minutesPerDay: 120 })
    expect(roomy.status).toBe('fits')
    expect(roomy.reviewsScheduled).toBeGreaterThan(0)
  })

  it('counts overdue reviews that got no room apart from those after the last study day', () => {
    // 1-day window of content only fits; reviews of finished lessons come due after it
    const r = planCourse(
      basicModel(),
      {},
      { startDate: '2026-12-01', deadline: '2026-12-03', minutesPerDay: 80, reviewShare: 0.07 },
    )
    expect(r.status).toBe('fits')
    // budget floor(80 * 0.07) = 5 min: one 5-minute review fits per day, the rest wait
    expect(r.reviewsScheduled + r.reviewsOverdueUnscheduled + r.reviewsAfterLastStudyDay).toBe(4)
    expect(r.reviewsOverdueUnscheduled).toBeGreaterThan(0)
  })

  it('echoes the exclusive study window and never studies on the deadline date', () => {
    const r = planCourse(basicModel(), {}, opts)
    expect(r.studyWindow).toEqual({ start: '2026-12-01', endExclusive: '2026-12-08' })
    expect(r.days[r.days.length - 1]!.date).toBe('2026-12-07')
    // end-of-date semantics are the caller's explicit choice: pass the next date
    const inclusive = planCourse(basicModel(), {}, { ...opts, deadline: '2026-12-09' })
    expect(inclusive.days[inclusive.days.length - 1]!.date).toBe('2026-12-08')
  })

  it('reports an unmastered prerequisite that no remaining lesson trains', () => {
    const m = buildCourseModel(
      course(
        [
          ['base', []],
          ['adv', ['base']],
        ],
        [['m', [{ slug: 'adv-lesson', est: 30, skills: ['adv'] }]]],
      ),
    )
    const r = planCourse(m, {}, opts)
    expect(r.status).toBe('fits')
    expect(r.prerequisiteSafe).toBe(false)
    expect(r.unmetPrerequisites).toEqual([
      {
        lesson: 'adv-lesson',
        skill: 'adv',
        prerequisite: 'base',
        reason: 'no-remaining-lesson-trains-it',
      },
    ])
    // mastered, or taught by a remaining lesson: safe
    expect(planCourse(m, { mastery: { base: 0.95 } }, opts).prerequisiteSafe).toBe(true)
    expect(planCourse(basicModel(), {}, opts).prerequisiteSafe).toBe(true)
  })

  it('treats a prerequisite whose lessons are all completed but still unmastered as unmet', () => {
    const r = planCourse(basicModel(), { status: { l1: 'completed' } }, opts)
    expect(r.prerequisiteSafe).toBe(false)
    expect(r.unmetPrerequisites.map((u) => `${u.lesson}:${u.prerequisite}`).sort()).toEqual([
      'l2:a',
      'l4:a',
    ])
  })

  it('is not prerequisite-safe when lessons wait on each other', () => {
    const m = buildCourseModel(
      course(
        [
          ['x', ['y']],
          ['y', ['x']],
        ],
        [
          [
            'm',
            [
              { slug: 'lx', est: 10, skills: ['x'] },
              { slug: 'ly', est: 10, skills: ['y'] },
            ],
          ],
        ],
      ),
    )
    expect(planCourse(m, {}, opts).prerequisiteSafe).toBe(false)
  })
})

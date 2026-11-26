import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseCurriculum } from '@learning-hub/core/curriculum'
import { analyze, nextDate } from '../src/components/course-path/analyze'
import { EXAMPLE_COURSE } from '../src/components/course-path/example-course'
import {
  CoursePathStudio,
  LessonList,
  LevelsNote,
  UnlockerList,
  LintList,
  ParseIssues,
  PlanView,
} from '../src/components/course-path/CoursePathStudio'
import {
  COURSE_PATH_STORAGE_KEY,
  defaultPrefs,
  readPrefs,
  writePrefs,
  MAX_SOURCE_CHARS,
} from '../src/components/course-path/state'

const source = JSON.stringify(EXAMPLE_COURSE)
const prefs = (over = {}) => ({ ...defaultPrefs(), source, ...over })
const html = (el: React.ReactElement) => renderToString(el).replace(/<!-- -->/g, '')

describe('example course', () => {
  it('is a valid LHCF course with no hard errors', () => {
    const r = parseCurriculum(source)
    expect(r.ok).toBe(true)
  })
})

describe('analyze', () => {
  it('reports parse errors in plain data, not exceptions', () => {
    const r = analyze(prefs({ source: '{"lhcf":1}' }), '2026-12-01')
    expect(r.ok).toBe(false)
    expect(analyze(prefs({ source: 'not a course' }), '2026-12-01').ok).toBe(false)
    expect(analyze(prefs({ source: '' }), '2026-12-01').ok).toBe(false)
  })

  it('shows the first lesson as next and the later ones as better later', () => {
    const r = analyze(prefs(), '2026-12-01')
    if (!r.ok) throw new Error('parse')
    expect(r.value.frontier.next).toBe('mean-median-mode')
    const stage = (slug: string) => r.value.frontier.lessons.find((l) => l.slug === slug)!.stage
    expect(stage('mean-median-mode')).toBe('ready')
    expect(stage('variance-and-sd')).toBe('soft-locked')
  })

  it('applies the level the learner chose', () => {
    const r = analyze(prefs({ levels: { averages: 'solid' } }), '2026-12-01')
    if (!r.ok) throw new Error('parse')
    expect(r.value.frontier.lessons.find((l) => l.slug === 'variance-and-sd')!.stage).toBe('ready')
    const learning = analyze(prefs({ levels: { averages: 'learning' } }), '2026-12-01')
    if (!learning.ok) throw new Error('parse')
    // Learning (0.6) is below the unlock bar (about 0.82)
    expect(learning.value.frontier.lessons.find((l) => l.slug === 'variance-and-sd')!.stage).toBe(
      'soft-locked',
    )
  })

  it('converts the inclusive last study day to the core exclusive deadline, explicitly', () => {
    expect(nextDate('2026-12-31')).toBe('2027-01-01')
    expect(nextDate('2028-02-28')).toBe('2028-02-29')
    const r = analyze(prefs({ deadline: '2026-12-10' }), '2026-12-01')
    if (!r.ok || !r.value.plan) throw new Error('plan')
    expect(r.value.plan.studyWindow).toEqual({ start: '2026-12-01', endExclusive: '2026-12-11' })
    expect(r.value.plan.days.some((d) => d.date === '2026-12-10')).toBe(true)
    expect(r.value.plan.days.some((d) => d.date === '2026-12-11')).toBe(false)
  })

  it('gives a note, not a plan, when the day is missing or past', () => {
    const none = analyze(prefs(), '2026-12-01')
    const past = analyze(prefs({ deadline: '2026-11-30' }), '2026-12-01')
    const today = analyze(prefs({ deadline: '2026-12-01' }), '2026-12-01')
    if (!none.ok || !past.ok || !today.ok) throw new Error('parse')
    expect(none.value.plan).toBeNull()
    expect(none.value.planNote).toContain('last study day')
    expect(past.value.plan).toBeNull()
    expect(today.value.plan).not.toBeNull() // studying today is allowed
  })

  it('does not throw on a bad minutes value', () => {
    const r = analyze(prefs({ deadline: '2026-12-10', minutesPerDay: 0 }), '2026-12-01')
    if (!r.ok) throw new Error('parse')
    expect(r.value.plan).toBeNull()
    expect(r.value.planNote).toMatch(/at least 1/)
  })
})

describe('views', () => {
  const ok = (p = prefs()) => {
    const r = analyze(p, '2026-12-01')
    if (!r.ok) throw new Error('parse')
    return r.value
  }

  it('renders the studio shell with an empty state on the server', () => {
    const out = html(React.createElement(CoursePathStudio))
    expect(out).toContain('Course path')
    expect(out).toContain('No course yet')
    expect(out).toContain('Load example course')
  })

  it('lists lessons with a plain reason when one is better later', () => {
    const out = html(React.createElement(LessonList, { analysis: ok(), onStatus: () => undefined }))
    expect(out).toContain('Mean, median and mode')
    expect(out).toContain('Better later')
    expect(out).toContain('Needs Averages first.')
    expect(out).toContain('You can still open it.')
  })

  it('shows plan statuses and unmet prerequisites', () => {
    const fits = ok(
      prefs({
        deadline: '2026-12-20',
        minutesPerDay: 120,
        levels: { averages: 'solid', probability: 'solid' },
      }),
    ).plan!
    expect(html(React.createElement(PlanView, { plan: fits, note: null }))).toContain(
      'This fits before the deadline',
    )
    const tight = ok(prefs({ deadline: '2026-12-02', minutesPerDay: 30 })).plan!
    const out = html(React.createElement(PlanView, { plan: tight, note: null }))
    expect(out).toContain('This does not fit before the deadline')
    expect(out).toContain('minutes are left over')
    expect(
      html(React.createElement(PlanView, { plan: null, note: 'Pick your last study day' })),
    ).toContain('No plan yet')
  })

  it('says a no-review fit is not a recall claim', () => {
    const plan = {
      ...ok(prefs({ deadline: '2026-12-20' })).plan!,
      status: 'fits-without-reviews' as const,
    }
    expect(html(React.createElement(PlanView, { plan, note: null }))).toContain(
      'does not mean you will remember them',
    )
  })

  it('shows review counts only when reviews were planned', () => {
    const base = ok(prefs({ deadline: '2026-12-20' })).plan!
    const withCounts = {
      ...base,
      status: 'fits' as const,
      reviewsOverdueUnscheduled: 2,
      reviewsAfterLastStudyDay: 3,
    }
    expect(html(React.createElement(PlanView, { plan: withCounts, note: null }))).toContain(
      '2 review(s) had no room and 3 fall after',
    )
    const noReviews = { ...withCounts, status: 'fits-without-reviews' as const }
    expect(html(React.createElement(PlanView, { plan: noReviews, note: null }))).not.toContain(
      'had no room',
    )
  })

  it('says how many unmet prerequisites are not listed', () => {
    const base = ok(prefs({ deadline: '2026-12-20' })).plan!
    const unmet = Array.from({ length: 8 }, (_, i) => ({
      lesson: `l${i}`,
      skill: 's',
      prerequisite: 'base',
      reason: 'no-remaining-lesson-trains-it' as const,
    }))
    const plan = { ...base, prerequisiteSafe: false, unmetPrerequisites: unmet }
    const out = html(
      React.createElement(PlanView, {
        plan,
        note: null,
        lessonTitles: { l0: 'First lesson' },
        skillNames: { base: 'Base skill' },
      }),
    )
    expect(out).toContain('First lesson builds on Base skill')
    expect(out).toContain('and 3 more')
    const few = { ...plan, unmetPrerequisites: unmet.slice(0, 5) }
    expect(html(React.createElement(PlanView, { plan: few, note: null }))).not.toContain(
      'more</li>',
    )
  })

  it('explains that levels are self-reported and only Solid unlocks', () => {
    const out = html(React.createElement(LevelsNote))
    expect(out).toContain('not measured mastery')
    expect(out).toContain('Only Solid counts as knowing a skill')
    expect(out).toContain('New or Learning do not unlock it')
  })

  it('does not claim training time for a skill no lesson teaches', () => {
    const out = html(
      React.createElement(UnlockerList, {
        unlockers: [
          {
            skill: 'base',
            name: 'Base',
            downstreamLessons: 2,
            minutesToTrain: 0,
            lockedLessons: 2,
          },
          { skill: 'a', name: 'A', downstreamLessons: 1, minutesToTrain: 30, lockedLessons: 1 },
        ],
      }),
    )
    expect(out).toContain(
      'Base: 2 later lesson(s) depend on it, but no lesson in this course teaches it.',
    )
    expect(out).toContain('A: 1 later lesson(s) depend on it, about 30 min to train.')
    expect(out).not.toContain('about 0 min')
  })

  it('renders parse issues and lint findings', () => {
    expect(
      html(
        React.createElement(ParseIssues, {
          errors: [{ path: 'modules', message: 'Required', hint: 'Add one.' }],
        }),
      ),
    ).toContain('modules: Required Add one.')
    expect(html(React.createElement(LintList, { findings: [] }))).toContain(
      'No course problems found',
    )
    const findings = ok().lint
    expect(findings.some((f) => f.code === 'lesson-without-estimate')).toBe(true) // reading-charts has no estimate
    expect(html(React.createElement(LintList, { findings }))).toContain('estMinutes')
  })
})

describe('stored preferences', () => {
  it('round-trips', () => {
    const p = prefs({
      levels: { averages: 'solid' },
      status: { a: 'completed' },
      deadline: '2026-12-10',
      restWeekdays: [0, 6],
    })
    expect(readPrefs(writePrefs(p))).toEqual({ prefs: p, unreadable: false })
    expect(COURSE_PATH_STORAGE_KEY).toContain('.v1')
  })

  it('starts empty when nothing is stored and flags unreadable data', () => {
    expect(readPrefs(null)).toEqual({ prefs: defaultPrefs(), unreadable: false })
    expect(readPrefs('{oops').unreadable).toBe(true)
    expect(readPrefs('{"version":2}').unreadable).toBe(true)
    expect(readPrefs('[]').unreadable).toBe(true)
    expect(readPrefs('x'.repeat(MAX_SOURCE_CHARS + 200_000)).unreadable).toBe(true)
  })

  it('drops invalid fields instead of trusting them', () => {
    const r = readPrefs(
      JSON.stringify({
        version: 1,
        source: 5,
        levels: { a: 'gold', b: 'solid' },
        status: { x: 'maybe', y: 'completed' },
        minutesPerDay: -3,
        restWeekdays: [1, 9, 'x', 1],
        deadline: 'soon',
      }),
    )
    expect(r.unreadable).toBe(false)
    expect(r.prefs.levels).toEqual({ b: 'solid' })
    expect(r.prefs.status).toEqual({ y: 'completed' })
    expect(r.prefs.minutesPerDay).toBe(45)
    expect(r.prefs.restWeekdays).toEqual([1])
    expect(r.prefs.deadline).toBe('')
    expect(r.prefs.source).toBe('')
  })
})

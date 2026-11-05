import { describe, expect, it } from 'vitest'
import { FOCUS_TARGET_MINUTES, buildAgenda, type AgendaInput } from '../src/agenda'

const base: AgendaInput = {
  dueCount: 0,
  exams: [],
  inProgressLessons: [],
  focusMinutesToday: 0,
  focusTargetMinutes: FOCUS_TARGET_MINUTES,
  quest: null,
  journalDoneToday: false,
}

describe('buildAgenda', () => {
  it('empty input produces an empty agenda (no fake items)', () => {
    expect(
      buildAgenda({ ...base, focusMinutesToday: FOCUS_TARGET_MINUTES, journalDoneToday: true }),
    ).toEqual([])
  })

  it('orders exams before reviews before lessons before the loop', () => {
    const items = buildAgenda({
      ...base,
      dueCount: 12,
      exams: [{ title: 'Linear algebra final', daysLeft: 5 }],
      inProgressLessons: [{ lessonId: 7, title: 'Eigenvalues', courseTitle: 'Linear Algebra' }],
      quest: { title: 'Answer 20 cards', completed: false },
      journalDoneToday: false,
    })
    expect(items.map((i) => i.kind)).toEqual([
      'exam',
      'review',
      'lesson',
      'focus',
      'quest',
      'journal',
    ])
    expect(items[0]).toMatchObject({ title: 'Linear algebra final', detail: 'in 5 day(s)' })
    expect(items[1]).toMatchObject({ title: 'Review 12 due cards', href: '/review' })
    expect(items[2]).toMatchObject({ href: '/courses/lesson?id=7' })
  })

  it('skips completed quests, journaled days and satisfied focus', () => {
    const items = buildAgenda({
      ...base,
      focusMinutesToday: 25,
      quest: { title: 'Done quest', completed: true },
      journalDoneToday: true,
    })
    expect(items).toEqual([])
  })

  it('caps the Zeigarnik lessons at two and omits past exams', () => {
    const items = buildAgenda({
      ...base,
      exams: [
        { title: 'past', daysLeft: -1 },
        { title: 'future', daysLeft: 2 },
      ],
      inProgressLessons: [
        { lessonId: 1, title: 'A', courseTitle: 'C' },
        { lessonId: 2, title: 'B', courseTitle: 'C' },
        { lessonId: 3, title: 'D', courseTitle: 'C' },
      ],
    })
    expect(items.filter((i) => i.kind === 'exam').map((i) => i.title)).toEqual(['future'])
    expect(items.filter((i) => i.kind === 'lesson')).toHaveLength(2)
  })

  it('singularizes one due card', () => {
    const items = buildAgenda({ ...base, dueCount: 1 })
    expect(items[0]!.title).toBe('Review 1 due card')
  })
})

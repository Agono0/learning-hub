import { describe, expect, it } from 'vitest'
import { buildNotifications, type NotificationsInput } from '../src/notifications'

const base: NotificationsInput = {
  dueCount: 0,
  exams: [],
  streak: { current: 0, lastActiveDate: null },
  today: '2026-11-05',
  openLessons: [],
}

describe('buildNotifications', () => {
  it('empty facts → empty list (no noise)', () => {
    expect(buildNotifications(base)).toEqual([])
  })

  it('exams escalate to danger within 3 days', () => {
    const items = buildNotifications({
      ...base,
      exams: [
        { title: 'Quiz', daysLeft: 1 },
        { title: 'Final', daysLeft: 10 },
      ],
    })
    expect(items[0]).toMatchObject({ tone: 'danger', title: 'Quiz' })
    expect(items[1]).toMatchObject({ tone: 'warning', title: 'Final' })
  })

  it('flags due cards and a streak at risk (reviewed yesterday, not today)', () => {
    const items = buildNotifications({
      ...base,
      dueCount: 12,
      streak: { current: 6, lastActiveDate: '2026-11-04' },
    })
    expect(items.map((i) => i.id)).toEqual(['due', 'streak'])
    expect(items[1]!.title).toContain('6-day streak at risk')
  })

  it('no streak warning when today already counted', () => {
    const items = buildNotifications({
      ...base,
      streak: { current: 6, lastActiveDate: '2026-11-05' },
    })
    expect(items.find((i) => i.id === 'streak')).toBeUndefined()
  })

  it('caps unfinished lessons at two with ids that dedupe', () => {
    const items = buildNotifications({
      ...base,
      openLessons: [
        { lessonId: 1, title: 'A' },
        { lessonId: 2, title: 'B' },
        { lessonId: 3, title: 'C' },
      ],
    })
    expect(items.filter((i) => i.id.startsWith('lesson:'))).toHaveLength(2)
  })
})

import { describe, expect, it } from 'vitest'
import {
  isQuietHours,
  planReminders,
  reminderSettingsSchema,
  type ReminderSettings,
  type UserFacts,
} from '../src/reminders/index.js'

describe('reminders domain logic', () => {
  const defaultSettings: ReminderSettings = {
    enabled: true,
    quietStart: '22:00',
    quietEnd: '08:00',
    dailyCap: 3,
    allowedKinds: ['daily_review', 'streak_saver', 'break_reminder', 'curriculum_nudge'],
  }

  describe('isQuietHours', () => {
    it('correctly handles overnight wrap-around (22:00 - 08:00)', () => {
      expect(isQuietHours('23:30', '22:00', '08:00')).toBe(true)
      expect(isQuietHours('00:00', '22:00', '08:00')).toBe(true)
      expect(isQuietHours('07:59', '22:00', '08:00')).toBe(true)
      expect(isQuietHours('08:00', '22:00', '08:00')).toBe(false)
      expect(isQuietHours('12:00', '22:00', '08:00')).toBe(false)
      expect(isQuietHours('21:59', '22:00', '08:00')).toBe(false)
      expect(isQuietHours('22:00', '22:00', '08:00')).toBe(true)
    })

    it('correctly handles daytime windows (13:00 - 15:00)', () => {
      expect(isQuietHours('12:59', '13:00', '15:00')).toBe(false)
      expect(isQuietHours('13:00', '13:00', '15:00')).toBe(true)
      expect(isQuietHours('14:30', '13:00', '15:00')).toBe(true)
      expect(isQuietHours('15:00', '13:00', '15:00')).toBe(false)
    })
  })

  describe('planReminders', () => {
    const baseFacts: UserFacts = {
      now: new Date('2026-11-06T14:00:00.000Z'),
      dueReviewsCount: 15,
      reviewedTodayCount: 0,
      currentStreak: 5,
      todayXp: 0,
      continuousFocusMinutes: 0,
      sentToday: [],
    }

    it('suppresses all reminders during quiet hours', () => {
      const quietFacts: UserFacts = {
        ...baseFacts,
        // 23:00 local time
        now: new Date('2026-11-06T23:00:00'),
      }
      const planned = planReminders(quietFacts, defaultSettings)
      expect(planned).toEqual([])
    })

    it('suppresses reminders when daily cap is reached', () => {
      const cappedFacts: UserFacts = {
        ...baseFacts,
        sentToday: [
          { kind: 'daily_review', sentAt: '2026-11-06T09:00:00.000Z' },
          { kind: 'break_reminder', sentAt: '2026-11-06T10:00:00.000Z' },
          { kind: 'curriculum_nudge', sentAt: '2026-11-06T11:00:00.000Z' },
        ],
      }
      const planned = planReminders(cappedFacts, defaultSettings)
      expect(planned).toEqual([])
    })

    it('triggers daily_review when cards are due and no review occurred today', () => {
      const planned = planReminders(
        { ...baseFacts, now: new Date('2026-11-06T10:00:00') },
        defaultSettings,
      )
      expect(planned.some((r) => r.kind === 'daily_review')).toBe(true)
      const reviewReminder = planned.find((r) => r.kind === 'daily_review')!
      expect(reviewReminder.title).toBe('Spaced Repetition Due')
      expect(reviewReminder.body).toContain('15 cards ready')
      expect(reviewReminder.actionUrl).toBe('/review')
    })

    it('triggers break_reminder after 50 minutes of continuous focus with highest priority', () => {
      const focusFacts: UserFacts = {
        ...baseFacts,
        now: new Date('2026-11-06T10:00:00'),
        continuousFocusMinutes: 55,
      }
      const planned = planReminders(focusFacts, defaultSettings)
      expect(planned[0]!.kind).toBe('break_reminder')
      expect(planned[0]!.title).toBe('Time for a Breather')
    })

    it('triggers streak_saver late in the day when zero XP earned', () => {
      const eveningFacts: UserFacts = {
        ...baseFacts,
        now: new Date('2026-11-06T19:30:00'),
        todayXp: 0,
        currentStreak: 12,
      }
      const planned = planReminders(eveningFacts, defaultSettings)
      expect(planned.some((r) => r.kind === 'streak_saver')).toBe(true)
      const streakReminder = planned.find((r) => r.kind === 'streak_saver')!
      expect(streakReminder.body).toContain('12-day streak')
    })

    it('triggers curriculum_nudge for untouched course >= 2 days', () => {
      const nudgeFacts: UserFacts = {
        ...baseFacts,
        now: new Date('2026-11-06T11:00:00'),
        untouchedCourseDays: 3,
        untouchedCourseTitle: 'Distributed Systems 101',
      }
      const planned = planReminders(nudgeFacts, defaultSettings)
      const nudge = planned.find((r) => r.kind === 'curriculum_nudge')
      expect(nudge).toBeDefined()
      expect(nudge?.body).toContain('Distributed Systems 101')
      expect(nudge?.actionUrl).toBe('/curriculum')
    })

    it('deduplicates: suppresses kind if clicked today or sent within 120 minutes', () => {
      const recentFacts: UserFacts = {
        ...baseFacts,
        now: new Date('2026-11-06T11:00:00'),
        sentToday: [
          { kind: 'daily_review', sentAt: new Date('2026-11-06T10:15:00').toISOString() },
        ],
      }
      // Sent 45 minutes ago -> should be suppressed
      const plannedRecent = planReminders(recentFacts, defaultSettings)
      expect(plannedRecent.some((r) => r.kind === 'daily_review')).toBe(false)

      const clickedFacts: UserFacts = {
        ...baseFacts,
        now: new Date('2026-11-06T14:00:00'),
        clickedToday: [
          { kind: 'daily_review', clickedAt: new Date('2026-11-06T09:00:00').toISOString() },
        ],
      }
      const plannedClicked = planReminders(clickedFacts, defaultSettings)
      expect(plannedClicked.some((r) => r.kind === 'daily_review')).toBe(false)
    })
  })

  describe('reminderSettingsSchema validation', () => {
    it('parses valid settings with defaults', () => {
      const parsed = reminderSettingsSchema.parse({})
      expect(parsed.enabled).toBe(true)
      expect(parsed.quietStart).toBe('22:00')
      expect(parsed.quietEnd).toBe('08:00')
      expect(parsed.dailyCap).toBe(3)
      expect(parsed.allowedKinds).toHaveLength(4)
    })

    it('rejects invalid time formats', () => {
      expect(() => reminderSettingsSchema.parse({ quietStart: '25:00' })).toThrow()
      expect(() => reminderSettingsSchema.parse({ quietEnd: 'morning' })).toThrow()
    })
  })
})

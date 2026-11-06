/**
 * Learning HUB — Reminders domain logic (pure, runtime-neutral).
 *
 * Implements a calm, respectful reminder planner (Kahneman & Tversky attention
 * science; Leroy 2009 context switching). Protects cognitive load via:
 * 1. Strict quiet hours (handling overnight wraps like 22:00 -> 08:00).
 * 2. Strict daily cap (default 3, user-configurable).
 * 3. Anti-nag deduplication (suppressed if same kind sent within 120min or clicked today).
 * 4. Grounded triggers: Spaced repetition due, streak saver, 50m focus break, curriculum nudge.
 */
import { z } from 'zod'

export const REMINDER_KINDS = [
  'daily_review',
  'streak_saver',
  'break_reminder',
  'curriculum_nudge',
] as const

export type ReminderKind = (typeof REMINDER_KINDS)[number]

export const reminderSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  quietStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24-hour)')
    .default('22:00'),
  quietEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24-hour)')
    .default('08:00'),
  dailyCap: z.number().int().min(1).max(10).default(3),
  allowedKinds: z.array(z.enum(REMINDER_KINDS)).default([...REMINDER_KINDS]),
})

export type ReminderSettings = z.infer<typeof reminderSettingsSchema>

export interface ReminderCandidate {
  kind: ReminderKind
  title: string
  body: string
  actionUrl: string
  priority: number
}

export interface UserFacts {
  now?: string | Date
  dueReviewsCount: number
  reviewedTodayCount: number
  currentStreak: number
  todayXp: number
  continuousFocusMinutes: number
  untouchedCourseDays?: number
  untouchedCourseTitle?: string | null
  sentToday: Array<{ kind: ReminderKind; sentAt: string }>
  clickedToday?: Array<{ kind: ReminderKind; clickedAt: string }>
}

/**
 * Checks whether a given HH:MM timestamp falls within quiet hours.
 * Properly handles overnight wrap-around (e.g. 22:00 -> 08:00) as well as
 * daytime ranges (e.g. 13:00 -> 15:00).
 */
export function isQuietHours(timeStr: string, quietStart: string, quietEnd: string): boolean {
  if (quietStart === quietEnd) return false

  if (quietStart < quietEnd) {
    // Normal daytime window, e.g. 12:00 to 14:00
    return timeStr >= quietStart && timeStr < quietEnd
  }

  // Overnight window, e.g. 22:00 to 08:00
  return timeStr >= quietStart || timeStr < quietEnd
}

/**
 * Extracts "HH:MM" (local time representation) from an ISO timestamp or Date object.
 */
export function extractTimeHHMM(dateOrIso: string | Date): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Evaluates user facts and settings to produce an actionable, ordered list of
 * reminders that comply with daily caps, quiet hours, and anti-nag throttling.
 */
export function planReminders(facts: UserFacts, settings: ReminderSettings): ReminderCandidate[] {
  if (!settings.enabled) return []

  const nowDate = facts.now
    ? typeof facts.now === 'string'
      ? new Date(facts.now)
      : facts.now
    : new Date()
  const currentHHMM = extractTimeHHMM(nowDate)

  if (isQuietHours(currentHHMM, settings.quietStart, settings.quietEnd)) {
    return []
  }

  const sentTodayCount = facts.sentToday.length
  if (sentTodayCount >= settings.dailyCap) {
    return []
  }

  const allowedKindsSet = new Set(settings.allowedKinds)
  const clickedKindsSet = new Set((facts.clickedToday ?? []).map((c) => c.kind))
  const candidates: ReminderCandidate[] = []

  // 1. Spaced Repetition Due (Priority 4)
  if (
    allowedKindsSet.has('daily_review') &&
    facts.dueReviewsCount > 0 &&
    facts.reviewedTodayCount === 0
  ) {
    candidates.push({
      kind: 'daily_review',
      title: 'Spaced Repetition Due',
      body: `You have ${facts.dueReviewsCount} card${facts.dueReviewsCount === 1 ? '' : 's'} ready for review today.`,
      actionUrl: '/review',
      priority: 4,
    })
  }

  // 2. Streak Saver (Priority 3) — triggers late afternoon/evening if streak is at risk
  const currentHour = nowDate.getHours()
  if (
    allowedKindsSet.has('streak_saver') &&
    facts.currentStreak > 0 &&
    facts.todayXp === 0 &&
    currentHour >= 17
  ) {
    candidates.push({
      kind: 'streak_saver',
      title: 'Protect Your Streak',
      body: `Keep your ${facts.currentStreak}-day streak alive with a quick review session.`,
      actionUrl: '/review',
      priority: 3,
    })
  }

  // 3. Focus Break Reminder (Priority 5) — deep work health check after 50 minutes
  if (allowedKindsSet.has('break_reminder') && facts.continuousFocusMinutes >= 50) {
    candidates.push({
      kind: 'break_reminder',
      title: 'Time for a Breather',
      body: "You've been in deep focus for 50 minutes. Rest your eyes and stand up.",
      actionUrl: '/focus',
      priority: 5,
    })
  }

  // 4. Curriculum Nudge (Priority 2) — course untouched for 2+ days
  if (
    allowedKindsSet.has('curriculum_nudge') &&
    (facts.untouchedCourseDays ?? 0) >= 2 &&
    facts.untouchedCourseTitle
  ) {
    candidates.push({
      kind: 'curriculum_nudge',
      title: 'Resume Your Journey',
      body: `Pick up where you left off in "${facts.untouchedCourseTitle}".`,
      actionUrl: '/curriculum',
      priority: 2,
    })
  }

  // Deduplication & Throttling
  const nowMs = nowDate.getTime()
  const THROTTLE_MS = 120 * 60 * 1000 // 120 minutes

  const filtered = candidates.filter((cand) => {
    // 1. Suppress if already clicked today
    if (clickedKindsSet.has(cand.kind)) return false

    // 2. Suppress if same kind was sent within 120 minutes
    const lastSent = facts.sentToday
      .filter((s) => s.kind === cand.kind)
      .map((s) => new Date(s.sentAt).getTime())
      .sort((a, b) => b - a)[0]

    if (lastSent && nowMs - lastSent < THROTTLE_MS) {
      return false
    }

    return true
  })

  // Sort by priority descending
  filtered.sort((a, b) => b.priority - a.priority)

  // Cap to remaining allowed notifications for today
  const remainingAllowance = settings.dailyCap - sentTodayCount
  return filtered.slice(0, remainingAllowance)
}

/**
 * Notification center (M4): derive the "needs attention" list from dashboard
 * facts. Distinct from the agenda (things to DO today): notifications are
 * things that would otherwise be MISSED — due reviews, exams approaching, a
 * streak at risk, unfinished lessons. Pure module.
 */

export type NotificationTone = 'info' | 'warning' | 'danger'

export interface NotificationItem {
  id: string
  tone: NotificationTone
  title: string
  detail?: string
  href: string
}

export interface NotificationsInput {
  dueCount: number
  /** upcoming exams with days left (soonest first) */
  exams: { title: string; daysLeft: number }[]
  /** streak state; lastActiveDate = last day (YYYY-MM-DD) a review happened */
  streak: { current: number; lastActiveDate: string | null }
  /** today's day key (YYYY-MM-DD) — a streak is at risk when lastActive ≠ today */
  today: string
  /** unfinished lessons */
  openLessons: { lessonId: number; title: string }[]
}

/**
 * Build the notification list — capped, deduped, calm. Empty when there is
 * genuinely nothing that needs attention.
 */
export function buildNotifications(input: NotificationsInput): NotificationItem[] {
  const out: NotificationItem[] = []

  for (const exam of input.exams.slice(0, 2)) {
    out.push({
      id: `exam:${exam.title}`,
      tone: exam.daysLeft <= 3 ? 'danger' : 'warning',
      title: exam.title,
      detail: exam.daysLeft === 0 ? 'exam is today' : `in ${exam.daysLeft} day(s)`,
      href: '/courses',
    })
  }

  if (input.dueCount > 0) {
    out.push({
      id: 'due',
      tone: 'info',
      title: `${input.dueCount} card${input.dueCount === 1 ? '' : 's'} due`,
      detail: 'reviews keep the forgetting curve at bay',
      href: '/review',
    })
  }

  const streakAtRisk =
    input.streak.current > 0 &&
    input.streak.lastActiveDate !== null &&
    input.streak.lastActiveDate !== input.today
  if (streakAtRisk) {
    out.push({
      id: 'streak',
      tone: 'warning',
      title: `${input.streak.current}-day streak at risk`,
      detail: 'one review today keeps it alive',
      href: '/review',
    })
  }

  for (const lesson of input.openLessons.slice(0, 2)) {
    out.push({
      id: `lesson:${lesson.lessonId}`,
      tone: 'info',
      title: `Unfinished: ${lesson.title}`,
      detail: 'pick up where you left off',
      href: `/courses/lesson?id=${lesson.lessonId}`,
    })
  }

  return out
}

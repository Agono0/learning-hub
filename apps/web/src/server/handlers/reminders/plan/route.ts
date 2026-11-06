/**
 * /api/reminders/plan — Computes actionable push/desktop reminders obeying quiet
 * hours, daily caps, and anti-nag deduplication.
 */
import { collectUserFacts, getReminderSettings } from '@learning-hub/db'
import { planReminders } from '@learning-hub/core/reminders'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async () => {
  const settings = getReminderSettings()
  const facts = collectUserFacts()
  const candidates = planReminders(facts, settings)

  return Response.json({
    ok: true,
    settings,
    facts: {
      dueReviewsCount: facts.dueReviewsCount,
      reviewedTodayCount: facts.reviewedTodayCount,
      currentStreak: facts.currentStreak,
      todayXp: facts.todayXp,
      continuousFocusMinutes: facts.continuousFocusMinutes,
      untouchedCourseDays: facts.untouchedCourseDays,
      untouchedCourseTitle: facts.untouchedCourseTitle,
      sentTodayCount: facts.sentToday.length,
    },
    candidates,
  })
})

export const POST = withRoute(async () => {
  const settings = getReminderSettings()
  const facts = collectUserFacts()
  const candidates = planReminders(facts, settings)

  return Response.json({
    ok: true,
    settings,
    facts: {
      dueReviewsCount: facts.dueReviewsCount,
      reviewedTodayCount: facts.reviewedTodayCount,
      currentStreak: facts.currentStreak,
      todayXp: facts.todayXp,
      continuousFocusMinutes: facts.continuousFocusMinutes,
      untouchedCourseDays: facts.untouchedCourseDays,
      untouchedCourseTitle: facts.untouchedCourseTitle,
      sentTodayCount: facts.sentToday.length,
    },
    candidates,
  })
})

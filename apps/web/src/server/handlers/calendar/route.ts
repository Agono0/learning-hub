/**
 * GET /api/calendar.ics — a live, subscribable calendar feed: upcoming exam
 * dates, the weekly study-plan blocks (next 30 days) and the review due
 * forecast (next 7 days). Consumed by any phone/PC calendar app.
 */
import { asc, gte, sql } from 'drizzle-orm'
import { toICS, type IcsEvent } from '@learning-hub/core'
import { db } from '@/lib/db'
import { cards, examDates, studyPlans } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const GET = withRoute(async () => {
  const events: IcsEvent[] = []
  const today = new Date()
  const horizon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  // 1. Exams.
  try {
    const exams = db
      .select({ title: examDates.title, date: examDates.date })
      .from(examDates)
      .where(gte(examDates.date, dayKey(today)))
      .orderBy(asc(examDates.date))
      .limit(40)
      .all()
    for (const exam of exams) {
      events.push({
        date: exam.date.slice(0, 10),
        title: `Exam: ${exam.title}`,
        description: 'From your Learning HUB exam countdown.',
      })
    }
  } catch {
    /* no exams yet */
  }

  // 2. Study-plan weekly blocks projected over the next 30 days.
  try {
    const [plan] = db
      .select()
      .from(studyPlans)
      .orderBy(sql`${studyPlans.id} DESC`)
      .limit(1)
      .all()
    type PlanBlock = { day: number; minutes: number; label?: string }
    const blocks =
      (plan?.plan as { blocks?: PlanBlock[] } | null)?.blocks?.filter(
        (b) => Number.isInteger(b?.day) && b.day >= 0 && b.day <= 6,
      ) ?? []
    for (let i = 0; i < 30; i++) {
      const day = new Date(today.getTime() + i * 24 * 60 * 60 * 1000)
      const block = blocks.find((b) => b.day === day.getDay())
      if (block) {
        events.push({
          date: dayKey(day),
          title: block.label ? `Study: ${block.label}` : 'Study session',
          description: `${block.minutes} planned minutes · Learning HUB study plan`,
        })
      }
    }
  } catch {
    /* no plan yet */
  }

  // 3. Review due forecast (next 7 days, bucketed per day).
  try {
    const due = db.all<{ day: string; count: number }>(
      sql`SELECT substr(due, 1, 10) AS day, count(*) AS count FROM cards
          WHERE due >= ${today.toISOString()} AND due <= ${horizon.toISOString()} AND suspended = 0
          GROUP BY day`,
    )
    void cards
    for (const row of due) {
      events.push({
        date: row.day,
        title: `${row.count} card${row.count === 1 ? '' : 's'} due`,
        description: 'FSRS-6 scheduled reviews — open Learning HUB to clear them.',
      })
    }
  } catch {
    /* cards table differences — skip the forecast */
  }

  return new Response(toICS(events, 'Learning HUB — Study Plan'), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="learning-hub.ics"',
      'cache-control': 'no-store',
    },
  })
})

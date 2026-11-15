/**
 * /api/study-plan — the M4 study planner.
 *
 * GET   → the saved plan (if any) + the LIVE facts to build one: active
 *         courses (remaining hours), upcoming exams, saved weeklyMinutes.
 * POST  → rebuild + save the weekly template { weeklyMinutes, restDay }.
 *         Courses/exams come from the DB, never from the client.
 * GET /?format=ics → the saved plan as an iCalendar file (all-day events for
 *         the next 8 weeks) — apiDownload-friendly (Content-Disposition).
 */
import { z } from 'zod'
import {
  deleteStudyPlan,
  generateAndSaveStudyPlan,
  getPlanCourses,
  getSavedStudyPlan,
} from '@learning-hub/db'
import { toICS, dayKey, type WeeklyPlan } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const WEEKS_TO_EXPORT = 8

const buildSchema = z.object({
  weeklyMinutes: z.number().int().min(30).max(3_000),
  restDay: z.number().int().min(0).max(6).nullable().optional(),
})

/** GET /api/study-plan[?format=ics] */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const saved = getSavedStudyPlan()

  if (url.searchParams.get('format') === 'ics') {
    if (!saved) {
      return new Response('no study plan saved yet', { status: 404 })
    }
    const plan = saved.plan as unknown as WeeklyPlan
    const events: { date: string; title: string; description?: string }[] = []
    const start = new Date()
    // expand the weekly template over the next weeks, skipping the rest day
    for (let w = 0; w < WEEKS_TO_EXPORT; w++) {
      for (let d = 0; d < 7; d++) {
        if (plan.restDay === d) continue
        const blocks = plan.blocks.filter((b) => b.day === d)
        for (const b of blocks) {
          const eventDate = new Date(start)
          eventDate.setDate(start.getDate() + w * 7 + ((d - start.getDay() + 7) % 7))
          events.push({
            date: dayKey(eventDate, 0),
            title: b.label,
            description: `${b.minutes} min planned via Learning HUB study planner`,
          })
        }
      }
    }
    const icsText = toICS(events, 'Learning HUB Study Plan')
    return new Response(icsText, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="study-plan.ics"',
      },
    })
  }

  const courses = getPlanCourses()
  const liveWeeklyMinutes = saved?.weeklyMinutes ?? 180
  return Response.json({
    savedPlan: saved ? (saved.plan as unknown as WeeklyPlan) : null,
    courses,
    savedWeeklyMinutes: liveWeeklyMinutes,
    savedRestDay: saved?.restDay ?? null,
  })
}

/**
 * POST /api/study-plan { weeklyMinutes, restDay? }
 * Rebuilds the weekly template from current course progress + exam dates.
 */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, buildSchema)
  const { plan } = generateAndSaveStudyPlan({
    weeklyMinutes: body.weeklyMinutes,
    restDay: body.restDay ?? null,
  })
  return Response.json({ ok: true, plan })
})

/** DELETE /api/study-plan — remove the saved plan. */
export const DELETE = withRoute(async () => {
  deleteStudyPlan()
  return Response.json({ ok: true })
})

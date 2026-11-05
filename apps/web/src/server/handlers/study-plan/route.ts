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
import { asc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { examDates, listCourses, studyPlans } from '@learning-hub/db'
import { buildStudyPlan, toICS, dayKey, type PlanCourse, type WeeklyPlan } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const WEEKS_TO_EXPORT = 8

const buildSchema = z.object({
  weeklyMinutes: z.number().int().min(30).max(3_000),
  restDay: z.number().int().min(0).max(6).nullable().optional(),
})

function planCourses(): PlanCourse[] {
  // listCourses already computes per-course lesson progress — reuse it.
  const catalog = listCourses()
  const exams = db
    .select({ courseId: examDates.courseId, date: examDates.date })
    .from(examDates)
    .all()
  const examByCourse = new Map<number, string>()
  for (const e of exams) if (e.courseId != null) examByCourse.set(e.courseId, e.date)
  return catalog.map((c) => ({
    courseId: c.id,
    title: c.title,
    estHours: c.estHours ?? 4,
    progressFraction: c.progress.total > 0 ? c.progress.completed / c.progress.total : 0,
    examDate: examByCourse.get(c.id) ?? null,
  }))
}

/** GET /api/study-plan[?format=ics] */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const [saved] = await db.select().from(studyPlans).orderBy(asc(studyPlans.id)).limit(1)

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
          const date = new Date(
            start.getTime() + (w * 7 + ((d - start.getDay() + 7) % 7)) * 86_400_000,
          )
          events.push({
            date: date.toISOString().slice(0, 10),
            title: `Study: ${b.label}`,
            description: `${b.minutes} min`,
          })
        }
      }
    }
    return new Response(toICS(events, 'Learning HUB — study plan'), {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="learning-hub-study-plan.ics"',
      },
    })
  }

  const all = planCourses()
  return Response.json({
    ok: true,
    saved: saved ?? null,
    courses: all,
    exams: db
      .select({ id: examDates.id, title: examDates.title, date: examDates.date })
      .from(examDates)
      .where(gte(examDates.date, dayKey(new Date())))
      .orderBy(asc(examDates.date))
      .all(),
  })
}

/** POST /api/study-plan — rebuild and save the weekly template. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, buildSchema)
  const plan = buildStudyPlan(planCourses(), {
    weeklyMinutes: body.weeklyMinutes,
    restDay: body.restDay ?? null,
  })
  const [existing] = await db.select().from(studyPlans).orderBy(asc(studyPlans.id)).limit(1)
  const values = {
    weeklyMinutes: plan.weeklyMinutes,
    restDay: plan.restDay,
    plan: plan as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  }
  if (existing) {
    await db.update(studyPlans).set(values).where(eq(studyPlans.id, existing.id))
  } else {
    await db.insert(studyPlans).values(values)
  }
  return Response.json({ ok: true, plan })
})

/** DELETE /api/study-plan — remove the saved plan. */
export const DELETE = withRoute(async () => {
  await db.delete(studyPlans)
  return Response.json({ ok: true })
})

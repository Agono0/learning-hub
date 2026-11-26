import { calendarDay } from '@/lib/query-params'
import { z } from 'zod'
import { getPhysioInsights, upsertPhysioLog } from '@learning-hub/db'
import { readJson, tzOffsetSchema, withRoute } from '@/lib/api'

/** GET /api/physio?bedtime=23 — history + correlation insights from real data. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const bedtimeHour = Number.parseInt(url.searchParams.get('bedtime') ?? '23', 10)
  const result = getPhysioInsights({ bedtimeHour })
  return Response.json(result)
}

const physioPostSchema = z.object({
  date: calendarDay.optional(),
  sleepHours: z.number().nullable().optional(),
  sleepQuality: z.number().nullable().optional(),
  exerciseMinutes: z.number().nullable().optional(),
  exerciseHoursAfterLearning: z.number().nullable().optional(),
  caffeineCutoffHour: z.number().nullable().optional(),
  arousal: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  tzOffset: tzOffsetSchema,
})

/** POST /api/physio { date?, sleepHours?, sleepQuality?, exerciseMinutes?, exerciseHoursAfterLearning?, caffeineCutoffHour?, arousal?, notes?, tzOffset? } */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, physioPostSchema)
  const { log, created } = upsertPhysioLog(body)
  return Response.json({ log, created }, { status: created ? 201 : 200 })
})

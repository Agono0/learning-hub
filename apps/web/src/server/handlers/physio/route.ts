import { desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { physioLog } from '@learning-hub/db'
import {
  caffeineCutoffAdvice,
  dayKey,
  exerciseNudge,
  sleepVsRetention,
  yerkesDodsonZone,
  type SleepRetentionDay,
} from '@learning-hub/core'
import { readJson, tzOffsetSchema, withRoute } from '@/lib/api'

/** GET /api/physio?bedtime=23 — history + correlation insights from real data. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const bedtimeHour = Number.parseInt(url.searchParams.get('bedtime') ?? '23', 10)
  const bedtime =
    Number.isInteger(bedtimeHour) && bedtimeHour >= 0 && bedtimeHour <= 23 ? bedtimeHour : 23

  const history = db.select().from(physioLog).orderBy(desc(physioLog.date)).limit(120).all()

  // join sleep hours with that day's true correct-rate from the view
  const reviewRows = db.all<{ day: string; reviews: number; correct: number }>(
    sql`SELECT day, reviews, correct FROM v_daily_reviews`,
  )
  const rateByDay = new Map(
    reviewRows.filter((r) => r.reviews > 0).map((r) => [r.day, r.correct / r.reviews]),
  )
  const sleepRetentionDays: SleepRetentionDay[] = history
    .filter((h) => h.sleepHours != null && rateByDay.has(h.date))
    .map((h) => ({
      sleepHours: h.sleepHours as number,
      correctRate: rateByDay.get(h.date) as number,
    }))

  const latestExercise =
    history.find((h) => h.exerciseHoursAfterLearning != null)?.exerciseHoursAfterLearning ?? null
  const latestArousal = history.find((h) => h.arousal != null)?.arousal ?? null

  return Response.json({
    history,
    insights: {
      sleep: sleepVsRetention(sleepRetentionDays),
      exercise: { hoursAfterLearning: latestExercise, nudge: exerciseNudge(latestExercise) },
      caffeine: caffeineCutoffAdvice(bedtime),
      arousal: {
        value: latestArousal,
        ...yerkesDodsonZone(latestArousal ?? 5, 'moderate'),
      },
    },
    bedtimeHour: bedtime,
  })
}

const physioPostSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  sleepHours: z.number().nullable().optional(),
  sleepQuality: z.number().nullable().optional(),
  exerciseMinutes: z.number().nullable().optional(),
  exerciseHoursAfterLearning: z.number().nullable().optional(),
  caffeineCutoffHour: z.number().nullable().optional(),
  arousal: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  tzOffset: tzOffsetSchema,
})

// null = "not provided" (the client sends null for empty inputs)
const clamp = (min: number, max: number, v?: number | null): number | null =>
  v == null ? null : Math.min(max, Math.max(min, v))

/** POST /api/physio { date?, sleepHours?, sleepQuality?, exerciseMinutes?, exerciseHoursAfterLearning?, caffeineCutoffHour?, arousal?, notes?, tzOffset? } */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, physioPostSchema)
  const date = body.date ?? dayKey(new Date(), body.tzOffset)

  const values = {
    sleepHours: clamp(0, 24, body.sleepHours),
    sleepQuality: clamp(1, 5, body.sleepQuality),
    exerciseMinutes: clamp(0, 600, body.exerciseMinutes),
    exerciseHoursAfterLearning: clamp(0, 48, body.exerciseHoursAfterLearning),
    caffeineCutoffHour: clamp(0, 23, body.caffeineCutoffHour),
    arousal: clamp(1, 10, body.arousal),
    notes: body.notes?.trim() || null,
  }

  const [existing] = db
    .select()
    .from(physioLog)
    .where(sql`${physioLog.date} = ${date}`)
    .all()
  if (existing) {
    const [row] = db
      .update(physioLog)
      .set({
        sleepHours: values.sleepHours ?? existing.sleepHours,
        sleepQuality: values.sleepQuality ?? existing.sleepQuality,
        exerciseMinutes: values.exerciseMinutes ?? existing.exerciseMinutes,
        exerciseHoursAfterLearning:
          values.exerciseHoursAfterLearning ?? existing.exerciseHoursAfterLearning,
        caffeineCutoffHour: values.caffeineCutoffHour ?? existing.caffeineCutoffHour,
        arousal: values.arousal ?? existing.arousal,
        notes: values.notes ?? existing.notes,
      })
      .where(sql`${physioLog.date} = ${date}`)
      .returning()
      .all()
    return Response.json({ log: row, created: false })
  }

  const [row] = db
    .insert(physioLog)
    .values({ date, ...values })
    .returning()
    .all()
  return Response.json({ log: row, created: true }, { status: 201 })
})

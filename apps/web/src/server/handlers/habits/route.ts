import { and, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { habitLogs, habits } from '@learning-hub/db'
import { dayKey, solidifying, stackChainOrder, validateHabit } from '@learning-hub/core'
import { readJson, tzOffsetFromQuery, withRoute } from '@/lib/api'

/** GET /api/habits?all=1&tzOffset=N — habits with chain order, today's state, solidifying stage and 90-day log dates. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const includeArchived = url.searchParams.get('all') === '1'
  const tz = tzOffsetFromQuery(req)
  const rows = includeArchived
    ? db.select().from(habits).all()
    : db.select().from(habits).where(eq(habits.archived, false)).all()

  const cutoff = dayKey(new Date(Date.now() - 90 * 86_400_000), tz)
  const today = dayKey(new Date(), tz)

  const withStats = rows.map((h) => {
    const logs = db
      .select({ date: habitLogs.date })
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, h.id), gte(habitLogs.date, cutoff)))
      .all()
    const logDates = logs.map((l) => l.date)
    return {
      ...h,
      logDates,
      todayDone: logDates.includes(today),
      solidifying: solidifying(logDates, today),
    }
  })

  return Response.json({
    habits: stackChainOrder(withStats),
    today,
    stageThresholds: { solidifying: 21, automatic: 60 },
  })
}

const createHabitSchema = z.object({
  name: z.string().optional(),
  cue: z.string().optional(),
  cueType: z.string().optional(),
  craving: z.string().optional(),
  response: z.string().optional(),
  reward: z.string().optional(),
  anchor: z.string().optional(),
})

/** POST /api/habits — create a habit (cue/craving/response/reward validated). */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createHabitSchema)
  const trimOrNull = (v?: string): string | null => {
    const t = v?.trim()
    return t ? t : null
  }

  const cue = trimOrNull(body.cue)
  const craving = trimOrNull(body.craving)
  const response = trimOrNull(body.response)
  const reward = trimOrNull(body.reward)
  const name = body.name?.trim() || (cue ?? '')
  if (name.length < 2) return Response.json({ error: 'Name is required.' }, { status: 400 })

  const validation = validateHabit({ cue, craving, response, reward })
  if (!validation.ok)
    return Response.json(
      {
        error: validation.errors.join(' '),
        errors: validation.errors,
        warnings: validation.warnings,
      },
      { status: 400 },
    )

  const [maxOrder] = db
    .select({ max: sql<number>`coalesce(max(${habits.order}), 0)` })
    .from(habits)
    .all()
  const [row] = db
    .insert(habits)
    .values({
      name,
      cue,
      cueType: trimOrNull(body.cueType),
      craving,
      response,
      reward,
      anchor: trimOrNull(body.anchor),
      order: (maxOrder?.max ?? 0) + 1,
    })
    .returning()
    .all()
  return Response.json({ habit: row, warnings: validation.warnings }, { status: 201 })
})

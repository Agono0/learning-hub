import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { eventBus } from '@learning-hub/core'
import { awardXp, habitLogs, habits, withTransaction, updateStreakInTx } from '@learning-hub/db'
import { XP_REWARDS, dayKey } from '@learning-hub/core'
import { readJson, tzOffsetSchema, withRoute } from '@/lib/api'

const checkinSchema = z.object({
  habitId: z.coerce.number().int().positive('habitId is required'),
  note: z.string().optional(),
  tzOffset: tzOffsetSchema,
})

/**
 * POST /api/habits/checkin { habitId, note?, tzOffset? }
 * → habit_logs row (one per habit/day) + XP (source 'habit') + streak activity.
 * Idempotent per day: a second check-in returns 200 with alreadyDone: true and
 * does NOT pay XP again. The whole checkin (log + XP + streak) is one
 * transaction; the streak block is the shared updateStreakInTx helper.
 * Note: the streak itself buckets days in UTC (updateStreakInTx has no offset
 * parameter) — the tzOffset only shifts the habit-log `date` key.
 */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, checkinSchema)
  const today = dayKey(new Date(), body.tzOffset)

  const result = withTransaction((tx) => {
    const habit = tx.select().from(habits).where(eq(habits.id, body.habitId)).get()
    if (!habit) return { notFound: true as const }

    const inserted = tx
      .insert(habitLogs)
      .values({ habitId: body.habitId, date: today, note: body.note ?? null })
      .onConflictDoNothing()
      .returning()
      .all()

    if (inserted.length === 0) return { alreadyDone: true as const, date: today }

    // Rule 7: XP via the canonical awardXp path (repos/xp.ts).
    awardXp(tx, {
      source: 'habit',
      meta: { habitId: body.habitId, habit: habit.name, date: today },
    })

    // streak counts any real activity — habit check-in qualifies
    updateStreakInTx(tx, new Date())

    return { alreadyDone: false as const, date: today, xpAwarded: XP_REWARDS.habit }
  })

  if ('notFound' in result) return Response.json({ error: 'Habit not found' }, { status: 404 })
  if (result.alreadyDone) return Response.json({ ok: true, alreadyDone: true, date: result.date })

  // Fact after the commit: the habit was checked off for `result.date`.
  eventBus.emit('habit.checked', { habitId: body.habitId })
  return Response.json(
    { ok: true, alreadyDone: false, date: result.date, xpAwarded: result.xpAwarded },
    { status: 201 },
  )
})

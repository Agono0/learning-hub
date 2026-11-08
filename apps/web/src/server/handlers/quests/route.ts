import { z } from 'zod'
import { and, eq, gte, lt, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ensurePluginsLoaded } from '@/lib/plugins'
import {
  awardXp,
  cards,
  focusSessions,
  habitLogs,
  habits,
  lessons,
  quests,
  revlog,
  userSettings,
  withTransaction,
} from '@learning-hub/db'
import { dayKey, generateDailyQuests, eventBus, type QuestItem } from '@learning-hub/core'
import { readJson, tzOffsetFromQuery, tzOffsetSchema, withRoute } from '@/lib/api'

/**
 * Local-day window for ISO-timestamped columns. `dayKey(d, tz)` buckets by the
 * client's local day (tz = new Date().getTimezoneOffset()), so the matching
 * UTC instant range is [localMidnight + tz, localMidnight + tz + 24h).
 */
function localDayRange(day: string, tzOffsetMinutes: number): { start: string; end: string } {
  const startMs = Date.parse(day + 'T00:00:00Z') + tzOffsetMinutes * 60_000
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000).toISOString(),
  }
}

/** GET /api/quests?tzOffset=N — today's quests with live progress from real data. */
export async function GET(req: Request) {
  const tz = tzOffsetFromQuery(req)
  const today = dayKey(new Date(), tz)
  const nowIso = new Date().toISOString()
  const { start, end } = localDayRange(today, tz)

  // ensure the row exists (deterministic generation, stored once)
  const [dueRow] = db
    .select({ n: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, nowIso), eq(cards.suspended, false)))
    .all()
  const [habitsRow] = db
    .select({ n: sql<number>`count(*)` })
    .from(habits)
    .where(eq(habits.archived, false))
    .all()
  const [settings] = db.select().from(userSettings).limit(1).all()
  const focusMinutesTarget = settings?.sessionMinutes ?? 25

  db.insert(quests)
    .values({
      date: today,
      items: generateDailyQuests({
        date: today,
        dueCount: dueRow?.n ?? 0,
        habitsCount: habitsRow?.n ?? 0,
        focusMinutesTarget,
      }),
    })
    .onConflictDoNothing()
    .run()

  const [row] = db.select().from(quests).where(eq(quests.date, today)).all()
  const stored: QuestItem[] = row.items

  // live progress — count within the client's local day window
  const [reviewsToday] = db
    .select({ n: sql<number>`count(*)` })
    .from(revlog)
    .where(
      and(
        gte(revlog.reviewedAt, start),
        lt(revlog.reviewedAt, end),
        sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`,
      ),
    )
    .all()
  const [focusToday] = db
    .select({ minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.completed, true),
        gte(focusSessions.startedAt, start),
        lt(focusSessions.startedAt, end),
      ),
    )
    .all()
  const [habitsToday] = db
    .select({ n: sql<number>`count(*)` })
    .from(habitLogs)
    .where(eq(habitLogs.date, today))
    .all()
  const [lessonsToday] = db
    .select({ n: sql<number>`count(*)` })
    .from(lessons)
    .where(and(gte(lessons.completedAt, start), lt(lessons.completedAt, end)))
    .all()

  const items: QuestItem[] = stored.map((q) => {
    const live =
      q.type === 'reviews'
        ? (reviewsToday?.n ?? 0)
        : q.type === 'lesson'
          ? (lessonsToday?.n ?? 0)
          : q.type === 'focus'
            ? (focusToday?.minutes ?? 0)
            : (habitsToday?.n ?? 0)
    const progress = Math.max(q.progress, live)
    return { ...q, progress, done: q.done || progress >= q.target }
  })

  return Response.json({
    date: today,
    items,
    allDone: items.every((i) => i.done),
    completed: row.completed,
    xpReward: row.xpReward,
  })
}

const questPostSchema = z.object({
  index: z.number().int().min(0, 'Invalid quest index'),
  tzOffset: tzOffsetSchema,
})

/** POST /api/quests { index, tzOffset? } — mark quest item done; completing ALL pays the quest XP once. */
export const POST = withRoute(async (req: Request) => {
  await ensurePluginsLoaded() // plugins must be registered before events can fire
  const body = await readJson(req, questPostSchema)
  const today = dayKey(new Date(), body.tzOffset)

  // Atomic completion: the quests row's `completed` flag is flipped with a
  // guarded UPDATE (… AND completed = 0) and XP is paid only when that UPDATE
  // actually changed a row — two concurrent completions can never pay twice.
  const result = withTransaction((tx) => {
    const [row] = tx.select().from(quests).where(eq(quests.date, today)).all()
    if (!row) return { error: 'No quests for today' as const }
    if (body.index >= row.items.length) return { error: 'Invalid quest index' as const }

    const items: QuestItem[] = row.items.map((q, i) =>
      i === body.index ? { ...q, done: true } : q,
    )
    tx.update(quests).set({ items }).where(eq(quests.id, row.id)).run()

    let xpAwarded = 0
    if (items.every((i) => i.done)) {
      const res = tx
        .update(quests)
        .set({ completed: true })
        .where(and(eq(quests.id, row.id), eq(quests.completed, false)))
        .run()
      if (res.changes > 0) {
        // Rule 7: XP via the canonical awardXp path (repos/xp.ts); the quest
        // row's xpReward (generated as XP_REWARDS.quest) is the explicit amount.
        awardXp(tx, { source: 'quest', amount: row.xpReward, meta: { date: today } })
        xpAwarded = row.xpReward
      }
    }

    return { items, allDone: items.every((i) => i.done), xpAwarded }
  })

  if ('error' in result) {
    return Response.json(
      { error: result.error },
      { status: result.error === 'Invalid quest index' ? 400 : 404 },
    )
  }

  // This request flipped the guarded `completed` flag (XP paid once) —
  // publish quest.completed after the commit. The quest's date is its stable id.
  if (result.xpAwarded > 0) {
    eventBus.emit('quest.completed', { questId: today })
  }

  return Response.json({
    ok: true,
    items: result.items,
    allDone: result.allDone,
    xpAwarded: result.xpAwarded,
  })
})

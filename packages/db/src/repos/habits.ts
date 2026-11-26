/**
 * Habits repository — Atomic Habits 4-law loop (Clear 2018), habit stacking chains,
 * Lally automaticity curves (Lally 2010), and idempotent daily check-ins.
 */
import { and, eq, gte, sql } from 'drizzle-orm'
import { dayKey, solidifying, stackChainOrder, XP_REWARDS } from '@learning-hub/core'
import { pendingTombstone } from '../sync'
import { getDb, type LearningHubDB } from '../index'
import { habitLogs, habits } from '../schema'
import { withTransaction } from '../transaction'
import { awardXp } from './xp'
import { updateStreakInTx } from '../review-service'

export type HabitRow = typeof habits.$inferSelect
export type HabitLogRow = typeof habitLogs.$inferSelect

export interface CreateHabitInput {
  name: string
  cue?: string | null
  cueType?: string | null
  craving?: string | null
  response?: string | null
  reward?: string | null
  anchor?: string | null
}

export interface PatchHabitInput {
  name?: string
  cue?: string | null
  cueType?: string | null
  craving?: string | null
  response?: string | null
  reward?: string | null
  anchor?: string | null
  order?: number
  archived?: boolean
}

export interface HabitWithStats extends HabitRow {
  logDates: string[]
  todayDone: boolean
  solidifying: ReturnType<typeof solidifying>
}

/**
 * List habits with chain ordering, 90-day retention logs, and automaticity stages.
 */
export function listHabits(
  opts: {
    includeArchived?: boolean
    tzOffset?: number
    now?: Date
    db?: LearningHubDB
  } = {},
): {
  habits: HabitWithStats[]
  today: string
  stageThresholds: { solidifying: number; automatic: number }
} {
  const db = opts.db ?? getDb()
  const tz = opts.tzOffset ?? 0
  const nowDate = opts.now ?? new Date()
  const cutoff = dayKey(new Date(nowDate.getTime() - 90 * 86_400_000), tz)
  const today = dayKey(nowDate, tz)

  const rows = opts.includeArchived
    ? db.select().from(habits).all()
    : db.select().from(habits).where(eq(habits.archived, false)).all()

  const withStats: HabitWithStats[] = rows.map((h) => {
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

  return {
    habits: stackChainOrder(withStats),
    today,
    stageThresholds: { solidifying: 21, automatic: 60 },
  }
}

/**
 * Get a single habit by id.
 */
export function getHabit(id: number, opts: { db?: LearningHubDB } = {}): HabitRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(habits).where(eq(habits.id, id)).limit(1).all()
  return row ?? null
}

/**
 * Create a new habit with automatic next order position.
 */
export function createHabit(input: CreateHabitInput, opts: { db?: LearningHubDB } = {}): HabitRow {
  const db = opts.db ?? getDb()
  const [maxOrder] = db
    .select({ max: sql<number>`coalesce(max(${habits.order}), 0)` })
    .from(habits)
    .all()

  const [row] = db
    .insert(habits)
    .values({
      name: input.name,
      cue: input.cue ?? null,
      cueType: input.cueType ?? null,
      craving: input.craving ?? null,
      response: input.response ?? null,
      reward: input.reward ?? null,
      anchor: input.anchor ?? null,
      order: (maxOrder?.max ?? 0) + 1,
    })
    .returning()
    .all()

  return row!
}

/**
 * Update a habit's loop definitions, ordering, or archive state.
 */
export function updateHabit(
  id: number,
  input: PatchHabitInput,
  opts: { db?: LearningHubDB } = {},
): HabitRow | null {
  const db = opts.db ?? getDb()
  const [existing] = db.select().from(habits).where(eq(habits.id, id)).limit(1).all()
  if (!existing) return null

  const [row] = db
    .update(habits)
    .set({
      name: input.name !== undefined ? input.name : existing.name,
      cue: input.cue !== undefined ? input.cue : existing.cue,
      cueType: input.cueType !== undefined ? input.cueType : existing.cueType,
      craving: input.craving !== undefined ? input.craving : existing.craving,
      response: input.response !== undefined ? input.response : existing.response,
      reward: input.reward !== undefined ? input.reward : existing.reward,
      anchor: input.anchor !== undefined ? input.anchor : existing.anchor,
      order: input.order !== undefined ? input.order : existing.order,
      archived: input.archived !== undefined ? input.archived : existing.archived,
    })
    .where(eq(habits.id, id))
    .returning()
    .all()

  return row ?? null
}

/**
 * Delete a habit if no logs reference it; otherwise mark as archived to preserve history.
 */
export function deleteHabit(
  id: number,
  opts: { db?: LearningHubDB } = {},
): { ok: boolean; archived: boolean } {
  const db = opts.db ?? getDb()
  const commit = pendingTombstone('habits', id, Boolean(opts.db))
  try {
    db.delete(habits).where(eq(habits.id, id)).run()
    commit()
    return { ok: true, archived: false }
  } catch {
    db.update(habits).set({ archived: true }).where(eq(habits.id, id)).run()
    return { ok: true, archived: true }
  }
}

/**
 * Check in a habit for a given day key (YYYY-MM-DD).
 * Idempotent: repeat check-ins return alreadyDone: true and award zero XP.
 */
export function checkinHabit(opts: {
  habitId: number
  date: string
  note?: string | null
  now?: Date
  db?: LearningHubDB
}): { notFound?: true; alreadyDone: boolean; date: string; xpAwarded: number } {
  const nowDate = opts.now ?? new Date()
  return withTransaction((tx) => {
    const habit = tx.select().from(habits).where(eq(habits.id, opts.habitId)).get()
    if (!habit)
      return { notFound: true as const, alreadyDone: false, date: opts.date, xpAwarded: 0 }

    const inserted = tx
      .insert(habitLogs)
      .values({ habitId: opts.habitId, date: opts.date, note: opts.note ?? null })
      .onConflictDoNothing()
      .returning()
      .all()

    if (inserted.length === 0) {
      return { alreadyDone: true, date: opts.date, xpAwarded: 0 }
    }

    // Canonical XP award (Rule 7)
    awardXp(tx, {
      source: 'habit',
      meta: { habitId: opts.habitId, habit: habit.name, date: opts.date },
    })

    // Activity counts toward user streak
    updateStreakInTx(tx, nowDate)

    return { alreadyDone: false, date: opts.date, xpAwarded: XP_REWARDS.habit }
  }, opts.db)
}

/**
 * Physiology repository — sleep, exercise, caffeine, and arousal tracking
 * mapped against retention and memory consolidation curves (Walker 2017, Stickgold 2005).
 */
import { rowLimit } from '../limits'
import { desc, eq, sql } from 'drizzle-orm'
import {
  caffeineCutoffAdvice,
  dayKey,
  exerciseNudge,
  sleepVsRetention,
  yerkesDodsonZone,
  type SleepRetentionDay,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { physioLog } from '../schema'

export type PhysioLogRow = typeof physioLog.$inferSelect

export interface UpsertPhysioLogInput {
  date?: string
  sleepHours?: number | null
  sleepQuality?: number | null
  exerciseMinutes?: number | null
  exerciseHoursAfterLearning?: number | null
  caffeineCutoffHour?: number | null
  arousal?: number | null
  notes?: string | null
  tzOffset?: number
}

export interface PhysioInsights {
  sleep: ReturnType<typeof sleepVsRetention>
  exercise: {
    hoursAfterLearning: number | null
    nudge: ReturnType<typeof exerciseNudge>
  }
  caffeine: ReturnType<typeof caffeineCutoffAdvice>
  arousal: {
    value: number | null
    zone: string
    advice: string
  }
}

export interface PhysioInsightsResult {
  history: PhysioLogRow[]
  insights: PhysioInsights
  bedtimeHour: number
}

const clamp = (min: number, max: number, v?: number | null): number | null =>
  v == null ? null : Math.min(max, Math.max(min, v))

/**
 * List physiology history logs ordered by date descending.
 */
export function listPhysioLogs(
  opts: {
    limit?: number
    db?: LearningHubDB
  } = {},
): PhysioLogRow[] {
  const db = opts.db ?? getDb()
  const limit = opts.limit ?? 120
  return db.select().from(physioLog).orderBy(desc(physioLog.date)).limit(rowLimit(limit)).all()
}

/**
 * Get physiology log for a specific date (YYYY-MM-DD).
 */
export function getPhysioLog(date: string, opts: { db?: LearningHubDB } = {}): PhysioLogRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(physioLog).where(eq(physioLog.date, date)).limit(1).all()
  return row ?? null
}

/**
 * Upsert daily physiology metrics (sleep, exercise, caffeine, arousal).
 * Idempotent per date: updates if exists, inserts if new.
 */
export function upsertPhysioLog(
  input: UpsertPhysioLogInput,
  opts: { db?: LearningHubDB } = {},
): { log: PhysioLogRow; created: boolean } {
  const db = opts.db ?? getDb()
  const date = input.date ?? dayKey(new Date(), input.tzOffset ?? 0)

  const values = {
    sleepHours: clamp(0, 24, input.sleepHours),
    sleepQuality: clamp(1, 5, input.sleepQuality),
    exerciseMinutes: clamp(0, 600, input.exerciseMinutes),
    exerciseHoursAfterLearning: clamp(0, 48, input.exerciseHoursAfterLearning),
    caffeineCutoffHour: clamp(0, 23, input.caffeineCutoffHour),
    arousal: clamp(1, 10, input.arousal),
    notes: input.notes?.trim() || null,
  }

  const existing = getPhysioLog(date, { db })
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
      .where(eq(physioLog.date, date))
      .returning()
      .all()

    return { log: row!, created: false }
  }

  const [row] = db
    .insert(physioLog)
    .values({ date, ...values })
    .returning()
    .all()

  return { log: row!, created: true }
}

/**
 * Compute physiological insights (sleep vs retention correlation, exercise timing nudge,
 * caffeine cutoff advice, Yerkes-Dodson arousal zone).
 */
export function getPhysioInsights(
  opts: {
    bedtimeHour?: number
    limit?: number
    db?: LearningHubDB
  } = {},
): PhysioInsightsResult {
  const db = opts.db ?? getDb()
  const bedtimeHour =
    opts.bedtimeHour !== undefined && opts.bedtimeHour >= 0 && opts.bedtimeHour <= 23
      ? opts.bedtimeHour
      : 23

  const history = listPhysioLogs({ limit: opts.limit ?? 120, db })

  // Join sleep hours with that day's true correct-rate from the review view
  let rateByDay = new Map<string, number>()
  try {
    const reviewRows = db.all<{ day: string; reviews: number; correct: number }>(
      sql`SELECT day, reviews, correct FROM v_daily_reviews`,
    )
    rateByDay = new Map(
      reviewRows.filter((r) => r.reviews > 0).map((r) => [r.day, r.correct / r.reviews]),
    )
  } catch {
    /* view may be absent in partial mock test contexts */
  }

  const sleepRetentionDays: SleepRetentionDay[] = history
    .filter((h) => h.sleepHours != null && rateByDay.has(h.date))
    .map((h) => ({
      sleepHours: h.sleepHours as number,
      correctRate: rateByDay.get(h.date) as number,
    }))

  const latestExercise =
    history.find((h) => h.exerciseHoursAfterLearning != null)?.exerciseHoursAfterLearning ?? null
  const latestArousal = history.find((h) => h.arousal != null)?.arousal ?? null
  const arousalZone = yerkesDodsonZone(latestArousal ?? 5, 'moderate')

  return {
    history,
    insights: {
      sleep: sleepVsRetention(sleepRetentionDays),
      exercise: { hoursAfterLearning: latestExercise, nudge: exerciseNudge(latestExercise) },
      caffeine: caffeineCutoffAdvice(bedtimeHour),
      arousal: {
        value: latestArousal,
        zone: arousalZone.zone,
        advice: arousalZone.advice,
      },
    },
    bedtimeHour,
  }
}

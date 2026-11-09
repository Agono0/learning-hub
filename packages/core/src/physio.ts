/**
 * Physiology → learning correlations. Pure functions over arrays of daily rows
 * (the server joins physio_log with v_daily_reviews and passes the arrays).
 * Small-N honest: insights say "not enough data" instead of overclaiming.
 */

// ─── Sleep vs retention ─────────────────────────────────────────────────────

export interface SleepRetentionDay {
  sleepHours: number
  /** fraction correct that day, 0..1 (correct/reviews from v_daily_reviews) */
  correctRate: number
}

/** Sleep-vs-retention comparison result with an honest, data-gated insight. */
export interface SleepRetentionInsight {
  shortSleepMean: number | null // days with < 6h sleep
  restMean: number | null
  /** percentage points (rest − short); positive = short-sleep days are worse */
  deltaPct: number | null
  nShort: number
  nRest: number
  insight: string
}

const SHORT_SLEEP_MAX_H = 6
/** minimum days per group before we claim anything */
const MIN_GROUP_N = 2
/** percentage-point gap worth telling the user about */
const MEANINGFUL_DELTA_PCT = 3

/** Compare retention on short-sleep vs rested days (small-N honest). */
export function sleepVsRetention(days: SleepRetentionDay[]): SleepRetentionInsight {
  const short = days.filter((d) => d.sleepHours < SHORT_SLEEP_MAX_H)
  const rest = days.filter((d) => d.sleepHours >= SHORT_SLEEP_MAX_H)
  const mean = (arr: SleepRetentionDay[]): number | null =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b.correctRate, 0) / arr.length

  const shortMean = short.length > 0 ? mean(short) : null
  const restMean = rest.length > 0 ? mean(rest) : null
  const deltaPct = shortMean != null && restMean != null ? (restMean - shortMean) * 100 : null

  let insight: string
  if (short.length < MIN_GROUP_N || rest.length < MIN_GROUP_N) {
    insight = 'Not enough data yet — log sleep and reviews for a week to see the pattern.'
  } else if (deltaPct != null && deltaPct > MEANINGFUL_DELTA_PCT) {
    insight = `Your retention drops ${round1(deltaPct)}% on <${SHORT_SLEEP_MAX_H}h-sleep days.`
  } else if (deltaPct != null && deltaPct < -MEANINGFUL_DELTA_PCT) {
    insight = `Oddly, <${SHORT_SLEEP_MAX_H}h-sleep days show ${round1(-deltaPct)}% HIGHER retention — check your sample before trusting it.`
  } else {
    insight = `No meaningful sleep effect yet (gap ${deltaPct == null ? '—' : round1(Math.abs(deltaPct)) + ' pp'}). Sleep still drives attention and consolidation.`
  }

  return {
    shortSleepMean: shortMean,
    restMean,
    deltaPct,
    nShort: short.length,
    nRest: rest.length,
    insight,
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

// ─── Exercise timing ────────────────────────────────────────────────────────

/**
 * van Dongen et al. 2016 (PNAS): aerobic exercise ~4h AFTER learning improved
 * 48h retention (consolidation window). Timing advice, not a gate.
 */
export const EXERCISE_OPTIMAL_HOURS_AFTER = 4

/** Timing feedback for exercise relative to the 4h consolidation window. */
export function exerciseNudge(exerciseHoursAfterLearning: number | null | undefined): string {
  if (exerciseHoursAfterLearning == null || Number.isNaN(exerciseHoursAfterLearning)) {
    return 'No exercise logged yet — a cardio session about 4 hours after learning boosts long-term memory (van Dongen et al., 2016).'
  }
  const h = exerciseHoursAfterLearning
  if (h >= 3 && h <= 5) {
    return 'Perfect timing — exercise ~4h after learning enhances memory consolidation (van Dongen et al., 2016).'
  }
  if (h < 3) {
    return 'Exercise landed early. The consolidation benefit peaks around 4h after learning — try scheduling it later.'
  }
  return 'Exercise landed late. Next time, aim for ~4h after your study block to ride the consolidation window.'
}

// ─── Caffeine cutoff ────────────────────────────────────────────────────────

/** Caffeine half-life ~5-6h; an 8h buffer before bed protects sleep quality. */
export const CAFFEINE_CUTOFF_HOURS_BEFORE_BED = 8

/** Cutoff hour (0-23) plus the rendered advice sentence. */
export interface CaffeineAdvice {
  cutoffHour: number // 0-23
  advice: string
}

/** Latest caffeine hour for a given bedtime (8h buffer before bed). */
export function caffeineCutoffAdvice(bedtimeHour: number): CaffeineAdvice {
  if (!Number.isInteger(bedtimeHour) || bedtimeHour < 0 || bedtimeHour > 23) {
    throw new RangeError('bedtimeHour must be an integer 0-23')
  }
  const cutoffHour = (((bedtimeHour - CAFFEINE_CUTOFF_HOURS_BEFORE_BED) % 24) + 24) % 24
  return {
    cutoffHour,
    advice: `Last caffeine by ${String(cutoffHour).padStart(2, '0')}:00 — that leaves the 8h buffer before your ${String(bedtimeHour).padStart(2, '0')}:00 bedtime (half-life ~5-6h).`,
  }
}

// ─── Yerkes-Dodson ──────────────────────────────────────────────────────────

export type TaskDifficulty = 'easy' | 'moderate' | 'hard'
/** Arousal zone relative to the difficulty's optimal band. */
export type ArousalZone = 'understimulated' | 'optimal' | 'overstimulated'

/** Yerkes-Dodson verdict plus a concrete adjustment tip. */
export interface YerkesDodsonResult {
  zone: ArousalZone
  advice: string
}

/** Optimal arousal bands (1-10 self-rating) by task difficulty — the inverted-U. */
const OPTIMAL_BAND: Record<TaskDifficulty, { lo: number; hi: number }> = {
  easy: { lo: 7, hi: 9 },
  moderate: { lo: 5, hi: 7 },
  hard: { lo: 3, hi: 5 },
}

/** Classify a 1-10 arousal rating against the inverted-U band for the difficulty. */
export function yerkesDodsonZone(arousal: number, difficulty: TaskDifficulty): YerkesDodsonResult {
  if (!Number.isFinite(arousal) || arousal < 1 || arousal > 10) {
    throw new RangeError('arousal must be 1-10')
  }
  const band = OPTIMAL_BAND[difficulty]
  if (arousal < band.lo) {
    return {
      zone: 'understimulated',
      advice:
        difficulty === 'hard'
          ? 'Arousal is low for demanding material — do a 2-minute warm-up review or easier cards first to raise engagement.'
          : 'Arousal is low — take a short walk or a harder version of the task to lift engagement.',
    }
  }
  if (arousal > band.hi) {
    return {
      zone: 'overstimulated',
      advice:
        difficulty === 'hard'
          ? 'Too wired for hard material — three 4-7-8 breaths, then start with one small proof step.'
          : 'Arousal is above the sweet spot — breathing or a 5-minute wind-down before this task.',
    }
  }
  return {
    zone: 'optimal',
    advice:
      difficulty === 'hard'
        ? 'Calm and focused — exactly the state hard material needs. Go.'
        : 'Good energy for this difficulty. Start now while the state holds.',
  }
}

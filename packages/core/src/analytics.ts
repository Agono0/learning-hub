/**
 * Analytics — pure transforms from DB rows (revlog, cards, views, focus_sessions)
 * into display-ready shapes. No chart library: everything renders as CSS bars /
 * grids on the client.
 */
import { dateKeyOf, dayKey } from './streaks'

// ─── Forecast histogram ─────────────────────────────────────────────────────

export interface ForecastBucket {
  /** YYYY-MM-DD for the next `days` days, then the literal 'later' */
  date: string
  count: number
}

/** Minimal card row the forecast histogram needs. */
export interface ForecastCard {
  due: string // ISO
  suspended?: boolean | null
}

/**
 * Workload forecast: cards due on each of the next `days` days; anything
 * further out (or with an unparseable date) lands in the trailing 'later' bucket.
 */
export function forecastHistogram(cards: ForecastCard[], days = 30, today: Date | string = new Date()): ForecastBucket[] {
  const n = Math.max(1, Math.floor(days))
  const start = Date.parse(dateKeyOf(today) + 'T00:00:00Z')
  const buckets = new Map<string, number>()
  const dates: string[] = []
  for (let i = 0; i < n; i++) {
    const d = dayKey(new Date(start + i * 86_400_000))
    dates.push(d)
    buckets.set(d, 0)
  }
  let later = 0
  for (const c of cards) {
    if (c.suspended) continue
    const dueMs = Date.parse(c.due)
    if (Number.isNaN(dueMs)) {
      later += 1
      continue
    }
    const d = dayKey(new Date(dueMs))
    const bucket = buckets.get(d)
    if (bucket === undefined) later += 1
    else buckets.set(d, bucket + 1)
  }
  const out: ForecastBucket[] = dates.map((date) => ({ date, count: buckets.get(date) ?? 0 }))
  if (later > 0) out.push({ date: 'later', count: later })
  return out
}

// ─── Calibration curve ──────────────────────────────────────────────────────

export interface CalibrationReview {
  /** FSRS predicted retrievability at review time, 0..1 — optional */
  predictedRetrievability?: number | null
  /** 1 Again … 4 Easy (Again counts as not-retained) */
  rating: number
}

/** One calibration-curve bucket: mean predicted vs mean actual retention. */
export interface CalibrationBucket {
  bucket: string
  /** mean predicted inside the bucket, 0..1 (null when empty) */
  predicted: number | null
  /** mean actual outcome (1 = retained) */
  actual: number | null
  n: number
}

const CALIBRATION_LABELS = ['0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'] as const

/**
 * Buckets 0.5-0.6 … 0.9-1.0: predicted confidence vs actual retention.
 *
 * `precomputedRetrievability` (optional, aligned by index with `reviews`) lets
 * callers pass the revlog `retrievability` column straight through from the
 * route — e.g. `calibrationCurve(rows, rows.map(r => r.retrievability))`. A
 * review's own `predictedRetrievability` wins when both are present; `null`
 * (no prediction) still skips the review.
 */
export function calibrationCurve(
  reviews: CalibrationReview[],
  precomputedRetrievability?: (number | null | undefined)[],
): CalibrationBucket[] {
  const acc = Array.from({ length: CALIBRATION_LABELS.length }, () => ({
    predictedSum: 0,
    actualSum: 0,
    n: 0,
  }))

  for (const [i, r] of reviews.entries()) {
    const p = r.predictedRetrievability ?? precomputedRetrievability?.[i]
    if (p == null || !Number.isFinite(p) || p < 0.5 || p > 1) continue
    let idx = Math.floor((p - 0.5) * 10) // 0..5 (p=1.0 → 5)
    if (idx >= acc.length) idx = acc.length - 1
    const slot = acc[idx]
    slot.predictedSum += p
    slot.actualSum += r.rating > 1 ? 1 : 0
    slot.n += 1
  }

  return acc.map((slot, i) => ({
    bucket: CALIBRATION_LABELS[i],
    predicted: slot.n === 0 ? null : slot.predictedSum / slot.n,
    actual: slot.n === 0 ? null : slot.actualSum / slot.n,
    n: slot.n,
  }))
}

// ─── Heatmap ────────────────────────────────────────────────────────────────

export interface HeatmapPoint {
  date: string
  count: number
}

/** Daily review totals sorted by date (activity-heatmap input). */
export function heatmapData(dailyReviews: { day: string; reviews: number }[]): HeatmapPoint[] {
  const byDate = new Map<string, number>()
  for (const r of dailyReviews) {
    const date = r.day.slice(0, 10)
    byDate.set(date, (byDate.get(date) ?? 0) + Math.max(0, r.reviews))
  }
  return [...byDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// ─── Time-of-day performance ────────────────────────────────────────────────

export interface HourPerformance {
  hour: number // 0-23
  total: number
  correct: number
  rate: number | null
}

/** Timezone-offset options for time-of-day performance bucketing. */
export interface TimeOfDayOptions {
  /**
   * Timezone offset in minutes following `Date#getTimezoneOffset()` semantics —
   * pass `new Date().getTimezoneOffset()` from the client: minutes to ADD to
   * local time to get UTC (e.g. -120 for UTC+2, +300 for UTC-5). Defaults to 0 (UTC).
   */
  timezoneOffsetMinutes?: number
  /** Same offset in hours (e.g. -2 for UTC+2, +5 for UTC-5). Shorthand. */
  timezoneOffsetHours?: number
}

/** Correct rate per hour of day (Again counts as not-correct) — find your prime hours. */
export function timeOfDayPerformance(
  reviews: { reviewedAt: string; rating: number }[],
  opts?: TimeOfDayOptions | number,
): HourPerformance[] {
  const hours: HourPerformance[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: 0,
    correct: 0,
    rate: null,
  }))

  // offsetMinutes uses getTimezoneOffset() semantics: local = UTC - offset.
  // Default 0 keeps every review in its UTC hour (historical behavior).
  const offsetMinutes =
    typeof opts === 'number'
      ? opts * 60
      : (opts?.timezoneOffsetMinutes ?? (opts?.timezoneOffsetHours != null ? opts.timezoneOffsetHours * 60 : 0))

  for (const r of reviews) {
    if (!r.reviewedAt) continue
    let hh: number
    const ms = Date.parse(r.reviewedAt)
    if (!Number.isNaN(ms)) {
      const shifted = new Date(ms - offsetMinutes * 60_000)
      hh = shifted.getUTCHours()
    } else {
      hh = Number.parseInt(r.reviewedAt.slice(11, 13), 10)
    }

    if (!Number.isInteger(hh) || hh < 0 || hh > 23) continue
    hours[hh].total += 1
    if (r.rating > 1) hours[hh].correct += 1
  }

  for (const h of hours) {
    h.rate = h.total === 0 ? null : h.correct / h.total
  }
  return hours
}

// ─── Learning score ─────────────────────────────────────────────────────────

export interface LearningScoreResult {
  score: number // 0-100
  components: { retention: number; focus: number; volume: number }
  weights: { retention: number; focus: number; volume: number }
}

/**
 * Composite weekly score (0-100):
 *  - retention 40%: true retention % (0-100)
 *  - focus 30%: minutes of completed focus work (120/week → full marks)
 *  - volume 30%: reviews completed (100/week → full marks)
 * Weighted toward quality (retention) per the depth-over-time XP philosophy.
 */
export function learningScore(input: {
  reviews: number
  retentionPct: number | null
  focusMinutes: number
}): LearningScoreResult {
  const clamp = (x: number) => Math.min(100, Math.max(0, x))
  const retention = input.retentionPct == null ? 0 : clamp(input.retentionPct)
  const focus = clamp((Math.max(0, input.focusMinutes) / 120) * 100)
  const volume = clamp((Math.max(0, input.reviews) / 100) * 100)
  const weights = { retention: 0.4, focus: 0.3, volume: 0.3 }
  const score = Math.round(retention * weights.retention + focus * weights.focus + volume * weights.volume)
  return { score, components: { retention, focus, volume }, weights }
}

// ─── Focus leak trend ───────────────────────────────────────────────────────

/** One day's focus-leak trend point (total leaks + per-session average). */
export interface LeakTrendPoint {
  date: string
  leaks: number
  sessions: number
  avgPerSession: number | null
}

/** Aggregate focus-session leaks per day, sorted by date. */
export function focusLeakTrend(sessions: { startedAt: string; leaks: number }[]): LeakTrendPoint[] {
  const byDay = new Map<string, { leaks: number; sessions: number }>()
  for (const s of sessions) {
    const date = s.startedAt.slice(0, 10)
    const cur = byDay.get(date) ?? { leaks: 0, sessions: 0 }
    cur.leaks += Math.max(0, s.leaks)
    cur.sessions += 1
    byDay.set(date, cur)
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({
      date,
      leaks: v.leaks,
      sessions: v.sessions,
      avgPerSession: v.sessions === 0 ? null : Math.round((v.leaks / v.sessions) * 10) / 10,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

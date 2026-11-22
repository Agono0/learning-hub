/**
 * Metrics (S3-30) — per-day records, aggregates, hand-rolled line-chart
 * geometry, and the weeks-aligned activity heatmap (S3-89).
 *
 * One record shape ({ day: 'YYYY-MM-DD', value }) covers every daily series
 * — tracked minutes (from time logs), review counts (from revlog), counters
 * — so the charts are series-agnostic and S3-19's metrics handler can feed
 * additional series without new geometry.
 *
 * Pure module: no I/O, no clock reads — `today` is always a parameter. The
 * geometry outputs are NORMALIZED COORDINATES for viewBox-space SVG (the
 * analytics-page pattern), so the page renders charts without a chart lib.
 */
import { z } from 'zod'

// ── Records ─────────────────────────────────────────────────────────────────

/** One per-day metric record. */
export const metricDaySchema = z.object({
  /** `YYYY-MM-DD` calendar day. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  /** Non-negative daily value (ms, counts, minutes — the series decides). */
  value: z.number().nonnegative(),
})
export type MetricDay = z.infer<typeof metricDaySchema>

/**
 * Fold session rows into per-day records (the /api/tasks-time shape: one
 * row per tracked session). Sums `sessionMs` per `day`, sorted ascending —
 * the canonical MetricDay[] the charts consume.
 */
export function metricDaysFromSessions(
  rows: Array<{ day: string; sessionMs: number }>,
): MetricDay[] {
  const byDay = new Map<string, number>()
  for (const row of rows) {
    const day = row.day.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + Math.max(0, row.sessionMs))
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([day, value]) => ({ day, value }))
}

// ── Aggregates ──────────────────────────────────────────────────────────────

/** Summary statistics over a per-day series. */
export interface MetricAggregate {
  /** Sum of all values (ms for time series). */
  total: number
  /** Days with value > 0. */
  activeDays: number
  /** `total / activeDays`; 0 when no active day. */
  avgPerActiveDay: number
  /** The busiest day, or null for an empty series. */
  maxDay: MetricDay | null
  /** Consecutive active days ending at the series' last active day. */
  currentStreak: number
  /** Best consecutive-active-days run anywhere in the series. */
  longestStreak: number
}

/**
 * Aggregate a per-day series. Days need not be contiguous — streak math
 * walks CALENDAR days (a gap of ≥1 inactive day breaks a streak), sorting
 * internally, so sparse series still produce honest streaks.
 */
export function aggregateMetricDays(days: MetricDay[]): MetricAggregate {
  const sorted = [...days]
    .map((d) => metricDaySchema.parse(d))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  const active = sorted.filter((d) => d.value > 0)
  const total = sorted.reduce((sum, d) => sum + d.value, 0)
  const maxDay =
    active.length > 0 ? active.reduce((best, d) => (d.value > best.value ? d : best)) : null

  // Consecutive active calendar days (dayKey + 1 step, computed via UTC).
  const dayPlus = (day: string, n: number): string => {
    const [y, m, d] = day.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + n))
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
  }
  const activeSet = new Set(active.map((d) => d.day))
  let longest = 0
  for (const d of active) {
    const prev = dayPlus(d.day, -1)
    if (activeSet.has(prev)) continue // not a run start
    let run = 1
    let cursor = d.day
    while (activeSet.has(dayPlus(cursor, 1))) {
      cursor = dayPlus(cursor, 1)
      run += 1
    }
    longest = Math.max(longest, run)
  }
  let current = 0
  if (active.length > 0) {
    const last = active[active.length - 1].day
    current = 1
    let cursor = last
    while (activeSet.has(dayPlus(cursor, -1))) {
      cursor = dayPlus(cursor, -1)
      current += 1
    }
  }

  return {
    total,
    activeDays: active.length,
    avgPerActiveDay: active.length > 0 ? total / active.length : 0,
    maxDay,
    currentStreak: current,
    longestStreak: longest,
  }
}

// ── Line chart geometry ─────────────────────────────────────────────────────

/** A point in viewBox space for the hand-rolled SVG polyline. */
export interface LinePoint {
  x: number
  y: number
  day: string
  value: number
}

/**
 * Map a per-day series onto an SVG polyline's coordinates.
 *
 * x: index-ordered across the padded width (index, NOT calendar distance —
 * a 30-day window with 3 active days still spreads its points, and gaps
 * read as spacing, not fake zeros). y: value scaled against the series max
 * with the baseline at the bottom (height - padY); all-zero series sit on
 * the baseline. Sorted internally by day; returns [] for an empty series.
 */
export function buildLinePoints(
  days: MetricDay[],
  opts: { width: number; height: number; padX?: number; padY?: number },
): LinePoint[] {
  const sorted = [...days]
    .map((d) => metricDaySchema.parse(d))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  if (sorted.length === 0) return []
  const padX = opts.padX ?? 8
  const padY = opts.padY ?? 8
  const innerW = Math.max(1, opts.width - padX * 2)
  const innerH = Math.max(1, opts.height - padY * 2)
  const max = Math.max(...sorted.map((d) => d.value))
  const span = sorted.length === 1 ? 1 : sorted.length - 1
  return sorted.map((d, i) => ({
    x: padX + (i / span) * innerW,
    y: max === 0 ? opts.height - padY : opts.height - padY - (d.value / max) * innerH,
    day: d.day,
    value: d.value,
  }))
}

// ── Activity heatmap (S3-89) ────────────────────────────────────────────────

/** Intensity levels 0 (none) … 4 (peak) — one shade per level in the UI. */
export const HEATMAP_LEVELS = 4 as const

/** One heatmap cell: the day it represents and where it sits in the grid. */
export interface HeatmapCell {
  /** `YYYY-MM-DD`. */
  day: string
  value: number
  /** 0 = no activity, 1..4 = quartile of the window's max. */
  level: 0 | 1 | 2 | 3 | 4
  /** Week column (0 = oldest week). */
  column: number
  /** Weekday row, Monday = 0 … Sunday = 6. */
  row: number
}

/** The heatmap grid: cells + layout facts the SVG needs. */
export interface ActivityHeatmap {
  cells: HeatmapCell[]
  /** Number of week columns actually rendered (≤ the requested weeks). */
  columns: number
  /** Window max (0 for an empty window). */
  max: number
}

/** Monday-based weekday index of a day key (JS Sunday=0 → Monday=0). */
function mondayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** `day ± n` as a day key (UTC calendar arithmetic). */
function dayShift(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + n))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

/**
 * Build a GitHub-style activity heatmap ending at `today`'s week
 * (Monday-aligned, today INCLUDED, no future cells) covering `weeks` weeks.
 *
 * Levels: 0 for zero values, else `ceil(value / max * HEATMAP_LEVELS)`
 * clamped to 1..4 — quartiles of the WINDOW max, so the shape stays honest
 * across sparse and dense windows. Values outside the window are ignored
 * (the caller chooses the window; the page shows what it asked for).
 * Total: never throws on junk days (invalid keys are skipped).
 */
export function buildActivityHeatmap(
  days: MetricDay[],
  weeks: number,
  today: string,
): ActivityHeatmap {
  const cleanWeeks = Math.max(1, Math.floor(weeks))
  const start = dayShift(today, -mondayIndex(today) - (cleanWeeks - 1) * 7)
  const byDay = new Map<string, number>()
  for (const d of days) {
    const parsed = metricDaySchema.safeParse(d)
    if (parsed.success) byDay.set(parsed.data.day, Math.max(0, parsed.data.value))
  }
  const cells: HeatmapCell[] = []
  let max = 0
  for (let i = 0; ; i++) {
    const day = dayShift(start, i)
    if (day > today) break
    const value = byDay.get(day) ?? 0
    if (value > max) max = value
    cells.push({
      day,
      value,
      level: 0,
      column: Math.floor(i / 7),
      row: mondayIndex(day),
    })
    if (i > cleanWeeks * 7 + 7) break // safety valve; today's rule exits first
  }
  for (const cell of cells) {
    cell.level =
      cell.value === 0 || max === 0
        ? 0
        : (Math.min(HEATMAP_LEVELS, Math.max(1, Math.ceil((cell.value / max) * HEATMAP_LEVELS))) as
            1 | 2 | 3 | 4)
  }
  return { cells, columns: cleanWeeks, max }
}

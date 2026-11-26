'use client'

/**
 * Metrics (S3-30) — per-day records, aggregates, hand-rolled SVG charts and
 * the activity heatmap, over REAL data already served by landed handlers:
 *
 * - tracked time: `GET /api/tasks-time?from&to` (S3-18 session log) folded
 *   into per-day records by the core `metricDaysFromSessions`;
 * - reviews: `GET /api/analytics`'s `heatmap` payload (daily review counts,
 *   core `heatmapData` — reused, not duplicated).
 *
 * The charts are hand-rolled SVG (analytics-page pattern: viewBox +
 * `var(--hub-border)`/`var(--ac-strong)` tokens) — no chart lib. Geometry
 * lives in pure core (`buildLinePoints`, `buildActivityHeatmap`, S3-89) and
 * is unit-tested there; this page only maps tokens to shades.
 *
 * Honest empty states per series; SSR renders the pending shell (ranges +
 * `today` are client-only, hydration-safe). When S3-19's metrics handler
 * lands it can feed additional series — the record shape already fits.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, BarChart3 } from 'lucide-react'
import { apiGet } from '@/lib/transport'
import { Badge, EmptyState, PageHeader } from '@/ui'
import { EvaluationSheet } from '@/components/tasks/EvaluationSheet'
import { ImpactStars } from '@/components/tasks/ImpactStars'
import { ClayIn } from '@/lib/motion'
import {
  aggregateMetricDays,
  buildActivityHeatmap,
  buildLinePoints,
  metricDaysFromSessions,
  type MetricDay,
} from '@learning-hub/core/metrics'

/** One review-count point from /api/analytics's heatmap payload. */
interface ReviewPoint {
  date: string
  count: number
}

/** How many weeks the heatmap window covers. */
const HEATMAP_WEEKS = 12

/** How many days the line-chart window covers. */
const LINE_DAYS = 30

/** Heat level → fill token (calm indigo ramp, no reds). */
const HEAT_FILL = [
  'var(--heat-0)',
  'var(--ac-soft)',
  'var(--ac-soft)',
  'var(--ac-strong)',
  'var(--ac-strong)',
] as const

/** Local `YYYY-MM-DD` offset by days (client-only). */
function localDayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Calm duration text for the tracked-time series. */
function formatMs(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes <= 0) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** A hand-rolled SVG line chart (viewBox space; tokens, no chart lib). */
function LineChart({
  points,
  height,
}: {
  points: Array<{ x: number; y: number }>
  height: number
}) {
  const width = 320
  if (points.length === 0) return null
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-32 w-full select-none"
      role="img"
      aria-label="Daily values line chart"
    >
      <line
        x1="8"
        y1={height - 8}
        x2={width - 8}
        y2={height - 8}
        stroke="var(--hub-border)"
        strokeWidth="1"
      />
      <path d={path} fill="none" stroke="var(--ac-strong)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--ac-strong)" />
      ))}
    </svg>
  )
}

/** Aggregate stat block (honest zeros when the series is empty). */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)">
      <p className="text-xs text-tertiary">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-strong">{value}</p>
    </div>
  )
}

export default function MetricsPage() {
  const [today, setToday] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [tzOffset, setTzOffset] = useState(0)

  useEffect(() => {
    setToday(localDayKey(0))
    setRangeStart(localDayKey(-HEATMAP_WEEKS * 7))
    setTzOffset(new Date().getTimezoneOffset())
  }, [])

  const sessions = useQuery<{ logs: Array<{ day: string; sessionMs: number }> }>({
    queryKey: ['tasks-time', 'metrics', rangeStart, today],
    queryFn: () =>
      apiGet<{ logs: Array<{ day: string; sessionMs: number }> }>('/api/tasks-time', {
        from: rangeStart,
        to: today,
      }),
    enabled: rangeStart !== '' && today !== '',
  })

  const qc = useQueryClient()
  const metricDaysQ = useQuery<{ days: Array<{ day: string; impact: number | null }> }>({
    queryKey: ['tasks-metrics', 'strip', rangeStart, today],
    queryFn: () =>
      apiGet<{ days: Array<{ day: string; impact: number | null }> }>('/api/tasks-metrics', {
        from: rangeStart,
        to: today,
      }),
    enabled: rangeStart !== '' && today !== '',
  })
  const metricDayRows = metricDaysQ.data?.days

  const reviews = useQuery<{ heatmap: ReviewPoint[] }>({
    queryKey: ['analytics-heatmap', tzOffset],
    queryFn: () => apiGet<{ heatmap: ReviewPoint[] }>('/api/analytics', { tzOffset }),
    enabled: today !== '',
  })

  /** Tracked minutes per day (ms values) within the window. */
  const trackedDays: MetricDay[] = useMemo(() => {
    if (!sessions.data || today === '') return []
    return metricDaysFromSessions(sessions.data.logs).filter(
      (d) => d.day >= rangeStart && d.day <= today,
    )
  }, [sessions.data, rangeStart, today])

  /** Review counts per day within the window. */
  const reviewDays: MetricDay[] = useMemo(() => {
    if (!reviews.data || today === '') return []
    return reviews.data.heatmap
      .map((p) => ({ day: p.date.slice(0, 10), value: p.count }))
      .filter((d) => d.day >= rangeStart && d.day <= today)
  }, [reviews.data, rangeStart, today])

  const lineWindow = useMemo(() => {
    const start = localDayKey(-(LINE_DAYS - 1))
    return {
      start,
      tracked: trackedDays.filter((d) => d.day >= start),
      reviews: reviewDays.filter((d) => d.day >= start),
    }
  }, [trackedDays, reviewDays])

  const trackedAgg = useMemo(() => aggregateMetricDays(trackedDays), [trackedDays])
  const reviewAgg = useMemo(() => aggregateMetricDays(reviewDays), [reviewDays])
  const trackedPoints = useMemo(
    () => buildLinePoints(lineWindow.tracked, { width: 320, height: 128, padX: 8, padY: 8 }),
    [lineWindow],
  )
  const reviewPoints = useMemo(
    () => buildLinePoints(lineWindow.reviews, { width: 320, height: 128, padX: 8, padY: 8 }),
    [lineWindow],
  )
  const heatmap = useMemo(
    () => (today === '' ? null : buildActivityHeatmap(trackedDays, HEATMAP_WEEKS, today)),
    [trackedDays, today],
  )
  const reviewHeatmap = useMemo(
    () => (today === '' ? null : buildActivityHeatmap(reviewDays, HEATMAP_WEEKS, today)),
    [reviewDays, today],
  )

  const loading = (sessions.isLoading || reviews.isLoading) && today !== ''

  return (
    <div className="space-y-6">
      <ClayIn>
        <PageHeader
          icon={<Activity className="h-6 w-6 text-indigo-400" />}
          title="Metrics"
          subtitle="Your learning engine's vital signs — tracked time and review volume, honestly plotted"
        />
      </ClayIn>

      {loading ? <p className="text-sm text-tertiary">Loading your metrics…</p> : null}

      {/* Tracked time series (S3-18 time log) */}
      <ClayIn>
        <section className="panel space-y-4" aria-label="Tracked time metrics">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-strong">
              <BarChart3 className="h-4 w-4" aria-hidden /> Tracked time
            </h2>
            <Badge tone="neutral">last {HEATMAP_WEEKS} weeks</Badge>
          </div>
          {trackedDays.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-8 w-8" aria-hidden />}
              title="No tracked time yet"
            >
              Track a session from a task or a focus run — the daily totals plot themselves here.
            </EmptyState>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Total" value={formatMs(trackedAgg.total)} />
                <Stat label="Active days" value={String(trackedAgg.activeDays)} />
                <Stat label="Avg / active day" value={formatMs(trackedAgg.avgPerActiveDay)} />
                <Stat
                  label="Best day"
                  value={trackedAgg.maxDay ? `${formatMs(trackedAgg.maxDay.value)}` : '—'}
                />
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold text-secondary">
                  Daily tracked time (last 30 days)
                </h3>
                <LineChart points={trackedPoints} height={128} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold text-secondary">Activity heatmap</h3>
                {heatmap && heatmap.max > 0 ? (
                  <div className="scroll-x">
                    <svg
                      viewBox={`0 0 ${heatmap.columns * 16} 112`}
                      className="h-28 w-full min-w-[480px] select-none"
                      role="img"
                      aria-label="Tracked-time activity heatmap, one column per week"
                    >
                      {heatmap.cells.map((cell) => (
                        <rect
                          key={cell.day}
                          x={cell.column * 16 + 2}
                          y={cell.row * 16 + 2}
                          width="12"
                          height="12"
                          rx="3"
                          fill={HEAT_FILL[cell.level]}
                        >
                          <title>{`${cell.day}: ${formatMs(cell.value)}`}</title>
                        </rect>
                      ))}
                    </svg>
                  </div>
                ) : (
                  <p className="text-xs text-tertiary">
                    The window is empty — nothing to shade yet.
                  </p>
                )}
                <p className="mt-2 text-xs text-tertiary">
                  Streak: {trackedAgg.currentStreak} day{trackedAgg.currentStreak === 1 ? '' : 's'}{' '}
                  · longest {trackedAgg.longestStreak}
                </p>
              </div>
            </>
          )}
        </section>
      </ClayIn>

      {/* Review volume series (analytics payload, reused) */}
      <ClayIn>
        <section className="panel space-y-4" aria-label="Review metrics">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-strong">Reviews</h2>
            <Badge tone="neutral">last {HEATMAP_WEEKS} weeks</Badge>
          </div>
          {reviewDays.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-8 w-8" aria-hidden />}
              title="No reviews logged yet"
            >
              Run a review session — daily volume shows up here with the same honest plots.
            </EmptyState>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Total" value={String(reviewAgg.total)} />
                <Stat label="Active days" value={String(reviewAgg.activeDays)} />
                <Stat
                  label="Avg / active day"
                  value={String(Math.round(reviewAgg.avgPerActiveDay))}
                />
                <Stat
                  label="Best day"
                  value={reviewAgg.maxDay ? String(reviewAgg.maxDay.value) : '—'}
                />
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold text-secondary">
                  Daily reviews (last 30 days)
                </h3>
                <LineChart points={reviewPoints} height={128} />
              </div>
              {reviewHeatmap && reviewHeatmap.max > 0 ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-secondary">Review heatmap</h3>
                  <div className="scroll-x">
                    <svg
                      viewBox={`0 0 ${reviewHeatmap.columns * 16} 112`}
                      className="h-28 w-full min-w-[480px] select-none"
                      role="img"
                      aria-label="Review activity heatmap, one column per week"
                    >
                      {reviewHeatmap.cells.map((cell) => (
                        <rect
                          key={cell.day}
                          x={cell.column * 16 + 2}
                          y={cell.row * 16 + 2}
                          width="12"
                          height="12"
                          rx="3"
                          fill={HEAT_FILL[cell.level]}
                        >
                          <title>{`${cell.day}: ${cell.value} reviews`}</title>
                        </rect>
                      ))}
                    </svg>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* S3-96: the evaluation sheet for today + the impact-star strip
            across the chart window (writes ride POST /api/tasks-metrics). */}
        <section className="panel space-y-4" aria-label="Daily evaluation">
          <h2 className="text-sm font-semibold text-strong">Daily evaluation</h2>
          <div className="flex flex-wrap items-center gap-3">
            {(metricDayRows ?? []).slice(-7).map((row) => (
              <span key={row.day} className="flex items-center gap-1.5 text-xs text-tertiary">
                {row.day.slice(5)}
                <ImpactStars impact={row.impact} />
              </span>
            ))}
            {(metricDayRows ?? []).length === 0 && (
              <span className="text-xs text-tertiary">
                Rate a day below and the stars land here.
              </span>
            )}
          </div>
          {today !== '' && (
            <EvaluationSheet
              day={today}
              onSaved={() => void qc.invalidateQueries({ queryKey: ['tasks-metrics'] })}
            />
          )}
        </section>
      </ClayIn>
    </div>
  )
}

'use client'

/**
 * Momentum — a half-span glimpse of the analytics page: the 30-day review
 * heatmap as compact tinted squares plus the next-7-days due forecast as a
 * mini bar row. Hand-rolled (tinted spans + flex bars), exactly the analytics
 * page's house style — no chart library.
 *
 * Runs its own query against GET /api/analytics (same endpoint, same field
 * shapes as app/analytics/page.tsx: `heatmap` and `forecast`), with a 5-minute
 * staleTime so the dashboard stays cheap. Honest on every state: Skeleton
 * while loading, Callout on failure, an honest line when there's no data.
 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { apiGet } from '@/lib/transport'
import { Callout, Skeleton } from '@/ui'
import type { WidgetProps } from './widgets'

/** One row of the analytics heatmap/forecast series (`{ date, count }`). */
interface AnalyticsPoint {
  date: string
  count: number
}

/** The two datasets the glimpse renders from GET /api/analytics. */
interface AnalyticsGlimpseResponse {
  heatmap: AnalyticsPoint[]
  forecast: AnalyticsPoint[]
}

/** The forecast row shows the next 7 day buckets (the trailing `later` bucket is skipped). */
const FORECAST_DAYS = 7

/**
 * Momentum widget — "am I keeping the loop alive this month?" Tinted squares
 * heatmap tint: hub-accent alpha scaled by day volume relative
 * to the busiest day); forecast bars reuse the analytics histogram style at
 * miniature scale.
 */
export function AnalyticsGlimpseWidget(_props: WidgetProps) {
  const { data, isLoading, isError, error } = useQuery<AnalyticsGlimpseResponse>({
    queryKey: ['analytics', 'glimpse'],
    queryFn: () =>
      apiGet<AnalyticsGlimpseResponse>(`/api/analytics?tzOffset=${new Date().getTimezoneOffset()}`),
    staleTime: 5 * 60_000,
  })

  const heatmap = data?.heatmap ?? []
  const heatMax = Math.max(1, ...heatmap.map((h) => h.count))
  const forecast = (data?.forecast ?? []).filter((f) => f.date !== 'later').slice(0, FORECAST_DAYS)
  const forecastMax = Math.max(1, ...forecast.map((f) => f.count))

  return (
    <section className="panel h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-tertiary">
          <Activity className="h-3.5 w-3.5" /> Momentum
        </div>
        <Link href="/analytics" className="text-[10px] text-ac-text hover:underline">
          analytics →
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <Callout tone="danger">
          Couldn&apos;t load your momentum data —{' '}
          {error instanceof Error ? error.message : 'try again'}
        </Callout>
      ) : (
        <>
          {/* 30-day heatmap — the analytics page's tinted-span style, compact */}
          <div className="scroll-x mt-3">
            <div className="flex min-w-max gap-1">
              {heatmap.map((h) => (
                <span
                  key={h.date}
                  title={`${h.date}: ${h.count} reviews`}
                  className="h-5 w-5 rounded-[3px]"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--ac-strong) ${Math.round((0.15 + 0.85 * (h.count / heatMax)) * 100)}%, transparent)`,
                  }}
                />
              ))}
              {heatmap.length === 0 && <p className="text-sm text-tertiary">No reviews yet.</p>}
            </div>
          </div>

          {/* next-7-days forecast — mini histogram, hub-accent bars */}
          <div className="mt-4">
            <p className="text-[10px] text-tertiary">Cards due — next 7 days</p>
            <div className="mt-1 flex h-16 items-end gap-px">
              {forecast.map((f) => (
                <div key={f.date} className="group relative flex-1" title={`${f.date}: ${f.count}`}>
                  <div
                    className="w-full rounded-t-sm bg-hub-accent"
                    style={{
                      height: `${(f.count / forecastMax) * 100}%`,
                      minHeight: f.count > 0 ? 2 : 0,
                    }}
                  />
                </div>
              ))}
              {forecast.length === 0 && (
                <p className="text-sm text-tertiary">Nothing scheduled yet.</p>
              )}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-neutral-600 dark:text-faint">
              <span>today</span>
              <span>+{FORECAST_DAYS}d</span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

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
 *
 * Motion (transform/opacity only, per the motion law): heatmap cells rise +
 * fade in staggered via the committed `Stagger`/`StaggerItem` foundation;
 * forecast bars grow from their bottom edge via an SSR-safe `scaleY` entrance.
 * Both animate client-side only when `motionOK()` — reduced-motion, e-ink and
 * no-JS users get the static render, and the SSR HTML always shows the final
 * state. (One mechanism per container: the heatmap keeps its `Stagger`; the
 * GSAP scroll-reveal mandate applies to the timeline/insights containers.)
 *
 * Accessibility (audit G4): the heatmap squares and forecast bars expose
 * their data as `role="img"` + `aria-label` ("date: N") instead of relying on
 * the hover-only `title` attribute — the `title`s stay for sighted hover.
 */
import React, { useEffect, useLayoutEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion, useAnimationControls } from 'framer-motion'
import { Activity } from 'lucide-react'
import { apiGet } from '@/lib/transport'
import { Stagger, StaggerItem, claySpring, motionOK, staggerDelay } from '@/lib/motion'
import { Callout, Skeleton } from '@/ui'
import { SectionHeader } from '@/components/ui/section-header'
import { HoverLiftSection } from './widgets'
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
 * Isomorphic layout effect — local mirror of the committed pattern in
 * `@/lib/motion` (which does not export its own): `useLayoutEffect` on the
 * client so `controls.set()` applies before the browser paints (no flash of
 * hidden bars), `useEffect` on the server — a no-op that also avoids React's
 * SSR `useLayoutEffect` warning. The dashboard motion brief duplicates the
 * small pattern here instead of growing the foundation's public surface.
 */
const useIsoLayoutEffect: typeof useLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * One forecast bar with an SSR-safe scaleY entrance. The bar's height stays the
 * static inline percentage — layout never animates; only `transform: scaleY`
 * runs 0→1 from the bottom edge on the clay spring, staggered per bar via
 * `staggerDelay(index)` (motion-law cap built in).
 *
 * Gating + SSR — mirrors the committed `ClayIn` implementation pattern:
 * `initial={false}` renders the final, fully-grown bar in the SSR HTML and the
 * first client render (no hidden styles in the HTML); the hidden `scaleY: 0`
 * state is applied imperatively via `controls.set()` inside the isomorphic
 * layout effect — and only when `motionOK()` (reduced-motion, e-ink and no-JS
 * users simply see the static bars) — before `controls.start()` grows it. The
 * element stays the original `div` (`motion.div`), and only transform animates
 * — never height or box-shadow.
 */
function ForecastBar({
  index,
  heightPct,
  minHeightPx,
}: {
  index: number
  heightPct: number
  minHeightPx: number
}) {
  const controls = useAnimationControls()

  useIsoLayoutEffect(() => {
    if (!motionOK()) return
    controls.set({ scaleY: 0 })
    controls.start({ scaleY: 1, transition: { ...claySpring, delay: staggerDelay(index) } })
  }, [controls, index])

  return (
    <motion.div
      initial={false}
      animate={controls}
      className="w-full rounded-t-sm bg-hub-accent"
      style={{
        height: `${heightPct}%`,
        minHeight: minHeightPx,
        transformOrigin: 'bottom',
      }}
    />
  )
}

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
    <HoverLiftSection className="panel h-full">
      <SectionHeader
        icon={Activity}
        title="Momentum"
        action={
          <Link href="/analytics" className="text-xs text-ac-text hover:underline">
            analytics →
          </Link>
        }
      />

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
          {/* 30-day heatmap — the analytics page's tinted-span style, compact.
              The .scroll-x wrapper stays on its own element; the inner flex row
              doubles as the Stagger container so the cells rise in sequence
              (index stagger capped at 260ms handles the 30-child overflow).
              Each square is a role="img" with a date+count aria-label (G4). */}
          <div className="scroll-x mt-3">
            <Stagger className="flex min-w-max gap-1">
              {heatmap.map((h, i) => (
                <StaggerItem key={h.date} index={i}>
                  {/* `block` keeps the tinted square sizing now that the span
                      sits inside the StaggerItem's flex-item div (a non-flex
                      inline span would ignore h-5/w-5). */}
                  <span
                    role="img"
                    aria-label={`${h.date}: ${h.count} reviews`}
                    title={`${h.date}: ${h.count} reviews`}
                    className="block h-5 w-5 rounded-[3px]"
                    style={{
                      backgroundColor: `color-mix(in oklab, var(--ac-strong) ${Math.round((0.15 + 0.85 * (h.count / heatMax)) * 100)}%, transparent)`,
                    }}
                  />
                </StaggerItem>
              ))}
              {heatmap.length === 0 && <p className="text-sm text-tertiary">No reviews yet.</p>}
            </Stagger>
          </div>

          {/* next-7-days forecast — mini histogram, hub-accent bars. Each bar
              carries a role="img" + date/count aria-label so the chart is not
              hover-only (G4). */}
          <div className="mt-4">
            <p className="text-xs text-tertiary">Cards due — next 7 days</p>
            <div className="mt-1 flex h-16 items-end gap-px">
              {forecast.map((f, i) => (
                <div
                  key={f.date}
                  role="img"
                  aria-label={`${f.date}: ${f.count} cards due`}
                  title={`${f.date}: ${f.count}`}
                  className="group relative flex-1"
                >
                  <ForecastBar
                    index={i}
                    heightPct={(f.count / forecastMax) * 100}
                    minHeightPx={f.count > 0 ? 2 : 0}
                  />
                </div>
              ))}
              {forecast.length === 0 && (
                <p className="text-sm text-tertiary">Nothing scheduled yet.</p>
              )}
            </div>
            <div className="mt-1 flex justify-between text-xs text-neutral-600 dark:text-faint">
              <span>today</span>
              <span>+{FORECAST_DAYS}d</span>
            </div>
          </div>
        </>
      )}
    </HoverLiftSection>
  )
}

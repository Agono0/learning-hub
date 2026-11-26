'use client'

/**
 * Today — the dashboard. Renders from the widget registry
 * (components/dashboard/widgets.tsx): first-party and plugin widgets appear by
 * registering there, and the learner reorders everything (persisted locally).
 * The page leads with the header (title + the one primary action), then the
 * quick-review strip — the header-first order is the audit's L3 fix (the
 * dashboard no longer opens with an unlabeled strip of controls). On mount the
 * content blocks (header, quick review, banners, widget rows) rise + fade in
 * once, in sequence (Entrance → ClayIn; transform/opacity only, stagger capped
 * <300ms — the loading skeletons and error callout stay instant).
 */
import React, { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, RotateCcw, Sparkles, Sprout } from 'lucide-react'
import { levelFromXp } from '@learning-hub/core/xp'
import { nextFreshStart, streakBrokeWithinDays } from '@learning-hub/core/freshStart'
import { apiGet } from '@/lib/transport'
import { BentoGrid, Button, Callout, IconButton, PageHeader, Skeleton } from '@/ui'
import { TodayHeroTile, TodayStatTiles } from '@/components/dashboard/TodayHero'
import { DEFAULT_ORDER, useDashboardWidgets } from '@/components/dashboard/widgets'
import { ErrorBoundary } from '@/ui'
import { classifyRequestError } from '@/lib/use-api-error'
import { QuickReviewWidget } from '@/components/QuickReviewWidget'
import { ProfileTunedBanner } from '@/components/dashboard/ProfileTunedBanner'
import { NextUpCard } from '@/components/dashboard/NextUpCard'
import type { DashboardData } from '@/server/handlers/dashboard/route'
import { queryKeys } from '@/lib/query-keys'
import { ClayIn, staggerDelay } from '@/lib/motion'

const ORDER_KEY_HINT = 'Order is saved on this device. Reset restores the default layout.'

/**
 * Fixed sequence slots for the dashboard's mount choreography. Each animated
 * block takes one slot; the motion foundation staggers slots 40ms apart and
 * caps the delay at 260ms (`staggerDelay`), keeping the whole entrance under
 * the 300ms motion-law budget. Slots are absolute (not sequential) so a
 * conditional banner that is absent never shifts the delays of later blocks.
 */
const ENTRANCE_SLOT = {
  header: 0,
  quickReview: 1,
  freshBanner: 2,
  nudge: 3,
  rowsBase: 4,
} as const

interface EntranceProps {
  /** Sequence slot for this block (`ENTRANCE_SLOT`). */
  step: number
  /** Content to reveal. */
  children: React.ReactNode
  /** Optional className forwarded to the rendered element (panel/grid classes live here). */
  className?: string
  /** Rendered tag. Defaults to `'div'`; widget rows use `'section'` to keep the DOM shape. */
  as?: 'div' | 'section'
}

/**
 * Dashboard entrance block: rises + fades in once, on mount, at its sequence
 * slot (`staggerDelay(step)` on the clay spring) — one-time list choreography
 * per the motion law (first render only).
 *
 * Why a wrapper instead of a bare `ClayIn`: the slot is captured on FIRST mount
 * (`useRef`), so later re-renders — the 30s dashboard poll, or widget reorders
 * that change a row's position — keep the same delay and never re-trigger the
 * rise (ClayIn re-animates when its `delayS` prop changes). SSR-safe: ClayIn
 * renders the final state server-side and animates client-side only when motion
 * is allowed (`motionOK`).
 */
function Entrance({ step, children, className, as = 'div' }: EntranceProps) {
  const stepRef = useRef(step)
  return (
    <ClayIn as={as} className={className} delayS={staggerDelay(stepRef.current)}>
      {children}
    </ClayIn>
  )
}

export default function DashboardPage() {
  const {
    data: d,
    isError,
    refetch,
    error: queryError,
  } = useQuery<DashboardData>({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiGet<DashboardData>('/api/dashboard'),
    // Live dashboard: poll every 30s while the tab is visible (the callback
    // only runs client-side), pause in background tabs, and refresh when the
    // learner comes back. Per-key override — the global default stays off.
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 30_000 : false,
    refetchOnWindowFocus: true,
  })

  const { widgets, order, setOrder } = useDashboardWidgets()

  function move(id: string, dir: -1 | 1) {
    const idx = order.indexOf(id)
    const next = idx + dir
    if (idx < 0 || next < 0 || next >= order.length) return
    const copy = [...order]
    ;[copy[idx], copy[next]] = [copy[next]!, copy[idx]!]
    setOrder(copy)
  }

  if (isError) {
    // One voice for every failure: the shared taxonomy decides the copy and
    // whether "Try again" can plausibly work.
    const err = classifyRequestError(queryError)
    return (
      <Callout tone="danger" title="Couldn't load today's dashboard">
        <div className="mt-1 space-y-2">
          <p>
            <span className="font-medium">{err.title}.</span> {err.recovery}
          </p>
          {err.canRetry && (
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          )}
        </div>
      </Callout>
    )
  }

  if (!d) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-11 w-44" />
        </div>
        {/* Same bento geometry as the loaded page (hero + stat stack, focus + quick review,
            review loop), so data arriving does not reflow the layout. */}
        <BentoGrid>
          <Skeleton className="bento-lg bento-tall min-h-[16rem]" />
          <Skeleton className="bento-stat min-h-[7.5rem]" />
          <Skeleton className="bento-stat min-h-[7.5rem]" />
          <Skeleton className="bento-stat min-h-[10rem]" />
          <Skeleton className="bento-lg min-h-[10rem]" />
        </BentoGrid>
        <Skeleton className="h-48" />
      </div>
    )
  }

  const level = levelFromXp(d.xpTotal)

  // Fresh-start nudge (Dai, Milkman & Riis 2014): after a streak breaks, the
  // next temporal landmark is a good reset day — but only while the break is
  // fresh (≤ 7 days). Skipped on landmark days, where the banner above already
  // delivers the fresh-start framing.
  const nudge =
    !d.freshStart && streakBrokeWithinDays(d.streak.lastActiveDate, new Date())
      ? nextFreshStart(new Date())
      : null

  // Half-width widgets pair up in reading order (two per row on md+).
  const rows: Array<Array<{ id: string; node: React.ReactNode; chrome: boolean; title: string }>> =
    []
  let pendingHalf: Array<{ id: string; node: React.ReactNode; chrome: boolean; title: string }> = []
  for (const w of widgets) {
    const Widget = w.component
    const entry = {
      id: w.id,
      node: (
        <ErrorBoundary key={w.id} label={w.title}>
          <Widget data={d} />
        </ErrorBoundary>
      ),
      chrome: Boolean(w.chrome),
      title: w.title,
    }
    if (w.span === 'full') {
      if (pendingHalf.length > 0) {
        rows.push(pendingHalf)
        pendingHalf = []
      }
      rows.push([entry])
    } else {
      pendingHalf.push(entry)
      if (pendingHalf.length === 2) {
        rows.push(pendingHalf)
        pendingHalf = []
      }
    }
  }
  if (pendingHalf.length > 0) rows.push(pendingHalf)

  return (
    <div className="space-y-5">
      {/* Header first (audit L3): the page opens with its title and the one
          primary action, then the quick-review strip. */}
      <Entrance step={ENTRANCE_SLOT.header}>
        <PageHeader
          title="Today"
          subtitle={`${d.dateKey} · Level ${level} · ${d.xpToday} XP earned today`}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
                title={`Reset layout. ${ORDER_KEY_HINT}`}
                aria-label="Reset layout"
                onClick={() => setOrder(DEFAULT_ORDER)}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </button>
            </div>
          }
        />
      </Entrance>

      <Entrance step={ENTRANCE_SLOT.quickReview}>
        <BentoGrid>
          <TodayHeroTile data={d} />
          <TodayStatTiles data={d} />
          <QuickReviewWidget className="bento-lg" />
        </BentoGrid>
      </Entrance>

      {d.freshStart && (
        <Entrance
          step={ENTRANCE_SLOT.freshBanner}
          className="panel border-indigo-400/40 bg-indigo-600/10"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-300">
            <Sparkles className="h-4 w-4" />
            Fresh start —{' '}
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            . Today is a perfect day to begin again.
          </div>
        </Entrance>
      )}

      {nudge && (
        <Entrance step={ENTRANCE_SLOT.nudge} className="panel">
          <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-secondary">
            <Sprout className="h-4 w-4 shrink-0 text-status-success-text" />
            <span>Fresh start: {nudge.label}</span>
          </div>
        </Entrance>
      )}

      {/* Learner-profile undo banner — self-gating (renders nothing without a
          pending "lh-profile-applied" record); shown only once the page data
          has loaded, above the widget grid. Deliberately left out of the
          entrance choreography: it renders null on first render (localStorage
          is read after mount), so wrapping it would add a permanent empty div
          that shifts the space-y-5 rhythm. */}
      <ProfileTunedBanner />

      <NextUpCard data={d} />

      {rows.map((row, rowIdx) => (
        <Entrance
          key={row.map((r) => r.id).join('+')}
          as="section"
          step={ENTRANCE_SLOT.rowsBase + rowIdx}
          className={row.length === 1 ? '' : 'grid gap-3 md:grid-cols-2'}
        >
          {row.map((cell) => (
            <div key={cell.id} className="group/widget relative">
              {cell.chrome && (
                <div className="absolute -top-2 right-2 z-10 hidden gap-1 group-hover/widget:flex [@media(pointer:coarse)]:flex">
                  <IconButton
                    label={`Move ${cell.title} earlier`}
                    disabled={rowIdx === 0 && cell.id === order[0]}
                    onClick={() => move(cell.id, -1)}
                    className="rounded-md border border-neutral-200 bg-white p-1.5 text-faint shadow-xs hover:text-neutral-700 dark:border-(--hub-border) dark:bg-(--hub-panel) dark:hover:text-neutral-200"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </IconButton>
                  <IconButton
                    label={`Move ${cell.title} later`}
                    disabled={cell.id === order[order.length - 1]}
                    onClick={() => move(cell.id, 1)}
                    className="rounded-md border border-neutral-200 bg-white p-1.5 text-faint shadow-xs hover:text-neutral-700 dark:border-(--hub-border) dark:bg-(--hub-panel) dark:hover:text-neutral-200"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </IconButton>
                </div>
              )}
              {cell.node}
            </div>
          ))}
        </Entrance>
      ))}
    </div>
  )
}

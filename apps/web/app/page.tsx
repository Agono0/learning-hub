'use client'

/**
 * Today — the dashboard. Renders from the widget registry
 * (components/dashboard/widgets.tsx): first-party and plugin widgets appear by
 * registering there, and the learner reorders everything (persisted locally).
 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Repeat2, RotateCcw, Sparkles, Sprout } from 'lucide-react'
import { levelFromXp } from '@learning-hub/core/xp'
import { nextFreshStart, streakBrokeWithinDays } from '@learning-hub/core/freshStart'
import { apiGet } from '@/lib/transport'
import { PageHeader, Skeleton } from '@/ui'
import { DEFAULT_ORDER, useDashboardWidgets } from '@/components/dashboard/widgets'
import { QuickReviewWidget } from '@/components/QuickReviewWidget'
import type { DashboardData } from '@/server/handlers/dashboard/route'

const ORDER_KEY_HINT = 'Order is saved on this device. Reset restores the default layout.'

export default function DashboardPage() {
  const { data: d } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardData>('/api/dashboard'),
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
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
    const entry = { id: w.id, node: <Widget data={d} />, chrome: Boolean(w.chrome), title: w.title }
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
      <QuickReviewWidget />
      {d.freshStart && (
        <div className="panel border-indigo-400/40 bg-indigo-600/10">
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
        </div>
      )}

      {nudge && (
        <div className="panel">
          <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <Sprout className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>Fresh start: {nudge.label}</span>
          </div>
        </div>
      )}

      <PageHeader
        title="Today"
        subtitle={`${d.dateKey} · Level ${level} · ${d.xpToday} XP earned today`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost border text-xs"
              title={ORDER_KEY_HINT}
              onClick={() => setOrder(DEFAULT_ORDER)}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset layout
            </button>
            <Link href="/review" className="btn h-11 px-6 text-base">
              <Repeat2 className="h-5 w-5" />
              {d.dueCount > 0 ? `Review ${d.dueCount} cards` : 'Start Daily Loop'}
            </Link>
          </div>
        }
      />

      {rows.map((row, rowIdx) => (
        <section
          key={row.map((r) => r.id).join('+')}
          className={row.length === 1 ? '' : 'grid gap-3 md:grid-cols-2'}
        >
          {row.map((cell) => (
            <div key={cell.id} className="group/widget relative">
              {cell.chrome && (
                <div className="absolute -top-2 right-2 z-10 hidden gap-1 group-hover/widget:flex">
                  <button
                    type="button"
                    aria-label={`Move ${cell.title} earlier`}
                    disabled={rowIdx === 0 && cell.id === order[0]}
                    onClick={() => move(cell.id, -1)}
                    className="rounded-md border border-neutral-200 bg-white p-1 text-neutral-400 shadow-xs hover:text-neutral-700 dark:border-(--hub-border) dark:bg-(--hub-panel) dark:hover:text-neutral-200"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${cell.title} later`}
                    disabled={cell.id === order[order.length - 1]}
                    onClick={() => move(cell.id, 1)}
                    className="rounded-md border border-neutral-200 bg-white p-1 text-neutral-400 shadow-xs hover:text-neutral-700 dark:border-(--hub-border) dark:bg-(--hub-panel) dark:hover:text-neutral-200"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
              )}
              {cell.node}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

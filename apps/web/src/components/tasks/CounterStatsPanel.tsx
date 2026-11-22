'use client'

/**
 * Counter stats panel (S3-31 UI) — the simple counters with SP's streaks:
 * per-counter current/best streak + total taps (core `counterStreak`,
 * S3-90), a 14-day tap sparkline (hand-rolled bars, no chart dep), and a
 * "+1" tap that POSTs the increment route (S3-91). The habits page mounts
 * it alongside the habit loop (existing habits kept — this is additive).
 */
import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Flame } from 'lucide-react'
import { counterStreak, type CounterLogDay } from '@learning-hub/core'
import { apiSend } from '@/lib/transport'
import { Badge, Button, EmptyState } from '@/ui'

/** One active counter row (the GET /api/tasks-counters shape). */
export interface CounterRow {
  id: number
  label: string
  color: string | null
  archived: boolean
}

/** Sparkline: the last `window` days as fill heights (0 = empty). */
export function sparkline(logs: readonly CounterLogDay[], today: string, window = 14): number[] {
  const byDay = new Map(logs.map((l) => [l.day, l.count]))
  const base = Date.parse(`${today}T00:00:00.000Z`)
  const out: number[] = []
  for (let i = window - 1; i >= 0; i--) {
    const day = new Date(base - i * 86_400_000).toISOString().slice(0, 10)
    const count = byDay.get(day) ?? 0
    out.push(count > 0 ? Math.min(1, count / 5) : 0)
  }
  return out
}

/** The day two weeks ago (the sparkline window start, for log queries). */
export function sparklineFrom(today: string, window = 14): string {
  return new Date(Date.parse(`${today}T00:00:00.000Z`) - (window - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

export interface CounterStatsPanelProps {
  counters: CounterRow[]
  /** counterId → the window's log rows (the page fetches /api/tasks-counters/[id]). */
  logsByCounter: Record<number, CounterLogDay[]>
  today: string
  onTapped?: (counterId: number) => void
}

export function CounterStatsPanel({
  counters,
  logsByCounter,
  today,
  onTapped,
}: CounterStatsPanelProps) {
  const [tapped, setTapped] = useState<number[]>([])

  const tap = useMutation({
    mutationFn: (id: number) =>
      apiSend(`/api/tasks-counters/${id}/increment`, 'POST', { day: today, by: 1 }),
    onSuccess: (_res, id) => {
      setTapped((prev) => [...prev, id])
      onTapped?.(id)
    },
  })

  const active = counters.filter((c) => !c.archived)

  if (active.length === 0) {
    return (
      <EmptyState icon={<Flame className="h-6 w-6" aria-hidden />} title="No counters yet">
        Simple counters — water, pages, push-ups — track daily taps with streaks. Add one from the
        counters row.
      </EmptyState>
    )
  }

  return (
    <ul className="space-y-2">
      {active.map((c) => {
        const logs = logsByCounter[c.id] ?? []
        const streak = counterStreak(logs, today)
        const bars = sparkline(logs, today)
        return (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2 dark:border-(--hub-border)"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-neutral-700 dark:text-neutral-200">
                <Flame
                  className={`mr-1 inline size-3.5 ${streak.current > 0 ? 'text-status-warning-text' : 'text-tertiary'}`}
                  aria-hidden
                />
                {c.label}
              </p>
              <div className="mt-1 flex items-end gap-0.5" aria-hidden>
                {bars.map((fill, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-sm bg-hub-accent/60"
                    style={{ height: `${4 + fill * 14}px` }}
                  />
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={streak.current > 0 ? 'warning' : 'neutral'}>
                {streak.current}d streak
              </Badge>
              <span className="hidden text-xs text-tertiary sm:inline">
                best {streak.best}d · {streak.totalDays} days
              </span>
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                disabled={tap.isPending}
                onClick={() => tap.mutate(c.id)}
                aria-label={`Log one ${c.label}`}
              >
                +1
              </Button>
            </div>
          </li>
        )
      })}
      {tapped.length > 0 && (
        <li className="sr-only" role="status">
          Logged.
        </li>
      )}
    </ul>
  )
}

export default CounterStatsPanel

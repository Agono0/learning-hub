'use client'

/**
 * Tracking-reminder dialog (S3-51) — surfaces the counters/metrics with NO
 * entry for the day so a tap (or an honest dismissal) closes the gap. The
 * PARENT computes the untracked set (it owns the day's counter logs and
 * metric row); {@link filterUntracked} is the pure helper for that math.
 *
 * One primary action per row: "Tap" records the day's increment via
 * POST /api/tasks-counters/[id]/increment and removes the row (confirm in
 * place); dismissals are remembered by the parent for the session.
 */
import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellOff } from 'lucide-react'
import { apiSend } from '@/lib/transport'
import { Button, Sheet } from '@/ui'

/** An active counter with no entry logged for the day yet. */
export interface UntrackedCounter {
  id: number
  label: string
}

/**
 * Counters the day's logs have NOT recorded (pure — the parent compares the
 * active counter list against the day's `simple_counter_logs` ids).
 */
export function filterUntracked(
  counters: UntrackedCounter[],
  loggedCounterIds: ReadonlySet<number>,
): UntrackedCounter[] {
  return counters.filter((c) => !loggedCounterIds.has(c.id))
}

/** Metric keys (metricDays.metrics) with no value recorded today. */
export function untrackedMetricKeys(
  knownKeys: readonly string[],
  dayMetrics: Record<string, number>,
): string[] {
  return knownKeys.filter((k) => !(k in dayMetrics))
}

export interface TrackingReminderDialogProps {
  open: boolean
  onClose: () => void
  day: string
  counters: UntrackedCounter[]
  /** Metric keys worth nudging (empty = counters only). */
  metricKeys?: string[]
  /** The day's metric values (for the known-keys diff). */
  dayMetrics?: Record<string, number>
  /** Called after each tap (parent refetches the logs). */
  onChanged?: () => void
}

export function TrackingReminderDialog({
  open,
  onClose,
  day,
  counters,
  metricKeys,
  dayMetrics,
  onChanged,
}: TrackingReminderDialogProps) {
  const qc = useQueryClient()
  const [tapped, setTapped] = useState<number[]>([])
  const [dismissedMetrics, setDismissedMetrics] = useState<string[]>([])

  const remaining = counters.filter((c) => !tapped.includes(c.id))
  const missingMetrics = untrackedMetricKeys(metricKeys ?? [], dayMetrics ?? {}).filter(
    (k) => !dismissedMetrics.includes(k),
  )

  const tap = useMutation({
    mutationFn: (id: number) =>
      apiSend(`/api/tasks-counters/${id}/increment`, 'POST', { day, by: 1 }),
    onSuccess: (_res, id) => {
      setTapped((prev) => [...prev, id])
      void qc.invalidateQueries({ queryKey: ['tasks-counters'] })
      onChanged?.()
    },
  })

  const allClear = remaining.length === 0 && missingMetrics.length === 0

  return (
    <Sheet open={open} onClose={onClose} title="Not tracked yet today">
      <div className="space-y-3">
        {allClear ? (
          <p className="text-sm text-secondary" role="status">
            Everything on the list is logged for {day}. Nothing to chase.
          </p>
        ) : (
          <p className="text-xs text-tertiary">
            One tap logs today's count — or dismiss what you are not tracking today.
          </p>
        )}

        {remaining.length > 0 && (
          <ul className="space-y-1">
            {remaining.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200">
                  {c.label}
                </span>
                <Button
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  disabled={tap.isPending}
                  onClick={() => tap.mutate(c.id)}
                  aria-label={`Log one ${c.label}`}
                >
                  +1 tap
                </Button>
              </li>
            ))}
          </ul>
        )}

        {tap.isError && (
          <p className="text-xs text-danger-text" role="alert">
            {tap.error instanceof Error ? tap.error.message : 'Could not log the tap.'}
          </p>
        )}

        {missingMetrics.length > 0 && (
          <div className="space-y-1">
            <p className="label">Metrics</p>
            {missingMetrics.map((k) => (
              <div key={k} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200">{k}</span>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => setDismissedMetrics((prev) => [...prev, k])}
                  aria-label={`Dismiss ${k} for today`}
                >
                  Not today
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" className="text-xs" onClick={onClose}>
          {allClear ? 'Close' : 'Later'}
        </Button>
      </div>
      <span className="sr-only" aria-hidden>
        <BellOff className="size-4" />
      </span>
    </Sheet>
  )
}

export default TrackingReminderDialog

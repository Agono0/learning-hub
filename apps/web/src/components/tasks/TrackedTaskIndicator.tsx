'use client'

/**
 * Tracked-task indicator (S3-77 UI) — the live "this task is being tracked"
 * chip: a pulsing dot plus the task's spent-so-far minutes, rendered next to
 * the row (or detail header) of the task the timer is currently bound to.
 * The tracked-title half of S3-77 ships as `useTrackedTitle` (S3-43); this
 * component is the on-surface half. Pure minute math exported for tests.
 */
import React from 'react'
import { Badge } from '@/ui'

/** Minutes spent on a task today, from its per-day map. */
export function spentTodayMs(timeSpentOnDay: Record<string, number>, today: string): number {
  return timeSpentOnDay[today] ?? 0
}

/** Whole minutes from ms (rounded, min 1 when any time exists). */
export function wholeMinutes(ms: number): number {
  if (ms <= 0) return 0
  return Math.max(1, Math.round(ms / 60_000))
}

export interface TrackedTaskIndicatorProps {
  /** The task is the timer's current tracking target. */
  tracking: boolean
  /** The task's per-day map (chip reads today's entry). */
  timeSpentOnDay: Record<string, number>
  /** Client `today` day-key. */
  today: string
}

export function TrackedTaskIndicator({
  tracking,
  timeSpentOnDay,
  today,
}: TrackedTaskIndicatorProps) {
  if (!tracking) return null
  const minutes = wholeMinutes(spentTodayMs(timeSpentOnDay, today))
  return (
    <Badge tone="accent">
      <span
        className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse"
        aria-hidden
      />
      tracking {minutes}m
    </Badge>
  )
}

export default TrackedTaskIndicator

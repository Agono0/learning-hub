'use client'

/**
 * Task indicator badges (S3-45) — the estimated-vs-spent, priority and
 * deadline signals shared by every task surface (Today/Inbox rows, detail
 * panel, boards, summary tables). One definition so a tone change lands
 * everywhere at once; pure helpers are exported for unit tests.
 *
 * Tone law (one hue per meaning): over-budget time and passed deadlines are
 * the danger hue; "close to budget" / "deadline within 3 days" are the
 * warning hue; everything else stays neutral.
 */
import React from 'react'
import { CalendarClock, Clock, Flag } from 'lucide-react'
import { Badge } from '@/ui'

/** Total tracked ms across a task's per-day map. */
export function spentTotal(timeSpentOnDay: Record<string, number>): number {
  return Object.values(timeSpentOnDay).reduce((a, b) => a + b, 0)
}

/** Human duration: `45m`, `1h 30m` (sub-minute rounds to 0m). */
export function humanMs(ms: number): string {
  const m = Math.round(ms / 60_000)
  const h = Math.floor(m / 60)
  if (h === 0) return `${m}m`
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`
}

/** Share of the estimate already spent (null without an estimate). */
export function estimateProgressFraction(
  estimateMs: number | null,
  spentMs: number,
): number | null {
  if (estimateMs === null || estimateMs <= 0) return null
  return Math.max(0, spentMs) / estimateMs
}

/** Badge tone for the estimate-vs-spent signal (SP's over-budget color). */
export function estimateBudgetTone(
  estimateMs: number | null,
  spentMs: number,
): 'danger' | 'warning' | 'neutral' {
  const fraction = estimateProgressFraction(estimateMs, spentMs)
  if (fraction === null) return 'neutral'
  if (fraction > 1) return 'danger'
  if (fraction >= 0.8) return 'warning'
  return 'neutral'
}

/** Deadline state: passed (danger), within URGENT_WINDOW_DAYS (warning), none. */
export function deadlineUrgency(
  deadline: string | null,
  today: string,
): 'passed' | 'soon' | 'none' {
  if (deadline === null) return 'none'
  if (deadline < today) return 'passed'
  const days = Math.round((Date.parse(deadline) - Date.parse(today)) / 86_400_000)
  return days <= 3 ? 'soon' : 'none'
}

/** How many days remain until the deadline (negative = overdue). */
export function deadlineDaysLeft(deadline: string, today: string): number {
  return Math.round((Date.parse(deadline) - Date.parse(today)) / 86_400_000)
}

/**
 * `spent / estimate` time badge — the SP "estimated vs spent" indicator.
 * Renders nothing when there is neither an estimate nor tracked time.
 */
export function EstimateSpentBadge({
  estimateMs,
  spentMs,
}: {
  estimateMs: number | null
  spentMs: number
}) {
  if (estimateMs === null && spentMs <= 0) return null
  const parts: string[] = []
  if (spentMs > 0 || estimateMs === null) parts.push(humanMs(spentMs))
  if (estimateMs !== null) parts.push(`of ${humanMs(estimateMs)}`)
  return (
    <Badge tone={estimateBudgetTone(estimateMs, spentMs)}>
      <Clock className="size-3" aria-hidden />
      {parts.join(' ')}
    </Badge>
  )
}

const PRIORITY_LABEL: Record<string, string> = { low: 'p3', medium: 'p2', high: 'p1' }
const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
}

/** Priority indicator — `p1`/`p2`/`p3` chips; `none` renders nothing (calm). */
export function PriorityBadge({ priority }: { priority: string }) {
  const label = PRIORITY_LABEL[priority]
  if (label === undefined) return null
  return (
    <Badge tone={PRIORITY_TONE[priority] ?? 'neutral'}>
      <Flag className="size-3" aria-hidden />
      {label}
    </Badge>
  )
}

/** Deadline badge — counts down, warns inside 3 days, danger once passed. */
export function DeadlineBadge({ deadline, today }: { deadline: string | null; today: string }) {
  const urgency = deadlineUrgency(deadline, today)
  if (urgency === 'none' || deadline === null) return null
  const daysLeft = deadlineDaysLeft(deadline, today)
  return (
    <Badge tone={urgency === 'passed' ? 'danger' : 'warning'}>
      <CalendarClock className="size-3" aria-hidden />
      {urgency === 'passed' ? `Deadline passed ${deadline}` : `Deadline in ${daysLeft}d`}
    </Badge>
  )
}

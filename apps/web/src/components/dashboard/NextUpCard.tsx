'use client'

/**
 * "Next up" — one calm, obvious answer to "what should I do now?".
 * Takes the top item of the prioritized agenda and shows it as a single
 * focal card with a one-tap action, plus a three-dot glance at today's
 * rings (reviews / focus / XP). Renders nothing when the agenda is empty.
 * Pure CSS (no animation library) so it does not overlap the motion work.
 */
import Link from 'next/link'
import { ArrowRight, BookOpen, Brain, CalendarClock, Compass, Flame, Timer } from 'lucide-react'
import type { AgendaItem } from '@learning-hub/core/agenda'
import type { DashboardData } from '@/server/handlers/dashboard/route'

const ICONS: Record<AgendaItem['kind'], typeof Brain> = {
  exam: CalendarClock,
  review: Brain,
  lesson: BookOpen,
  focus: Timer,
  quest: Flame,
  journal: Compass,
}

const VERBS: Record<AgendaItem['kind'], string> = {
  exam: 'Prepare',
  review: 'Review',
  lesson: 'Continue',
  focus: 'Start focus',
  quest: 'Work on quest',
  journal: 'Reflect',
}

export function greetingFor(hour: number): string {
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function Dot({ done, label }: { done: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-tertiary">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${done ? 'bg-status-success-text' : 'bg-(--hub-border-strong)'}`}
      />
      {label}
      <span className="sr-only">{done ? ' (done)' : ' (not yet)'}</span>
    </span>
  )
}

export function NextUpCard({ data }: { data: DashboardData }) {
  const item = data.agenda[0]
  if (!item) return null
  const Icon = ICONS[item.kind]
  const more = data.agenda.length - 1

  return (
    <section
      aria-label="Next up"
      className="panel flex flex-col gap-3 border-(--hub-border-strong) sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-(--ac-deep) text-(--ac-soft)">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">
            {greetingFor(new Date().getHours())} · next up
            {more > 0 ? ` · ${more} more after this` : ''}
          </div>
          <div className="truncate text-base font-semibold">{item.title}</div>
          {item.detail && <div className="truncate text-sm text-tertiary">{item.detail}</div>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Today's progress">
          <Dot done={data.reviewsToday > 0} label="Reviews" />
          <Dot done={data.focusMinutesToday > 0} label="Focus" />
          <Dot done={data.xpToday > 0} label="XP" />
        </div>
        <Link href={item.href} className="btn h-11 shrink-0 px-5">
          {VERBS[item.kind]}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

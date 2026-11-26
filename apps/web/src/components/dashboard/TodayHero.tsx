'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Flame, Repeat2, Sparkles, Timer } from 'lucide-react'
import { FOCUS_TARGET_MINUTES } from '@learning-hub/core/agenda'
import { levelFromXp, levelProgress } from '@learning-hub/core/xp'
import { BentoTile } from '@/ui'
import { ProgressBar, ProgressRing } from '@/ui/Progress'
import { useGsapCountUp } from '@/lib/useGsapCountUp'
import type { DashboardData } from '@/server/handlers/dashboard/route'

/**
 * What the learner should do right now, chosen from data the dashboard already has, in this
 * order: due cards, then the most pressing agenda item, then an open loop, then a calm default.
 * One answer, one action: the rest of the page recedes.
 */
export function nextAction(d: DashboardData): {
  kind: 'review' | 'agenda' | 'loop' | 'start'
  title: string
  detail: string
  href: string
  cta: string
} {
  if (d.dueCount > 0) {
    return {
      kind: 'review',
      title: `${d.dueCount} ${d.dueCount === 1 ? 'card is' : 'cards are'} ready to review`,
      detail: 'A short session now keeps them fresh. You can stop any time.',
      href: '/review',
      cta: d.dueCount === 1 ? 'Review 1 card' : `Review ${d.dueCount} cards`,
    }
  }
  const item = [...(d.agenda ?? [])].sort((a, b) => a.priority - b.priority)[0]
  if (item) {
    return {
      kind: 'agenda',
      title: item.title,
      detail: item.detail ?? 'The next thing on your agenda.',
      href: item.href,
      cta: 'Open',
    }
  }
  const loop = d.openLoops?.[0]
  if (loop) {
    return {
      kind: 'loop',
      title: loop.title,
      detail: loop.context,
      href: loop.href,
      cta: 'Pick it back up',
    }
  }
  return {
    kind: 'start',
    title: 'Nothing is waiting for you',
    detail: 'Your queue is clear. Start a daily loop, or explore something new.',
    href: '/review',
    cta: 'Start Daily Loop',
  }
}

function CountUp({ value }: { value: number }) {
  const ref = useGsapCountUp(value)
  return (
    <span ref={ref} className="tnum">
      {value.toLocaleString()}
    </span>
  )
}

/** The hero tile: the single next action, large and unmistakable. */
export function TodayHeroTile({ data: d }: { data: DashboardData }) {
  const a = nextAction(d)
  return (
    <BentoTile hero size="lg" tall aria-labelledby="today-next-title" className="flex flex-col">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-ac-text">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Up next
      </p>
      <h2
        id="today-next-title"
        className="mt-3 max-w-[22ch] text-balance text-3xl font-bold leading-tight tracking-tight text-strong sm:text-4xl"
      >
        {a.title}
      </h2>
      <p className="mt-2 max-w-prose text-sm text-secondary sm:text-base">{a.detail}</p>
      <div className="mt-auto pt-6">
        <Link href={a.href} className="btn h-12 px-6 text-base">
          {a.kind === 'review' ? (
            <Repeat2 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          )}
          {a.cta}
        </Link>
      </div>
    </BentoTile>
  )
}

/** Small status tiles. Each one answers a single question and never shames. */
export function TodayStatTiles({ data: d }: { data: DashboardData }) {
  const level = levelFromXp(d.xpTotal)
  const lvl = levelProgress(d.xpTotal)
  const focusGoal = Math.min(1, d.focusMinutesToday / FOCUS_TARGET_MINUTES)
  return (
    <>
      <BentoTile size="stat" eyebrow="Streak" aria-label="Streak">
        <div className="flex items-end gap-2">
          <Flame className="mb-1 h-6 w-6 text-status-warning-text" aria-hidden="true" />
          <span className="text-4xl font-bold leading-none text-strong">
            <CountUp value={d.streak.current} />
          </span>
          <span className="pb-0.5 text-sm text-tertiary">
            {d.streak.current === 1 ? 'day' : 'days'}
          </span>
        </div>
        <p className="mt-3 text-xs text-tertiary">
          Best {d.streak.best}d
          {d.streak.freezes > 0
            ? ` · ${d.streak.freezes} freeze${d.streak.freezes === 1 ? '' : 's'} saved`
            : ''}
        </p>
      </BentoTile>

      <BentoTile size="stat" eyebrow={`Level ${level}`} aria-label="Level progress">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold leading-none text-strong">
            <CountUp value={d.xpToday} />
          </span>
          <span className="pb-0.5 text-sm text-tertiary">XP today</span>
        </div>
        <ProgressBar value={lvl} label={`Progress to level ${level + 1}`} className="mt-3" />
        <p className="mt-2 text-xs text-tertiary tnum">
          {Math.round(lvl * 100)}% to level {level + 1}
        </p>
      </BentoTile>

      <BentoTile size="stat" eyebrow="Focus" aria-label="Focus today">
        <div className="flex items-center gap-3">
          <ProgressRing value={focusGoal} size={56} label="Focus goal" />
          <div>
            <p className="text-2xl font-bold leading-none text-strong">
              <span className="tnum">{d.focusMinutesToday}</span>
              <span className="ml-1 text-sm font-normal text-tertiary">min</span>
            </p>
            <p className="mt-1 text-xs text-tertiary">of {FOCUS_TARGET_MINUTES} min goal</p>
          </div>
        </div>
        <Link
          href="/focus"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ac-text hover:underline"
        >
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          Start a focus block
        </Link>
      </BentoTile>
    </>
  )
}

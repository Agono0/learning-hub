'use client'

/**
 * Daily Loop — the hero strip of the Today page: four progress rings that
 * answer "how is today going?" at a glance — the due queue, reviews logged
 * today, focus minutes against the one-Pomodoro target (agenda.ts
 * FOCUS_TARGET_MINUTES), and level progress (same math as the StatsWidget XP
 * card, so the two always agree).
 *
 * Pure display: everything comes from the dashboard payload (no fetches), so
 * it refreshes whenever `queryKeys.dashboard` invalidates — including focus
 * completion (use-global-timer) — and the live-focus badge rides along.
 * Display-only by design law: no CTAs here, the page's primary action stays
 * in the header.
 */
import Link from 'next/link'
import { FOCUS_TARGET_MINUTES } from '@learning-hub/core'
import { levelFromXp, levelProgress } from '@learning-hub/core/xp'
import { Badge, ProgressRing } from '@/ui'
import type { WidgetProps } from './widgets'

/** Soft daily review target the reviews ring saturates at (profile-configurable later). */
const REVIEW_TARGET = 20

/** Due-queue size the "due now" ring saturates at — any real queue reads as "ready". */
const DUE_SATURATION = 20

/** Pastel clay rotation for the tiles (peach / baby blue / mint / lilac). */
const PASTELS = ['clay-peach', 'clay-blue', 'clay-mint', 'clay-lilac'] as const

/** Entrance stagger per ring tile (motion law: 30-50ms/child, total < 300ms). */
const TILE_STAGGER_MS = 40

/** One ring tile of the strip. */
interface LoopTile {
  key: string
  /** the big raw number under the ring */
  value: number
  /** soft target shown after the value ("/ 20") — omitted when absolute */
  target: number | null
  label: string
  /** ring fill 0..1 */
  fraction: number
  ringLabel: string
}

export function DailyLoopWidget({ data: d }: WidgetProps) {
  const level = levelFromXp(d.xpTotal)
  const levelFraction = levelProgress(d.xpTotal)

  const dueFraction =
    d.dueCount > 0 ? Math.min(1, d.dueCount / Math.max(d.dueCount, DUE_SATURATION)) : 0
  const reviewFraction = Math.min(1, d.reviewsToday / REVIEW_TARGET)
  const focusFraction = Math.min(1, d.focusMinutesToday / FOCUS_TARGET_MINUTES)

  const tiles: LoopTile[] = [
    {
      key: 'due',
      value: d.dueCount,
      target: null,
      label: d.dueCount > 0 ? 'Due now' : 'all clear',
      fraction: dueFraction,
      ringLabel: d.dueCount > 0 ? `${d.dueCount} cards due` : 'All clear — no cards due right now',
    },
    {
      key: 'reviews',
      value: d.reviewsToday,
      target: REVIEW_TARGET,
      label: 'Reviews today',
      fraction: reviewFraction,
      ringLabel: `${d.reviewsToday} of ${REVIEW_TARGET} reviews today`,
    },
    {
      key: 'focus',
      value: d.focusMinutesToday,
      target: FOCUS_TARGET_MINUTES,
      label: 'Focus minutes',
      fraction: focusFraction,
      ringLabel: `${d.focusMinutesToday} of ${FOCUS_TARGET_MINUTES} focus minutes`,
    },
    {
      key: 'level',
      value: level,
      target: null,
      label: 'Level',
      fraction: levelFraction,
      ringLabel: `Level ${level}, ${Math.round(levelFraction * 100)}% to level ${level + 1}`,
    },
  ]

  return (
    <section className="panel" aria-label="Daily loop">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-tertiary">
          The daily loop
        </div>
        {d.runningFocus && (
          <Link
            href="/focus"
            className="inline-flex min-h-[44px] items-center rounded-full hover:opacity-80"
          >
            <Badge tone="accent" dot pulse>
              Focus running · {d.runningFocus.plannedMinutes} min
            </Badge>
          </Link>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t, i) => (
          <div
            key={t.key}
            className={`animate-fade-in-up panel-elevated p-3 ${PASTELS[i % PASTELS.length]}`}
            style={{ animationDelay: `${i * TILE_STAGGER_MS}ms` }}
          >
            <ProgressRing value={t.fraction} size={64} label={t.ringLabel} />
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {t.value}
              {t.target != null && (
                <span className="text-sm font-normal text-tertiary"> / {t.target}</span>
              )}
            </p>
            <p className="text-xs text-tertiary">{t.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

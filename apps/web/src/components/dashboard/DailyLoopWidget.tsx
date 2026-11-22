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
import { useMotionValueEvent, useSpring } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Badge, ProgressRing } from '@/ui'
import { motionOK, Stagger, StaggerItem } from '@/lib/motion'
import { useGsapCountUp } from '@/lib/useGsapCountUp'
import type { WidgetProps } from './widgets'

/** Soft daily review target the reviews ring saturates at (profile-configurable later). */
const REVIEW_TARGET = 20

/** Due-queue size the "due now" ring saturates at — any real queue reads as "ready". */
const DUE_SATURATION = 20

/** Pastel clay rotation for the tiles (peach / baby blue / mint / lilac). */
const PASTELS = ['clay-peach', 'clay-blue', 'clay-mint', 'clay-lilac'] as const

/**
 * Spring tuning for the ring fills — the same physics as the shared `claySpring`
 * transition (stiffness 400, damping 28), expressed as `useSpring` options.
 */
const RING_SPRING = { stiffness: 400, damping: 28 }

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

/**
 * One ring tile, extracted from the `.map` in {@link DailyLoopWidget} so per-tile hooks
 * are legal (hooks cannot be called inside a `.map` callback). Layout, pastel and labels
 * are untouched; two motion layers ride on top, both motion-law compliant and
 * hydration-safe:
 *
 * - Count-up: the big number tweens to its value via {@link useGsapCountUp} — SSR (and
 *   the renderToString integration tests) still see the final number, because the hook
 *   only rewrites `textContent` client-side and only when `motionOK()`.
 * - Ring fill: instead of the kit's CSS dash-offset lerp, the fill springs to the latest
 *   `tile.fraction` (`RING_SPRING`), so dashboard refreshes (reviews logged, focus
 *   minutes) glide instead of stepping. `ringValue` state initializes to `tile.fraction`,
 *   so SSR and the first client render pass the identical number to
 *   {@link ProgressRing}; the spring is driven and subscribed only when `motionOK()`, and
 *   the render falls back to `tile.fraction` when motion is off, so reduced-motion and
 *   e-ink stay exact and never go stale.
 *
 * Entrance is owned by the parent `Stagger`/`StaggerItem` pair (40ms per child via
 * `STAGGER_STEP_S`, totals kept <300ms — the same rhythm the old `animate-fade-in-up` +
 * `animationDelay` mechanism provided).
 */
function LoopTileView({ tile }: { tile: LoopTile }): ReactElement {
  const countRef = useGsapCountUp(tile.value)
  const [ringValue, setRingValue] = useState(tile.fraction)
  const ringSpring = useSpring(tile.fraction, RING_SPRING)

  useEffect(() => {
    if (!motionOK()) {
      // Reduced motion / e-ink: pin the spring value to the real fraction with no
      // animation, so it can never drift from the truth if motion is re-enabled later.
      ringSpring.jump(tile.fraction)
      return
    }
    // framer-motion 14's number source for useSpring is initial-only, so drive the
    // target explicitly; `set` animates via the follow interceptor and steers any
    // in-flight animation instead of restarting it.
    ringSpring.set(tile.fraction)
  }, [ringSpring, tile.fraction])

  useMotionValueEvent(ringSpring, 'change', (v) => {
    if (!motionOK()) return
    setRingValue(v)
  })

  return (
    <>
      <ProgressRing
        value={motionOK() ? ringValue : tile.fraction}
        size={64}
        label={tile.ringLabel}
      />
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        <span ref={countRef}>{tile.value}</span>
        {tile.target != null && (
          <span className="text-sm font-normal text-tertiary"> / {tile.target}</span>
        )}
      </p>
      <p className="text-xs text-tertiary">{tile.label}</p>
    </>
  )
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
      <Stagger className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t, i) => (
          <StaggerItem
            key={t.key}
            index={i}
            className={`panel-elevated p-3 ${PASTELS[i % PASTELS.length]}`}
          >
            <LoopTileView tile={t} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}

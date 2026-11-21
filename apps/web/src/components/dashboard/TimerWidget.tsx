'use client'

/**
 * Dashboard timer widget — the global focus timer, visible on the home page.
 *
 * The home page answers "what do I do now?"; when a timer is running that IS
 * the answer, so this widget leads with the live clock and one primary
 * control. When idle, it offers calm quick-starts (15/25/45/60) instead of a
 * wall of options. Everything renders from the pure engine state
 * (`useGlobalTimer`), so it always agrees with the nav chip and /focus.
 *
 * The widget carries its own `.panel` card (audit G2: it was the only
 * full-width row without one, reading as uncarded chrome next to its
 * panel-wrapped siblings).
 */
import React, { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import Link from 'next/link'
import { Pause, Play, Square, Timer } from 'lucide-react'
import { useMotionValueEvent, useSpring } from 'framer-motion'
import { ProgressRing } from '@/ui/Progress'
import { Button } from '@/ui/Button'
import { Badge } from '@/ui/Feedback'
import { motionOK, Stagger, StaggerItem } from '@/lib/motion'
import { useGlobalTimer } from '@/lib/use-global-timer'
import type { WidgetDef } from './widgets'

const QUICK_MINUTES = [15, 25, 45, 60]

/**
 * Spring tuning for the running ring — the same physics as the shared `claySpring`
 * transition (stiffness 400, damping 28), expressed as `useSpring` options.
 */
const RING_SPRING = { stiffness: 400, damping: 28 }

/** Props for {@link SpringRing}. */
interface SpringRingProps {
  /** Ring fill 0..1 (the timer's clamped progress). */
  value: number
  /** Ring diameter in px. */
  size: number
  /** Accessible ring description (phase label + remaining time). */
  label: string
}

/**
 * ProgressRing whose fill follows `value` on a spring (`RING_SPRING`) instead of the
 * kit's 500ms CSS dash-offset lerp: the running timer's fraction updates once per tick,
 * and the spring steers each in-flight animation into the next, turning the stepped
 * updates into one fluid fill.
 *
 * Motion-law + hydration notes: the fill rides the same stroke-dashoffset channel
 * ProgressRing already animates; the spring is driven and subscribed only when
 * `motionOK()` (reduced-motion and e-ink users always get the exact fraction).
 * `ringValue` state initializes to `value`, so SSR and the first client render pass the
 * identical number to {@link ProgressRing}; the spring only diverges afterwards. This is
 * mounted only while the timer runs, so every session starts from its real fraction
 * instead of unwinding a previous one. No count-up here on purpose: the clock is mm:ss
 * formatted text, which the integer-only `useGsapCountUp` cannot render.
 */
function SpringRing({ value, size, label }: SpringRingProps): ReactElement {
  const [ringValue, setRingValue] = useState(value)
  const ringSpring = useSpring(value, RING_SPRING)

  useEffect(() => {
    if (!motionOK()) {
      // Reduced motion / e-ink: pin the spring value with no animation so it never
      // drifts from the truth; the render below passes `value` directly meanwhile.
      ringSpring.jump(value)
      return
    }
    // framer-motion 14's number source for useSpring is initial-only, so drive the
    // target explicitly; `set` animates via the follow interceptor and steers any
    // in-flight animation instead of restarting it.
    ringSpring.set(value)
  }, [ringSpring, value])

  useMotionValueEvent(ringSpring, 'change', (v) => {
    if (!motionOK()) return
    setRingValue(v)
  })

  return <ProgressRing value={motionOK() ? ringValue : value} size={size} label={label} />
}

export function TimerWidget() {
  const timer = useGlobalTimer()
  const { state } = timer
  const running =
    state.phase === 'focusing' || state.phase === 'breaking' || state.phase === 'paused'
  const progress = running ? 1 - timer.remaining / Math.max(1, state.plannedMinutes * 60) : 0

  return (
    <section className="panel space-y-3" aria-label="Focus timer">
      {running ? (
        <div className="flex flex-wrap items-center gap-4">
          <SpringRing
            value={Math.max(0, Math.min(1, progress))}
            size={84}
            label={`${timer.phaseLabel}, ${timer.clock} remaining`}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-3xl font-semibold tabular-nums" aria-hidden>
              {timer.clock}
            </p>
            <div className="flex items-center gap-2">
              <Badge
                tone={state.phase === 'breaking' ? 'success' : 'accent'}
                dot
                pulse={state.phase !== 'paused'}
              >
                {timer.phaseLabel}
              </Badge>
              {state.task && <span className="truncate text-sm text-secondary">{state.task}</span>}
            </div>
            <p className="text-xs text-tertiary">
              {state.phase === 'breaking'
                ? `Ends at ${new Date(state.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : `Cycle ${state.cycle + 1} · auto-break ${state.autoBreak ? 'on' : 'off'}`}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {state.phase === 'paused' ? (
                <Button
                  variant="primary"
                  icon={<Play className="h-3.5 w-3.5" aria-hidden />}
                  onClick={timer.resume}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  icon={<Pause className="h-3.5 w-3.5" aria-hidden />}
                  onClick={timer.pause}
                >
                  Pause
                </Button>
              )}
              <Button
                variant="ghost"
                icon={<Square className="h-3.5 w-3.5" aria-hidden />}
                onClick={timer.cancel}
              >
                End
              </Button>
              <Link href="/focus" className="text-xs underline underline-offset-2 text-secondary">
                Open Focus
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-indigo-400" aria-hidden />
            <p className="text-sm font-medium">Start a focus block</p>
          </div>
          <Stagger className="flex flex-wrap gap-2">
            {QUICK_MINUTES.map((m, i) => (
              <StaggerItem key={m} index={i}>
                <Button
                  variant={m === 25 ? 'primary' : 'secondary'}
                  onClick={() => void timer.start({ plannedMinutes: m })}
                  loading={false}
                >
                  {m} min
                </Button>
              </StaggerItem>
            ))}
          </Stagger>
          <p className="text-xs text-tertiary">
            The timer keeps running and notifies you — even if you leave this page.{' '}
            <Link href="/focus" className="underline underline-offset-2">
              Full focus tools
            </Link>
          </p>
        </div>
      )}
    </section>
  )
}

/** Widget registry entry (span: full — the live clock reads better wide). */
export const timerWidgetDef: WidgetDef = {
  id: 'timer',
  title: 'Focus timer',
  span: 'full',
  component: TimerWidget,
}

'use client'

/**
 * Dashboard timer widget — the global focus timer, visible on the home page.
 *
 * The home page answers "what do I do now?"; when a timer is running that IS
 * the answer, so this widget leads with the live clock and one primary
 * control. When idle, it offers calm quick-starts (15/25/45/60) instead of a
 * wall of options. Everything renders from the pure engine state
 * (`useGlobalTimer`), so it always agrees with the nav chip and /focus.
 */
import Link from 'next/link'
import { Pause, Play, Square, Timer } from 'lucide-react'
import { ProgressRing } from '@/ui/Progress'
import { Button } from '@/ui/Button'
import { Badge } from '@/ui/Feedback'
import { useGlobalTimer } from '@/lib/use-global-timer'
import type { WidgetDef } from './widgets'

const QUICK_MINUTES = [15, 25, 45, 60]

export function TimerWidget() {
  const timer = useGlobalTimer()
  const { state } = timer
  const running =
    state.phase === 'focusing' || state.phase === 'breaking' || state.phase === 'paused'
  const progress = running ? 1 - timer.remaining / Math.max(1, state.plannedMinutes * 60) : 0

  return (
    <section className="space-y-3" aria-label="Focus timer">
      {running ? (
        <div className="flex flex-wrap items-center gap-4">
          <ProgressRing
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
          <div className="flex flex-wrap gap-2">
            {QUICK_MINUTES.map((m) => (
              <Button
                key={m}
                variant={m === 25 ? 'primary' : 'secondary'}
                onClick={() => void timer.start({ plannedMinutes: m })}
                loading={false}
              >
                {m} min
              </Button>
            ))}
          </div>
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

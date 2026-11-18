'use client'

/**
 * TimerChip — the compact global-timer indicator for the app chrome
 * (desktop sidebar top + mobile header). Renders nothing while idle so the
 * chrome stays calm; while running it is a live link to /focus showing the
 * phase and the drift-free remaining clock.
 *
 * Accessibility: the clock text updates every second, so it is intentionally
 * NOT an aria-live region (that would spam screen readers). The link's
 * accessible name carries the full state ("Focus 2, 14:32 remaining — open
 * Focus").
 */
import Link from 'next/link'
import { Pause, Timer } from 'lucide-react'
import { useGlobalTimer } from '@/lib/use-global-timer'

export function TimerChip() {
  const timer = useGlobalTimer()
  const { state } = timer
  const visible = state.phase !== 'idle' && state.phase !== 'awaiting_break'
  if (!visible) return null

  const aria = `${timer.phaseLabel}, ${timer.clock} remaining — open Focus`
  return (
    <Link
      href="/focus"
      aria-label={aria}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold tabular-nums text-strong transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-(--ac-strong) dark:hover:bg-(--hub-panel-2)"
    >
      {state.phase === 'paused' ? (
        <Pause className="h-3.5 w-3.5 text-amber-600 dark:text-status-warning-text" aria-hidden />
      ) : (
        <Timer
          className={`h-3.5 w-3.5 ${state.phase === 'breaking' ? 'text-emerald-600 dark:text-status-success-text' : 'text-indigo-600 dark:text-indigo-300'}`}
          aria-hidden
        />
      )}
      <span>{timer.clock}</span>
    </Link>
  )
}

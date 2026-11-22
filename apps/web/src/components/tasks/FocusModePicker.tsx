'use client'

/**
 * Focus-mode picker (S3-32 UI / S3-80 / S3-34) — the strategy chips over the
 * core `focus-modes` machine. The picker emits the strategy's focus length
 * (the page feeds it to the standard timer) and, for countdown, defaults it
 * to the bound task's REMAINING estimate (S3-80). The S3-34 binding is the
 * `taskId` carried in the core state — ticks log `source: 'focus'` against
 * it (S3-18's log writer).
 */
import React, { useMemo, useState } from 'react'
import { Coffee, Hourglass, Timer } from 'lucide-react'
import {
  countdownMinutesFor,
  defaultFocusModeState,
  FOCUS_STRATEGIES,
  type FocusStrategy,
} from '@learning-hub/core'
import { Button } from '@/ui'

/** How each strategy reads on the chip (calm, verb-first). */
const STRATEGY_LABEL: Record<FocusStrategy, string> = {
  pomodoro: 'Pomodoro 25/5',
  flowtime: 'Flowtime',
  countdown: 'Countdown',
}

export interface FocusModePickerProps {
  /** Client `today` day-key (drives the S3-80 remaining-estimate default). */
  today: string
  /** The bound task's estimate + per-day map (null = no task bound). */
  boundTask: { estimateMs: number | null; timeSpentOnDay: Record<string, number> } | null
  /** Apply the strategy's focus length to the page timer. */
  onApplyMinutes: (minutes: number) => void
}

/** The strategy's default focus length (what the page timer receives). */
export function strategyFocusMinutes(strategy: FocusStrategy): number {
  const base = defaultFocusModeState(strategy, null, 1)
  return strategy === 'pomodoro'
    ? base.pomodoro.focusMinutes
    : strategy === 'countdown'
      ? base.countdown.minutes
      : base.pomodoro.focusMinutes // flowtime is open-ended; the page keeps its input
}

export function FocusModePicker({ today, boundTask, onApplyMinutes }: FocusModePickerProps) {
  const [strategy, setStrategy] = useState<FocusStrategy>('pomodoro')

  const countdownDefault = useMemo(
    () =>
      boundTask === null || strategy !== 'countdown' ? null : countdownMinutesFor(boundTask, today),
    [boundTask, strategy, today],
  )

  const apply = (next: FocusStrategy) => {
    setStrategy(next)
    if (next === 'countdown' && countdownDefault !== null) onApplyMinutes(countdownDefault)
    else if (next !== 'flowtime') onApplyMinutes(strategyFocusMinutes(next))
  }

  return (
    <div className="space-y-1.5">
      <p className="label flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5" aria-hidden /> Strategy
      </p>
      <div className="flex flex-wrap gap-1.5">
        {FOCUS_STRATEGIES.map((s) => (
          <Button
            key={s}
            variant={strategy === s ? 'primary' : 'ghost'}
            className="rounded-full px-3 py-1.5 text-xs"
            aria-pressed={strategy === s}
            onClick={() => apply(s)}
          >
            {s === 'pomodoro' ? (
              <Hourglass className="size-3.5" aria-hidden />
            ) : s === 'flowtime' ? (
              <Coffee className="size-3.5" aria-hidden />
            ) : (
              <Timer className="size-3.5" aria-hidden />
            )}
            {STRATEGY_LABEL[s]}
          </Button>
        ))}
      </div>
      {strategy === 'flowtime' && (
        <p className="text-xs text-tertiary">
          No fixed end — stop the run when it feels done and the earned break is proportional.
        </p>
      )}
      {strategy === 'countdown' && (
        <p className="text-xs text-tertiary" aria-live="polite">
          {boundTask === null
            ? 'Bind a task above and the countdown defaults to its remaining estimate.'
            : countdownDefault !== null
              ? `Countdown defaults to the task's remaining estimate (${countdownDefault}m).`
              : 'The task has no estimate — set a length below.'}
        </p>
      )}
    </div>
  )
}

export default FocusModePicker

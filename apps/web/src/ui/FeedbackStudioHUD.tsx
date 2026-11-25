'use client'

/**
 * FeedbackStudioHUD — composite metric display for the Feedback Literacy &
 * Formative Assessment Studio.
 *
 * Renders the Feedback Quality Index (FQI) with its three research-grounded
 * components: Formative Alignment (Shute 2008), Level Balance against the
 * canonical Hattie & Timperley (2007) mix, and Self-Focus Safety (Kluger &
 * DeNisi 1996 FIT risk load). Purely presentational; all math lives in
 * `@learning-hub/core/feedback-studio`.
 */

import React from 'react'
import { Activity, Scale, ShieldCheck, Target } from 'lucide-react'
import { cx } from './cx'

export interface FeedbackStudioHUDProps {
  /** Feedback Quality Index, 0-100. */
  feedbackQualityIndex: number
  /** Shute (2008) formative alignment, 0-100. */
  formativeAlignmentScore: number
  /** Hattie & Timperley (2007) level-mix balance, 0-100. */
  levelBalanceScore: number
  /** Kluger & DeNisi (1996) self-focus safety, 0-100. */
  selfFocusSafetyScore: number
  /** Number of feedback statements analyzed. */
  statementCount: number
  /** Optional extra container classes. */
  className?: string
}

function scoreTone(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 55) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function barTone(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 55) return 'bg-amber-500'
  return 'bg-rose-500'
}

function MetricBar(props: { label: string; value: number; icon: React.ReactNode; hint: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
          {props.icon}
          {props.label}
        </span>
        <span className={cx('font-semibold tabular-nums', scoreTone(props.value))}>
          {props.value}
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-neutral-200/70 dark:bg-neutral-700/50"
        role="progressbar"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={props.value}
        title={props.hint}
      >
        <div
          className={cx('h-full rounded-full transition-all', barTone(props.value))}
          style={{ width: `${Math.min(100, Math.max(0, props.value))}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Composite feedback-quality HUD. Shows the FQI headline plus one bar per
 * component score, each with a tooltip naming its research basis.
 */
export function FeedbackStudioHUD(props: FeedbackStudioHUDProps) {
  const fqi = Math.round(props.feedbackQualityIndex)
  return (
    <section
      aria-label="Feedback quality metrics"
      className={cx(
        'rounded-2xl border border-neutral-200/70 bg-white/60 p-4 backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-900/40',
        props.className,
      )}
    >
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Feedback Quality Index
          </p>
          <p className={cx('text-3xl font-bold tabular-nums', scoreTone(fqi))}>{fqi}</p>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {props.statementCount} statement{props.statementCount === 1 ? '' : 's'} analyzed
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricBar
          label="Formative alignment"
          value={Math.round(props.formativeAlignmentScore)}
          icon={<Target className="h-3.5 w-3.5" />}
          hint="Adherence to Shute's (2008) formative feedback guidelines"
        />
        <MetricBar
          label="Level balance"
          value={Math.round(props.levelBalanceScore)}
          icon={<Scale className="h-3.5 w-3.5" />}
          hint="Closeness to the Hattie & Timperley (2007) target level mix"
        />
        <MetricBar
          label="Self-focus safety"
          value={Math.round(props.selfFocusSafetyScore)}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          hint="100 minus Kluger & DeNisi (1996) self-attention risk load"
        />
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
        <Activity className="h-3 w-3" />
        FQI = 0.4·alignment + 0.3·balance + 0.3·safety — weights documented in the core engine.
      </p>
    </section>
  )
}

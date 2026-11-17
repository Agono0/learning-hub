import React, { type ReactNode } from 'react'
import { cx } from './cx'

/** A friendly "nothing here yet" block that always offers a next step. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center dark:border-(--hub-border)">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-sm text-sm text-tertiary">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  )
}

const BADGE_TONE = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-(--hub-panel-2) dark:text-secondary',
  accent: 'bg-indigo-600/15 text-indigo-700 dark:text-indigo-300',
  success: 'bg-emerald-600/15 text-emerald-700 dark:text-status-success-text',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-status-warning-text',
  danger: 'bg-rose-600/15 text-rose-700 dark:text-danger-text',
  violet: 'bg-indigo-600/15 text-indigo-700 dark:text-indigo-300',
  cyan: 'bg-sky-600/15 text-sky-700 dark:text-status-info-text',
} as const

const BADGE_DOT = {
  neutral: 'bg-neutral-400 dark:bg-neutral-500',
  accent: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  violet: 'bg-indigo-500',
  cyan: 'bg-sky-500',
} as const

/** Small status pill with optional dot indicator and pulse animation. */
export function Badge({
  tone = 'neutral',
  dot = false,
  pulse = false,
  icon,
  children,
  className,
}: {
  tone?: keyof typeof BADGE_TONE
  dot?: boolean
  pulse?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONE[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cx('h-1.5 w-1.5 rounded-full', BADGE_DOT[tone], pulse && 'animate-glow-pulse')}
        />
      )}
      {icon}
      {children}
    </span>
  )
}

/** A labelled number tile (dashboards, course overview). */
export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="panel space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-tertiary">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-tertiary">{hint}</div>}
    </div>
  )
}

/** Inline alert for errors / warnings / confirmations. */
export function Callout({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: keyof typeof BADGE_TONE
  title?: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('rounded-xl px-3 py-2 text-sm', BADGE_TONE[tone])}
    >
      {title && <div className="font-medium">{title}</div>}
      {children}
    </div>
  )
}

/** Calm loading placeholder block (replaces blank `return null` states). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        'animate-pulse rounded-xl bg-neutral-200/80 dark:bg-(--hub-panel-2)',
        className,
      )}
    />
  )
}

import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cx } from './cx'

export interface StatCardProps {
  /** Metric label (e.g. "Due now", "Daily Streak") */
  label: ReactNode
  /** Primary metric value (e.g. 42, "14 days", "Level 5") */
  value: ReactNode
  /** Icon displayed in the header */
  icon?: ReactNode
  /** Optional trend or delta metric */
  trend?: {
    value: string | number
    direction?: 'up' | 'down' | 'neutral'
    label?: string
  }
  /** Optional badge displayed in the top right */
  badge?: ReactNode
  /** Optional progress bar (0 to 1, or absolute with max) */
  progress?: {
    value: number
    max?: number
    label?: string
  }
  /** Contextual hint or detail beneath the value */
  hint?: ReactNode
  /** Visual variant */
  variant?: 'glass' | 'elevated' | 'standard'
  /** Accent color tint for the icon container */
  accent?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'neutral'
  /** Additional container classes */
  className?: string
  /** Click action */
  onClick?: () => void
}

const ACCENT_STYLES = {
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  emerald:
    'bg-emerald-500/10 text-status-success-text dark:text-status-success-text border-emerald-500/20',
  amber:
    'bg-amber-500/10 text-status-warning-text dark:text-status-warning-text border-amber-500/20',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-danger-text border-rose-500/20',
  neutral: 'bg-neutral-500/10 text-neutral-600 dark:text-faint border-neutral-500/20',
} as const

const VARIANT_STYLES = {
  glass: 'panel-glass p-4',
  elevated: 'panel-elevated p-4',
  standard: 'panel p-4',
} as const

/**
  High-aesthetic metric tile adhering to getdesign.md standards.
  Calm, accessible, dark-mode aware, with optional micro-progress bars and trend indicators.
 */
export function StatCard({
  label,
  value,
  icon,
  trend,
  badge,
  progress,
  hint,
  variant = 'glass',
  accent = 'indigo',
  className,
  onClick,
}: StatCardProps) {
  const isInteractive = Boolean(onClick)
  const pct = progress
    ? Math.min(100, Math.max(0, Math.round((progress.value / (progress.max ?? 1)) * 100)))
    : null

  // A clickable tile is a real <button> (not a div with role="button") so it
  // gets keyboard activation, focus and screen-reader semantics for free.
  const Tag = (isInteractive ? 'button' : 'div') as 'button' | 'div'

  return (
    <Tag
      {...(isInteractive ? { type: 'button' as const, onClick } : {})}
      className={cx(
        VARIANT_STYLES[variant],
        'block w-full text-left',
        isInteractive && 'cursor-pointer hover:-translate-y-0.5 transition-transform duration-200',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && (
            <div
              className={cx(
                'flex h-7 w-7 items-center justify-center rounded-lg border text-xs',
                ACCENT_STYLES[accent],
              )}
            >
              {icon}
            </div>
          )}
          <span className="text-xs font-medium text-tertiary dark:text-faint">{label}</span>
        </div>

        {badge && <div>{badge}</div>}

        {trend && (
          <div
            className={cx(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
              trend.direction === 'up'
                ? 'bg-emerald-500/10 text-status-success-text dark:text-status-success-text'
                : trend.direction === 'down'
                  ? 'bg-rose-500/10 text-rose-600 dark:text-danger-text'
                  : 'bg-neutral-500/10 text-neutral-600 dark:text-faint',
            )}
          >
            {trend.direction === 'up' && <ArrowUp className="h-3 w-3" />}
            {trend.direction === 'down' && <ArrowDown className="h-3 w-3" />}
            {trend.direction === 'neutral' && <Minus className="h-3 w-3" />}
            <span>{trend.value}</span>
            {trend.label && <span className="ml-0.5 text-[10px] opacity-70">{trend.label}</span>}
          </div>
        )}
      </div>

      <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-neutral-900 dark:text-neutral-100">
        {value}
      </div>

      {progress && pct !== null && (
        <div className="mt-2 space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/70 dark:bg-(--hub-border)">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress.label && (
            <div className="flex justify-between text-[10px] text-tertiary dark:text-faint">
              <span>{progress.label}</span>
              <span>{pct}%</span>
            </div>
          )}
        </div>
      )}

      {hint && <div className="mt-1 text-xs text-tertiary dark:text-faint">{hint}</div>}
    </Tag>
  )
}

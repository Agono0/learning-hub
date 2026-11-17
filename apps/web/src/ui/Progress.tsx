import React from 'react'
import { cx } from './cx'

const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))

/** Horizontal progress bar; `value` is 0..1. */
export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number
  label?: string
  className?: string
}) {
  const pct = Math.round(clamp(value) * 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cx(
        'h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-(--hub-border)',
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-indigo-500 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Circular progress (course cards); `value` is 0..1, percentage shown inside. */
export function ProgressRing({
  value,
  size = 48,
  label,
}: {
  value: number
  size?: number
  label?: string
}) {
  const pct = clamp(value)
  const stroke = 5
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(pct * 100)}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-neutral-200 dark:stroke-(--hub-border)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="stroke-indigo-500 transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums">
        {Math.round(pct * 100)}%
      </span>
    </div>
  )
}

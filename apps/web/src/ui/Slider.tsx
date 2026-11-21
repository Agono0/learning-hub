'use client'

import React, { useId } from 'react'
import { cx } from './cx'

/**
 * Labelled range input for numeric settings — replaces the 29 raw
 * `type="range"` inputs. Value + unit render in the label row so the current
 * setting is always readable while dragging.
 */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  disabled,
  className,
  ...rest
}: {
  label: React.ReactNode
  value: number
  /** Called with the next numeric value. */
  onChange: (next: number) => void
  min: number
  max: number
  step?: number
  /** Renders the current value in the label row (e.g. `v => \`${v} min\``). */
  format?: (value: number) => React.ReactNode
  disabled?: boolean
  className?: string
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'min' | 'max' | 'step' | 'value' | 'onChange'
>) {
  const id = useId()
  return (
    <div className={cx('space-y-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-secondary">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={format ? String(format(value)) : String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cx(
          'w-full accent-indigo-600 disabled:opacity-50',
          'focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg) focus-visible:outline-none',
          '[@media(pointer:coarse)]:h-11',
        )}
        {...rest}
      />
    </div>
  )
}

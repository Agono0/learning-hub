'use client'

import React, { useId } from 'react'
import { cx } from './cx'

/**
 * A labelled switch (ARIA `switch` role) for boolean settings — replaces the
 * raw checkboxes and ad-hoc aria-pressed toggles. The button is a 44px square
 * hit target (AGENTS.md §5) with the visual track drawn inside it.
 */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean
  /** Called with the next value. */
  onChange: (next: boolean) => void
  /** Row label (the control's accessible name). */
  label: React.ReactNode
  /** Optional one-line helper text under the label. */
  description?: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-xs text-tertiary">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'flex h-6 w-11 items-center rounded-full border border-transparent px-1 transition-colors',
            checked
              ? 'bg-indigo-600 hover:bg-indigo-500'
              : 'bg-neutral-200 hover:bg-neutral-300 dark:bg-(--hub-border) dark:hover:bg-(--hub-border-strong)',
          )}
        >
          <span
            className={cx(
              'block h-4 w-4 rounded-full bg-white shadow transition-transform',
              checked ? 'translate-x-2' : '-translate-x-2',
            )}
          />
        </span>
      </button>
    </div>
  )
}

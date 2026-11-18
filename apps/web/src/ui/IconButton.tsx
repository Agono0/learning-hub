'use client'

import React, { type ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Accessible name, echoed as aria-label and title. Icon-only buttons are
   * invisible to screen readers and unexplained on touch without one.
   */
  label: string
  variant?: 'ghost' | 'secondary'
  /** Visual size on fine pointers; every size grows to 44px on coarse ones. */
  size?: 'sm' | 'md'
}

/**
 * Icon-only button (ui-design-signature §4 kit list). Enforces the 44px
 * touch-target law where fingers are the input while staying visually compact
 * behind a mouse: the hit area grows via `pointer: coarse`, never the design.
 */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cx(
        'inline-grid place-items-center rounded-lg transition-colors',
        variant === 'ghost'
          ? 'text-tertiary hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-(--hub-panel-2) dark:hover:text-neutral-200'
          : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-(--hub-border) dark:bg-(--hub-panel-2) dark:text-secondary dark:hover:bg-(--hub-border)',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

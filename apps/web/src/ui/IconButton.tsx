'use client'

import React, { type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cx } from './cx'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Accessible name, echoed as aria-label and title. Icon-only buttons are
   * invisible to screen readers and unexplained on touch without one.
   */
  label: string
  /**
   * ghost: kit-standard muted glyph on the page surface. primary: accent
   * fill (chat send, submit glyphs). secondary: bordered fill for chrome
   * that sits on white/panel tiles. bare: no colors of its own — the caller
   * supplies the full palette via className (cinematic studio surfaces,
   * branded tiles); layout, focus law and touch law stay.
   */
  variant?: 'ghost' | 'primary' | 'secondary' | 'bare'
  /** Visual size on fine pointers; sm/md grow to 44px on coarse ones. */
  size?: 'sm' | 'md' | 'lg'
  /** Shows a spinner (replacing the glyph) and disables the button while an action runs. */
  loading?: boolean
}

/** Per-size fine-pointer footprint; sm/md grow to 44px on coarse pointers. */
const SIZE = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
} as const

/**
 * Icon-only button (ui-design-signature §4 kit list). Enforces the 44px
 * touch-target law where fingers are the input while staying visually compact
 * behind a mouse: the hit area grows via `pointer: coarse`, never the design.
 */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  loading,
  className,
  type,
  children,
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cx(
        'inline-grid place-items-center rounded-lg transition-colors active:scale-[0.98] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg) focus-visible:outline-none',
        variant === 'ghost'
          ? 'text-tertiary hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-(--hub-panel-2) dark:hover:text-neutral-200'
          : variant === 'primary'
            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
            : variant === 'secondary'
              ? 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-(--hub-border) dark:bg-(--hub-panel-2) dark:text-secondary dark:hover:bg-(--hub-border)'
              : '',
        SIZE[size],
        size !== 'lg' && '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </button>
  )
}

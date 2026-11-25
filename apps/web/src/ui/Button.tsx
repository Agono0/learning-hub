'use client'

import React, { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cx } from './cx'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` = the one main action on screen; `secondary` = subdued fill +
   * hairline for the 2nd..nth action (DESIGN.md §6); `ghost` = text-only
   * tertiary action; `danger` = destructive; `bare` = layout-only (the
   * className supplies the colors, e.g. per-grade fills on /review).
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'bare'
  /** Shows a spinner and disables the button while an action runs. */
  loading?: boolean
  /** Leading icon (lucide element). */
  icon?: ReactNode
}

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn bg-rose-600 hover:bg-rose-700',
  bare: 'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold transition-[transform,background-color,opacity,box-shadow] [@media(pointer:coarse)]:min-h-11 active:scale-[0.97]',
  // bare keeps its caller-supplied radius via className; clay spring only
}

/**
 * The app's button. Wraps the global `.btn` / `.btn-secondary` / `.btn-ghost`
 * styles (which grow to 44px touch targets on coarse pointers) and adds
 * loading + icon slots.
 */
export function Button({
  variant = 'primary',
  loading,
  icon,
  disabled,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(VARIANT[variant], className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

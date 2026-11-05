'use client'

import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` = the one main action on screen; `ghost` = secondary; `danger` = destructive. */
  variant?: 'primary' | 'ghost' | 'danger'
  /** Shows a spinner and disables the button while an action runs. */
  loading?: boolean
  /** Leading icon (lucide element). */
  icon?: ReactNode
}

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn',
  ghost: 'btn-ghost',
  danger: 'btn bg-rose-600 hover:bg-rose-500',
}

/**
 * The app's button. Wraps the global `.btn` / `.btn-ghost` styles (which grow
 * to 44px touch targets on coarse pointers) and adds loading + icon slots.
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

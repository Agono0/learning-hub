import React, { type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Optional heading rendered at the top of the panel. */
  title?: ReactNode
  /** Right-aligned controls next to the title (buttons, badges). */
  actions?: ReactNode
  /** Render as a <section> (default) or a plain <div>. */
  as?: 'section' | 'div'
}

/** A card surface (the global `.panel` style) with an optional title row. */
export function Panel({
  title,
  actions,
  as = 'section',
  className,
  children,
  ...rest
}: PanelProps) {
  const Tag = as
  return (
    <Tag className={cx('panel space-y-3', className)} {...rest}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}

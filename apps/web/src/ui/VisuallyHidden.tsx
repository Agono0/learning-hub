'use client'

import React, { type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'

export interface VisuallyHiddenProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  /** HTML tag to render. Defaults to 'span'. */
  as?: React.ElementType
}

/**
 * VisuallyHidden (WCAG 2.2 SC 1.3.1 Info and Relationships).
 *
 * Hides content visually while keeping it fully discoverable and readable by
 * screen readers and search engines.
 */
export function VisuallyHidden({
  children,
  as: Component = 'span',
  className,
  ...props
}: VisuallyHiddenProps) {
  return (
    <Component className={cx('sr-only', className)} {...props}>
      {children}
    </Component>
  )
}

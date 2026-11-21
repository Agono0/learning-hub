'use client'

import React from 'react'
import { cx } from './cx'

export interface SkipLinkProps {
  /** Target element anchor id (without #). Defaults to 'main-content'. */
  targetId?: string
  /** Text shown on focus. Defaults to 'Skip to main content'. */
  label?: string
  /** Additional classes. */
  className?: string
}

/**
 * SkipLink (WCAG 2.2 SC 2.4.1 Bypass Blocks).
 *
 * Placed at the very top of the DOM before navigation menus, allowing keyboard
 * and screen-reader users to skip repetitive header chrome directly to main content.
 */
export function SkipLink({
  targetId = 'main-content',
  label = 'Skip to content',
  className,
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cx(
        'sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50',
        'focus-visible:rounded-lg focus-visible:border focus-visible:border-neutral-200 focus-visible:bg-white focus-visible:px-4 focus-visible:py-2.5',
        'focus-visible:text-sm focus-visible:font-medium focus-visible:text-neutral-900 focus-visible:shadow-lg',
        'focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)',
        'dark:focus-visible:border-(--hub-border) dark:focus-visible:bg-(--hub-panel) dark:focus-visible:text-neutral-100',
        className,
      )}
    >
      {label}
    </a>
  )
}

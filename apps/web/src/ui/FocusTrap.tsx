'use client'

import React, { useEffect, useRef, type ReactNode } from 'react'

export interface FocusTrapProps {
  /** The children contained within the trap boundary. */
  children?: ReactNode
  /** Whether the focus trap is actively engaged. Default true. */
  active?: boolean
  /** Callback triggered when user hits Escape key while inside the trap. */
  onEscape?: () => void
  /**
   * Element or ref to receive focus initially when trap activates.
   * If not provided, the first focusable element inside the container receives focus.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /** Whether to restore focus to the previously active element when the trap deactivates. Default true. */
  restoreFocus?: boolean
  /** Additional container classes. */
  className?: string
  /** Component or tag to render as the container. Default 'div'. */
  as?: React.ElementType
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * FocusTrap (WCAG 2.2 SC 2.1.2 No Keyboard Trap & SC 2.4.3 Focus Order).
 *
 * Traps Tab and Shift+Tab key navigation strictly within its subtree, ensuring
 * keyboard and screen-reader users cannot get lost in outside background DOM
 * while interacting with modal dialogs, drawers, or sheets.
 */
export function FocusTrap({
  children,
  active = true,
  onEscape,
  initialFocusRef,
  restoreFocus = true,
  className,
  as: Component = 'div',
}: FocusTrapProps) {
  const containerRef = useRef<HTMLElement | null>(null)
  const previousActiveRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    // Record previously active element to restore later
    if (typeof document !== 'undefined') {
      previousActiveRef.current = document.activeElement as HTMLElement | null
    }

    const container = containerRef.current
    if (!container) return

    // Focus initial target or first focusable element inside container
    const setInitial = () => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null && !el.hasAttribute('disabled'))

      if (focusables.length > 0 && focusables[0]) {
        focusables[0].focus()
      } else {
        // Fallback: make container focusable and focus it
        if (!container.hasAttribute('tabindex')) {
          container.setAttribute('tabindex', '-1')
        }
        container.focus()
      }
    }

    // Delay slightly to let child elements mount
    const timer = setTimeout(setInitial, 16)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        e.stopPropagation()
        onEscape()
        return
      }

      if (e.key !== 'Tab') return

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null && !el.hasAttribute('disabled'))

      if (focusables.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey) {
        // Shift + Tab: if on first element, wrap around to last
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        // Tab: if on last element, wrap around to first
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown, true)
      if (
        restoreFocus &&
        previousActiveRef.current &&
        typeof previousActiveRef.current.focus === 'function'
      ) {
        previousActiveRef.current.focus()
      }
    }
  }, [active, onEscape, initialFocusRef, restoreFocus])

  return (
    <Component ref={containerRef} className={className}>
      {children}
    </Component>
  )
}

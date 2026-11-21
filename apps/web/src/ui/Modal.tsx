'use client'

import React, { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { FocusTrap } from './FocusTrap'
import { IconButton } from './IconButton'
import { cx } from './cx'

export interface ModalProps {
  /** Whether the modal is open and rendered. */
  open: boolean
  /** Callback fired when user requests close (via Escape, backdrop click, or close button). */
  onClose: () => void
  /** Title text shown in modal header and wired to aria-labelledby. */
  title: string
  /** Optional subtitle or description wired to aria-describedby. */
  description?: string
  /** Modal body content. */
  children?: ReactNode
  /** Optional footer action buttons. */
  footer?: ReactNode
  /** Max width sizing: 'sm' (max-w-md), 'md' (max-w-lg), 'lg' (max-w-2xl), 'xl' (max-w-4xl). Default 'md'. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** ARIA role: 'dialog' (standard) or 'alertdialog' (urgent confirmation). Default 'dialog'. */
  role?: 'dialog' | 'alertdialog'
  /** Additional modal panel classes. */
  className?: string
}

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const

/**
 * Modal (Radix UI Primitive Compliance & ui-design-signature §4).
 *
 * Implements desktop-centered modal dialogs with:
 * 1. Full ARIA dialog semantics: role="dialog" / "alertdialog", aria-modal="true",
 *    aria-labelledby, aria-describedby.
 * 2. Focus containment: FocusTrap prevents keyboard navigation from leaving the dialog.
 * 3. Focus return: returns focus to trigger element on dismiss.
 * 4. Body scroll lock while modal is open.
 * 5. Keyboard Escape key dismissal.
 * 6. Minimum 44px touch-target close button.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  role = 'dialog',
  className,
}: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-(--duration-base)"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Focus Trap Container */}
      <FocusTrap
        active={open}
        onEscape={onClose}
        initialFocusRef={closeButtonRef}
        className={cx(
          'relative w-full z-10 rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-(--hub-border) dark:bg-(--hub-panel)',
          'animate-scale-in transition-all',
          SIZE_CLASSES[size],
          className,
        )}
      >
        <div
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          className="outline-none"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-100 dark:border-(--hub-border)">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-strong">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-secondary">
                  {description}
                </p>
              )}
            </div>

            <IconButton
              ref={closeButtonRef}
              label="Close dialog"
              onClick={onClose}
              variant="ghost"
              size="md"
              className="-mr-1.5 -mt-1.5"
            >
              <X className="h-5 w-5" />
            </IconButton>
          </div>

          {/* Body Content */}
          <div className="py-4 text-sm text-body">{children}</div>

          {/* Optional Footer Actions */}
          {footer && (
            <div className="mt-2 flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-(--hub-border)">
              {footer}
            </div>
          )}
        </div>
      </FocusTrap>
    </div>
  )
}

'use client'

import React, { useState, type ReactNode } from 'react'
import {
  createFlashcardA11yState,
  flipCardA11y,
  getFlashcardA11yAttributes,
} from '@learning-hub/core/a11y'
import { useReducedMotion } from '@/lib/useReducedMotion'
import { useAnnounce } from './LiveAnnouncer'
import { cx } from './cx'

export interface AccessibleFlashcardProps {
  id: string
  /** Content displayed on front (question) face. */
  front: ReactNode
  /** Plain text string representation of front face for screen reader announcements. */
  frontText: string
  /** Content displayed on back (answer) face. */
  back: ReactNode
  /** Plain text string representation of back face for screen reader announcements. */
  backText: string
  /** Optional hint text. */
  hint?: string
  /** 0-based card index in session. */
  currentIndex?: number
  /** Total count of cards in session. */
  totalCount?: number
  /** Initial flip state. */
  defaultFlipped?: boolean
  /** Controlled flip state. */
  isFlipped?: boolean
  /** Callback fired when flip occurs. */
  onFlip?: (isFlipped: boolean) => void
  /** Additional container classes. */
  className?: string
}

/**
 * AccessibleFlashcard (WCAG 2.2 AAA & Learning HUB Design Signature).
 *
 * Implements accessible, screen-reader friendly flashcard flip transitions:
 * 1. Synchronized ARIA live announcements on flip so blind and low-vision users
 *    immediately hear the question or answer without losing their reading place.
 * 2. Visual 3D flip animation backed by CSS transforms with instant fallback
 *    under `prefers-reduced-motion: reduce`.
 * 3. Inactive face is inert / `aria-hidden="true"`, preventing screen-reader focus
 *    from reading the hidden answer prematurely.
 * 4. Keyboard activation via Space and Enter.
 */
export function AccessibleFlashcard({
  id,
  front,
  frontText,
  back,
  backText,
  hint,
  currentIndex,
  totalCount,
  defaultFlipped = false,
  isFlipped: controlledFlipped,
  onFlip,
  className,
}: AccessibleFlashcardProps) {
  const reducedMotion = useReducedMotion()
  const announce = useAnnounce()

  const [internalState, setInternalState] = useState(() => {
    const initial = createFlashcardA11yState({
      id,
      front: frontText,
      back: backText,
      hint,
      currentIndex,
      totalCount,
    })
    return defaultFlipped ? flipCardA11y(initial) : initial
  })

  const isFlipped = controlledFlipped !== undefined ? controlledFlipped : internalState.isFlipped

  const handleFlip = () => {
    const nextState = flipCardA11y(internalState)
    setInternalState(nextState)
    const attrs = getFlashcardA11yAttributes(nextState)
    announce(attrs.ariaLiveMessage, 'polite')
    onFlip?.(nextState.isFlipped)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      handleFlip()
    }
  }

  const attrs = getFlashcardA11yAttributes({
    ...internalState,
    isFlipped,
  })

  return (
    <div
      role="region"
      aria-roledescription="flashcard"
      aria-label={attrs.regionLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={handleFlip}
      className={cx(
        'group relative w-full cursor-pointer select-none rounded-2xl outline-none perspective-1000',
        'focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)',
        className,
      )}
    >
      <div
        className={cx(
          'relative w-full rounded-2xl transition-transform duration-(--duration-base)',
          !reducedMotion && 'transform-style-3d',
          !reducedMotion && isFlipped && 'rotate-y-180',
        )}
      >
        {/* Front Face (Question) */}
        <div
          aria-hidden={isFlipped}
          className={cx(
            'w-full min-h-64 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-(--hub-border) dark:bg-(--hub-panel)',
            !reducedMotion && 'backface-hidden',
            reducedMotion && (isFlipped ? 'hidden' : 'block'),
          )}
        >
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-(--hub-border)">
            <span className="text-xs font-medium text-tertiary uppercase tracking-wider">
              {attrs.regionLabel}
            </span>
            <span className="text-xs text-faint flex items-center gap-1">
              <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-secondary dark:bg-(--hub-panel-2)">
                Space
              </kbd>
              <span>to flip</span>
            </span>
          </div>

          <div className="py-8 text-lg font-medium text-strong">{front}</div>

          {hint && !isFlipped && (
            <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-xs text-secondary dark:bg-(--hub-panel-2)">
              <span className="font-semibold text-tertiary mr-1">Hint:</span>
              {hint}
            </div>
          )}
        </div>

        {/* Back Face (Answer) */}
        <div
          aria-hidden={!isFlipped}
          className={cx(
            'w-full min-h-64 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-(--hub-border) dark:bg-(--hub-panel)',
            !reducedMotion && 'backface-hidden rotate-y-180 absolute inset-0',
            reducedMotion && (!isFlipped ? 'hidden' : 'block'),
          )}
        >
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-(--hub-border)">
            <span className="text-xs font-medium text-tertiary uppercase tracking-wider">
              Answer Face
            </span>
            <span className="text-xs text-faint flex items-center gap-1">
              <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-secondary dark:bg-(--hub-panel-2)">
                Space
              </kbd>
              <span>to flip back</span>
            </span>
          </div>

          <div className="py-8 text-lg font-medium text-strong">{back}</div>
        </div>
      </div>
    </div>
  )
}

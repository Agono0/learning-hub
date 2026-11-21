'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type LivePriority = 'polite' | 'assertive'

export interface LiveAnnouncerContextValue {
  /**
   * Broadcasts an accessible message to screen readers via ARIA live region.
   *
   * @param message - The announcement text.
   * @param priority - 'polite' (speaks when idle, default) or 'assertive' (interrupts).
   */
  announce: (message: string, priority?: LivePriority) => void
}

const LiveAnnouncerContext = createContext<LiveAnnouncerContextValue | null>(null)

export interface LiveAnnouncerProviderProps {
  children: ReactNode
}

/**
 * LiveAnnouncerProvider (WCAG 2.2 SC 4.1.3 Status Messages).
 *
 * Hosts dedicated visually-hidden ARIA live regions to convey dynamic asynchronous
 * updates (e.g. card flips, timer countdown alerts, practice grade results,
 * network sync state) to assistive technologies without stealing visual focus.
 */
export function LiveAnnouncerProvider({ children }: LiveAnnouncerProviderProps) {
  const [politeMessage, setPoliteMessage] = useState('')
  const [assertiveMessage, setAssertiveMessage] = useState('')

  const announce = useCallback((message: string, priority: LivePriority = 'polite') => {
    const text = message.trim()
    if (!text) return

    if (priority === 'assertive') {
      // Clear briefly first to force screen readers to re-announce identical consecutive strings
      setAssertiveMessage('')
      setTimeout(() => setAssertiveMessage(text), 20)
    } else {
      setPoliteMessage('')
      setTimeout(() => setPoliteMessage(text), 20)
    }
  }, [])

  return (
    <LiveAnnouncerContext.Provider value={{ announce }}>
      {children}
      {/* Visually hidden live regions */}
      <div
        id="a11y-live-polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only fixed pointer-events-none"
      >
        {politeMessage}
      </div>
      <div
        id="a11y-live-assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only fixed pointer-events-none"
      >
        {assertiveMessage}
      </div>
    </LiveAnnouncerContext.Provider>
  )
}

/**
 * Hook to trigger screen reader announcements anywhere in the UI tree.
 */
export function useAnnounce(): (message: string, priority?: LivePriority) => void {
  const context = useContext(LiveAnnouncerContext)
  if (!context) {
    // Graceful fallback for components used outside the provider (or in SSR/test)
    return (message: string) => {
      if (typeof document !== 'undefined') {
        const fallbackId = 'a11y-live-fallback'
        let fallback = document.getElementById(fallbackId)
        if (!fallback) {
          fallback = document.createElement('div')
          fallback.id = fallbackId
          fallback.setAttribute('aria-live', 'polite')
          fallback.setAttribute('aria-atomic', 'true')
          fallback.className = 'sr-only'
          document.body.appendChild(fallback)
        }
        fallback.textContent = message
      }
    }
  }
  return context.announce
}

export interface LiveRegionProps {
  /** The message to broadcast. */
  message?: string
  /** Priority level ('polite' or 'assertive'). */
  priority?: LivePriority
}

/**
 * Declarative LiveRegion component for rendering inside specific views or studios.
 */
export function LiveRegion({ message = '', priority = 'polite' }: LiveRegionProps) {
  const announce = useAnnounce()

  useEffect(() => {
    if (message) {
      announce(message, priority)
    }
  }, [message, priority, announce])

  return (
    <span
      role={priority === 'assertive' ? 'alert' : 'status'}
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </span>
  )
}

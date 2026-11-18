'use client'

/**
 * OfflineBanner — honest connection state in the chrome.
 *
 * Renders nothing while online. When the browser reports offline, a calm
 * sticky banner states exactly what that means for THIS app (viewing saved
 * data; writes will fail and toast on attempt) — no panic, no fake
 * reconnecting spinners. Reappears on repeated drops; dismissible for the
 * current session only (it's information, not a notification).
 */
import { useEffect, useState } from 'react'
import { WifiOff, X } from 'lucide-react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const update = () => setOffline(navigator.onLine === false)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  // A fresh drop after a dismissal shows the banner again (state changed).
  useEffect(() => {
    if (!offline) setDismissed(false)
  }, [offline])

  if (!mounted || !offline || dismissed) return null

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-status-warning-text"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-medium">You're offline.</span> Saved data still works — changes that
        need the server will show an error until you reconnect.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline notice"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-neutral-100 hover:text-strong focus-visible:ring-2 focus-visible:ring-(--ac-strong) dark:hover:bg-(--hub-panel-2)"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

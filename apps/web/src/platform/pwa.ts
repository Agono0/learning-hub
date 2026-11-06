'use client'

/**
 * PWA platform glue: service-worker registration (production only — the dev
 * server's HMR and a caching SW fight each other), web-push subscription, and
 * the focus-presentation helpers (fullscreen + screen wake lock) for Max
 * Focus on mobile.
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV !== 'production') return
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('[pwa] service worker registration failed:', err)
  })
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return Boolean(sub)
}

/**
 * Subscribes this browser to web-push. `vapidPublicKey` comes from Settings
 * (generated once by the server; see handlers/push). Returns the subscription
 * JSON for the server to store, or null when unsupported/denied.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<string | null> {
  if (!isPushSupported()) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  const existing = await reg.pushManager.getSubscription()
  if (existing) return JSON.stringify(existing.toJSON())
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })
  return JSON.stringify(sub.toJSON())
}

let wakeLock: { release: () => Promise<void> } | null = null

/** Fullscreen + keep-screen-awake for Max Focus on phones. Best-effort. */
export async function requestFocusPresentation(): Promise<void> {
  try {
    if (document.fullscreenElement == null && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen().catch(() => {})
    }
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    if (nav.wakeLock && !wakeLock) {
      wakeLock = await nav.wakeLock.request('screen').catch(() => null)
    }
  } catch {
    // Presentation niceties never block a focus session.
  }
}

export async function releaseFocusPresentation(): Promise<void> {
  try {
    if (wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
    if (document.fullscreenElement != null && document.exitFullscreen) {
      await document.exitFullscreen().catch(() => {})
    }
  } catch {
    /* ignore */
  }
}

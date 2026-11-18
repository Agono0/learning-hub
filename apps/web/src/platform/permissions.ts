/**
 * Platform permission adapter — the ONLY module that talks to OS/browser
 * permission APIs (Tauri notification plugin, Web Notifications, push
 * subscriptions). Everything else (Permission Center, nudge banner,
 * settings summary) consumes the pure catalog from `@learning-hub/core/permissions`
 * through this adapter, so behavior stays identical on web, Android, iOS and
 * desktop while the runtime details live in exactly one file.
 *
 * Statuses the catalog cannot query (`exact_alarms`, `battery_optimization`)
 * resolve to `'manual'` on their platform and `'unsupported'` elsewhere —
 * never a fabricated "granted".
 */
import { isTauri } from '@/lib/transport'
import {
  PERMISSION_CATALOG,
  PERMISSION_IDS,
  emptySnapshot,
  parsePermissionPrefs,
  withDecision,
  type PermissionDecision,
  type PermissionId,
  type PermissionPromptPrefs,
  type PermissionPromptDecision,
  type PermissionSnapshot,
  type PermissionStatus,
} from '@learning-hub/core/permissions'

/** localStorage key for the device-local ask preferences (never synced). */
const PREFS_STORAGE_KEY = 'lh-permission-prefs'

/** True when running inside the Tauri shell on Android (user agent sniff — no API exists). */
export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

/** Platform of the current runtime, per the catalog's platform vocabulary. */
export function currentPlatform(): 'web' | 'android' | 'ios' | 'desktop' {
  if (!isTauri) return 'web'
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ios/i.test(ua)) return 'ios'
  return 'desktop'
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

/** Current web-notification permission status ('unsupported' when absent). */
function webNotificationStatus(): PermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission === 'default' ? 'undetermined' : Notification.permission
}

/** Push status: granted ⇔ an active push subscription exists AND notification permission is granted. */
async function webPushStatus(): Promise<PermissionStatus> {
  if (isTauri) return 'unsupported' // native delivers via the OS, not web push
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission !== 'granted') return Notification.permission === 'default' ? 'undetermined' : 'denied'
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub ? 'granted' : 'undetermined'
  } catch {
    return 'undetermined'
  }
}

/**
 * Detect every catalog permission on the current device. Never throws — a
 * failing probe degrades that single permission to its safe default so one
 * broken API cannot blank the Permission Center.
 */
export async function detectPermissions(): Promise<PermissionSnapshot> {
  const snapshot = emptySnapshot()
  const platform = currentPlatform()

  for (const id of PERMISSION_IDS) {
    const def = PERMISSION_CATALOG[id]
    if (!def.platforms.includes(platform)) {
      snapshot[id] = 'unsupported'
      continue
    }
    try {
      if (id === 'notifications') {
        snapshot[id] = isTauri ? await tauriNotificationStatus() : webNotificationStatus()
      } else if (id === 'push') {
        snapshot[id] = await webPushStatus()
      } else {
        // exact_alarms / battery_optimization: no JS query surface exists.
        snapshot[id] = 'manual'
      }
    } catch {
      snapshot[id] = def.canQuery ? 'undetermined' : 'manual'
    }
  }
  return snapshot
}

async function tauriNotificationStatus(): Promise<PermissionStatus> {
  try {
    const plugin = await import('@tauri-apps/plugin-notification')
    return (await plugin.isPermissionGranted()) ? 'granted' : 'undetermined'
  } catch {
    // Plugin missing in this environment — treat like the web default.
    return webNotificationStatus() === 'unsupported' ? 'undetermined' : webNotificationStatus()
  }
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

/**
 * Ask the OS/browser for a permission. Returns the resulting status:
 * `'granted'`/`'denied'` after a real prompt, the unchanged status for
 * manual capabilities (they cannot prompt), `'unsupported'` off-platform.
 */
export async function requestPermission(id: PermissionId): Promise<PermissionStatus> {
  const def = PERMISSION_CATALOG[id]
  if (!def.platforms.includes(currentPlatform()) || !def.canRequest) return 'unsupported'

  if (id === 'notifications') {
    if (isTauri) {
      try {
        const plugin = await import('@tauri-apps/plugin-notification')
        if (await plugin.isPermissionGranted()) return 'granted'
        return (await plugin.requestPermission()) === 'granted' ? 'granted' : 'denied'
      } catch {
        return 'denied'
      }
    }
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    try {
      return (await Notification.requestPermission()) === 'granted' ? 'granted' : 'denied'
    } catch {
      return 'denied'
    }
  }

  if (id === 'push') {
    // Web push rides on the notification permission; the subscription step
    // itself lives in `platform/pwa.ts` (`subscribeToPush`).
    return requestPermission('notifications')
  }

  return 'unsupported'
}

/**
 * Send a one-off local notification without touching the reminder pipeline
 * (bell opt-in, test messages). Assumes permission is granted; returns false
 * when it is not or the platform cannot deliver.
 */
export async function deliverLocalNotification(title: string, body: string): Promise<boolean> {
  if (isTauri) {
    try {
      const plugin = await import('@tauri-apps/plugin-notification')
      if (!(await plugin.isPermissionGranted())) return false
      plugin.sendNotification({ title, body })
      return true
    } catch {
      return false
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icons/icon-192.png' })
      return true
    } catch {
      return false
    }
  }
  return false
}

/**
 * Send a one-off test notification so the user can *verify* the capability
 * end-to-end (trust but verify: granted status alone proves delivery).
 * Returns true when the OS accepted it.
 */
export async function sendTestNotification(): Promise<boolean> {
  if (isTauri) {
    try {
      const plugin = await import('@tauri-apps/plugin-notification')
      if (!(await plugin.isPermissionGranted())) return false
      plugin.sendNotification({
        title: 'Learning HUB — notifications work',
        body: 'This is how review reminders and timer alerts will reach you.',
      })
      return true
    } catch {
      return false
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification('Learning HUB — notifications work', {
        body: 'This is how review reminders and timer alerts will reach you.',
        icon: '/icons/icon-192.png',
      })
      notif.onclick = () => window.focus()
      return true
    } catch {
      return false
    }
  }
  return false
}

/* ------------------------------------------------------------------ */
/* Device-local ask preferences (localStorage)                         */
/* ------------------------------------------------------------------ */

/** Read the stored ask preferences; corrupt storage degrades to defaults. */
export function getPermissionPrefs(): PermissionPromptPrefs {
  if (typeof window === 'undefined') return { decisions: {}, lastAskedAt: {} }
  try {
    return parsePermissionPrefs(JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}'))
  } catch {
    return { decisions: {}, lastAskedAt: {} }
  }
}

/** Persist ask preferences (fire-and-forget safe: storage failures are non-fatal). */
export function savePermissionPrefs(prefs: PermissionPromptPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Private-mode storage quota — the UI keeps working without persistence.
  }
}

/** Record one user decision ('ask_now' | 'later' | 'never') and persist it. */
export function recordPermissionDecision(id: PermissionId, decision: PermissionDecision): PermissionPromptPrefs {
  const next = withDecision(getPermissionPrefs(), id, decision)
  savePermissionPrefs(next)
  return next
}

/**
 * Re-arm guidance after the user reset it in the Permission Center
 * ('never' → ask again, with a fresh throttle).
 */
export function resetPermissionPrefs(): PermissionPromptPrefs {
  const fresh: PermissionPromptPrefs = { decisions: {}, lastAskedAt: {} }
  savePermissionPrefs(fresh)
  return fresh
}

/**
 * Re-detect when the window regains focus — the user may have flipped the
 * permission in OS settings while we were backgrounded. Returns an
 * unsubscribe function.
 */
export function onPermissionsMaybeChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => {
    if (document.visibilityState === 'visible') listener()
  }
  window.addEventListener('focus', handler)
  document.addEventListener('visibilitychange', handler)
  return () => {
    window.removeEventListener('focus', handler)
    document.removeEventListener('visibilitychange', handler)
  }
}

export type { PermissionPromptDecision, PermissionSnapshot, PermissionStatus }

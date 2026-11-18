/**
 * Client-side reminder dispatcher & scheduler.
 *
 * Runs periodically and on app visibility change: checks /api/reminders/plan,
 * delivers notifications via Tauri native plugin (or Web Notifications API),
 * and logs delivery to /api/reminders/log.
 */
import { apiGet, apiSend, isTauri } from '@/lib/transport'
import type { ReminderCandidate } from '@learning-hub/core/reminders'
import {
  REMINDER_KIND_TO_CHANNEL,
  defaultNotificationPrefs,
  evaluateDelivery,
  parseNotificationPrefs,
  type NotificationPrefs,
} from '@learning-hub/core/notification-center'

/** Shape of the prefs payload the dispatcher needs from /api/notifications/prefs. */
interface NotificationPrefsPayload {
  ok: boolean
  prefs: NotificationPrefs
  deliveredToday?: number
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauri) {
    try {
      const plugin = await import('@tauri-apps/plugin-notification')
      let granted = await plugin.isPermissionGranted()
      if (!granted) granted = (await plugin.requestPermission()) === 'granted'
      return granted
    } catch {
      return false
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return true
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    }
  }

  return false
}

export async function deliverNotification(candidate: ReminderCandidate): Promise<boolean> {
  if (isTauri) {
    try {
      const plugin = await import('@tauri-apps/plugin-notification')
      let granted = await plugin.isPermissionGranted()
      if (!granted) granted = (await plugin.requestPermission()) === 'granted'
      if (granted) {
        plugin.sendNotification({
          title: candidate.title,
          body: candidate.body,
        })
        return true
      }
    } catch {
      // plugin missing in current environment
    }
    return false
  }

  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      const notif = new Notification(candidate.title, {
        body: candidate.body,
        icon: '/icons/icon-192.png',
      })
      notif.onclick = () => {
        // Engagement telemetry (F-08④): fire-and-forget — the click must
        // never be delayed or blocked by a failed POST.
        void apiSend('/api/reminders/click', 'POST', {
          kind: candidate.kind,
          actionUrl: candidate.actionUrl,
        }).catch(() => {})
        window.focus()
        if (candidate.actionUrl) {
          window.location.href = candidate.actionUrl
        }
      }
      return true
    } catch {
      return false
    }
  }

  return false
}

export async function checkAndDispatchReminders(): Promise<number> {
  try {
    const [res, prefsRes] = await Promise.all([
      apiGet<{ ok: boolean; candidates: ReminderCandidate[] }>('/api/reminders/plan'),
      apiGet<NotificationPrefsPayload>('/api/notifications/prefs'),
    ])
    if (!res?.candidates || res.candidates.length === 0) return 0

    let sent = 0
    // Dispatch highest priority candidate first (calm spacing: at most one candidate per run)
    const next = res.candidates[0]!

    // User-managed gate (Notification Center policy): channel choice, quiet
    // hours, DND and the daily cap apply on top of the reminder planner.
    const prefs = prefsRes?.prefs
      ? parseNotificationPrefs(prefsRes.prefs)
      : defaultNotificationPrefs()
    const deliveredToday = prefsRes?.deliveredToday ?? 0
    const channel = REMINDER_KIND_TO_CHANNEL[next.kind as keyof typeof REMINDER_KIND_TO_CHANNEL]
    const decision = evaluateDelivery(channel ?? 'review_due', prefs, {
      now: new Date(),
      deliveredToday,
    })

    const ok = decision === 'deliver' ? await deliverNotification(next) : false
    // Every decision lands in the ledger — delivered AND suppressed, with the
    // reason — so the Notification Center history is honest and searchable.
    if (channel) {
      await apiSend('/api/notifications/log', 'POST', {
        channel,
        title: next.title,
        body: next.body,
        actionUrl: next.actionUrl ?? null,
        decision,
        createdAt: new Date().toISOString(),
      }).catch(() => {})
    }
    if (ok) {
      sent++
      await apiSend('/api/reminders/log', 'POST', {
        kind: next.kind,
        title: next.title,
        body: next.body,
        actionUrl: next.actionUrl,
      })
    }
    return sent
  } catch {
    return 0
  }
}

/**
 * Initializes background scheduler loop (checks every 15 minutes & when window regains focus).
 */
export function initReminderScheduler(): () => void {
  if (typeof window === 'undefined') return () => {}

  // Initial check after 5 seconds to avoid startup contention
  const initialTimer = setTimeout(() => {
    void checkAndDispatchReminders()
  }, 5000)

  // 15-minute polling interval
  const interval = setInterval(
    () => {
      void checkAndDispatchReminders()
    },
    15 * 60 * 1000,
  )

  // Window visibility listener (user returns to app)
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void checkAndDispatchReminders()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    clearTimeout(initialTimer)
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

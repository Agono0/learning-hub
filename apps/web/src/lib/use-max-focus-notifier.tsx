'use client'

/**
 * Max Focus session notifications (M2-31) — one app-wide watcher mounted in
 * `Providers` that routes the lock's engagement/unlock transitions through
 * the Notification Center gate (channel `max_focus`):
 *
 * - **Engaged** → a persistent "session running" toast. On web hosts it is
 *   delivered with `requireInteraction` + a shared `tag`, so it stays on
 *   screen and replaces itself instead of stacking; native hosts send their
 *   plain equivalent.
 * - **Unlocked** → a replacement toast (same tag) telling the user the lock
 *   lifted; the exact ending (timer / PIN / battery / tamper) is narrated by
 *   the post-session report card (M2-34), so the copy stays honest without
 *   extra fetches.
 *
 * Every decision — delivered AND suppressed — is logged to
 * `/api/notifications/log` like the timer's notifications, so the history
 * feed stays complete. Pure decision/copy helpers are exported for tests.
 */
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  defaultNotificationPrefs,
  evaluateDelivery,
  parseNotificationPrefs,
  type NotificationPrefs,
} from '@learning-hub/core/notification-center'
import { apiGet, apiSend } from '@/lib/transport'
import { deliverLocalNotification } from '@/platform/permissions'

/** Minimal lock shape the watcher needs (subset of GET /api/focus/max). */
export interface MaxFocusNotifyLock {
  active: boolean
  mode: string
  sessionId: number | null
  endsAt: string | null
}

/** Transition input — null means "no active max session". */
export type MaxFocusNotifyState = Pick<MaxFocusNotifyLock, 'sessionId' | 'endsAt'> | null

export type MaxFocusNotifyDecision = 'engaged' | 'unlocked'

/**
 * Edge detection between two observations: engaged = was inactive → active;
 * unlocked = was active → inactive. Same-session re-observations decide
 * nothing (no re-fire on poll).
 */
export function maxFocusNotificationDecision(
  prev: MaxFocusNotifyState,
  next: MaxFocusNotifyState,
): MaxFocusNotifyDecision | null {
  if (next && next !== null && !prev) return 'engaged'
  if (prev && !next) return 'unlocked'
  return null
}

/** Copy for the two notification kinds (specific, calm, second person). */
export function maxFocusNotificationCopy(
  kind: MaxFocusNotifyDecision,
  state: { endsAt: string | null },
): { title: string; body: string } {
  if (kind === 'engaged') {
    const until = state.endsAt ? new Date(state.endsAt) : null
    const valid = until !== null && !Number.isNaN(until.getTime())
    return {
      title: 'Max Focus engaged',
      body: valid
        ? `Locked until ${until!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Exits need your PIN and a written reason.`
        : 'The lock is on. Exits need your PIN and a written reason.',
    }
  }
  return {
    title: 'Max Focus unlocked',
    body: 'The lock lifted. Focus Studio shows how the session ended.',
  }
}

/** Shared tag so the engaged toast is replaced by the unlock toast (web). */
export const MAX_FOCUS_NOTIFICATION_TAG = 'max-focus-session'

async function fetchPrefs(): Promise<{ prefs: NotificationPrefs; deliveredToday: number }> {
  try {
    const data = await apiGet<{ prefs: NotificationPrefs; deliveredToday: number } | null>(
      '/api/notifications/prefs',
    )
    if (data?.prefs) {
      return { prefs: parseNotificationPrefs(data.prefs), deliveredToday: data.deliveredToday ?? 0 }
    }
  } catch {
    /* prefs are best-effort — defaults below keep the gate honest */
  }
  return { prefs: defaultNotificationPrefs(), deliveredToday: 0 }
}

/** Watches the Max Focus lock and delivers gated transitions. Renders nothing. */
export function useMaxFocusNotifier(): null {
  const lockQuery = useQuery({
    queryKey: ['focus-max-lock'],
    queryFn: () => apiGet<{ ok: boolean; lock: MaxFocusNotifyLock }>('/api/focus/max'),
    refetchInterval: 10000,
  })
  const rawLock = lockQuery.data?.lock ?? null
  const next: MaxFocusNotifyState =
    rawLock && rawLock.active && rawLock.mode === 'max'
      ? { sessionId: rawLock.sessionId, endsAt: rawLock.endsAt }
      : null

  const prevRef = useRef<MaxFocusNotifyState>(null)
  const stateRef = useRef(next)
  // Keep the freshest observation readable inside the effect without
  // re-subscribing on every poll.
  stateRef.current = next

  useEffect(() => {
    const prev = prevRef.current
    const current = stateRef.current
    prevRef.current = current
    const kind = maxFocusNotificationDecision(prev, current)
    if (!kind) return

    void (async () => {
      try {
        const { prefs, deliveredToday } = await fetchPrefs()
        const { title, body } = maxFocusNotificationCopy(kind, current ?? { endsAt: null })
        const decision = evaluateDelivery('max_focus', prefs, {
          now: new Date(),
          deliveredToday,
        })
        void apiSend('/api/notifications/log', 'POST', {
          channel: 'max_focus',
          title,
          body,
          actionUrl: null,
          decision,
          createdAt: new Date().toISOString(),
        }).catch(() => {})
        if (decision === 'deliver') {
          await deliverLocalNotification(title, body, {
            tag: MAX_FOCUS_NOTIFICATION_TAG,
            requireInteraction: kind === 'engaged',
          })
        }
      } catch {
        /* the notification pipeline must never break the UI */
      }
    })()
    // Depend on the observation itself: polls produce fresh objects, but the
    // edge detector no-ops when nothing actually transitioned.
  }, [next])

  return null
}

/** Mount-once wrapper for `Providers`. */
export function MaxFocusNotifier() {
  useMaxFocusNotifier()
  return null
}

export default MaxFocusNotifier

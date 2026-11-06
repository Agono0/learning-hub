/**
 * Web-push delivery (headless server): sends reminder payloads to every
 * stored browser subscription via the `web-push` library.
 *
 * Configuration (env):
 * - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — a VAPID pair (generate once:
 *   `npx web-push generate-vapid-keys`). The public key is also what the web
 *   app's Settings panel reads from /api/push to subscribe browsers.
 * - `VAPID_SUBJECT` — optional contact (mailto: or https:), defaults to the
 *   Learning HUB project address.
 *
 * Delivery is best-effort: failures are logged, never thrown, and stale
 * (410 Gone) subscriptions are removed.
 */
import webpush from 'web-push'
import { deletePushSubscription, listPushSubscriptions } from '@learning-hub/db'

let configured = false

function ensureConfigured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:hub@learning-hub.local',
      publicKey,
      privateKey,
    )
    configured = true
  }
  return true
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/** Sends one payload to every subscription; prunes gone endpoints. */
export async function sendPushToAll(
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 }
  const subs = listPushSubscriptions()
  let sent = 0
  let pruned = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys as { p256dh: string; auth: string },
        },
        JSON.stringify(payload),
      )
      sent++
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        deletePushSubscription(sub.endpoint)
        pruned++
      } else {
        console.warn(
          `[push] delivery to ${sub.endpoint.slice(0, 48)}… failed:`,
          (err as Error).message,
        )
      }
    }
  }
  return { sent, pruned }
}

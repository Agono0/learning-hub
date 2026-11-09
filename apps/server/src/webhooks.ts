/**
 * Learning HUB server — outbound webhooks.
 *
 * `LEARNING_HUB_WEBHOOKS="eventName=url,eventName2=url2"` subscribes each named
 * event on the core event bus (packages/core events.ts `eventBus` singleton)
 * and POSTs the event JSON to its URL. Delivery is best-effort: global fetch
 * with a 3 s AbortSignal timeout, failures logged to console and never fatal
 * (the learning engine never waits on a webhook).
 *
 * Event names are validated against the `HubEventMap` catalog (the platform's
 * extension contract): unknown names are warned about and skipped, since they
 * could never fire.
 */
import { z } from 'zod'
import { eventBus, type HubEventMap } from '@learning-hub/core'

/** Delivery timeout per webhook POST (ms). */
const WEBHOOK_TIMEOUT_MS = 3000

/**
 * Subscribable event names — the `HubEventMap` catalog as a runtime list.
 * Keep in sync with packages/core/src/events.ts (`as const satisfies` makes a
 * drift a compile error in this package).
 */
const KNOWN_EVENTS = [
  'review.completed',
  'review.batch.completed',
  'streak.updated',
  'streak.broken',
  'card.created',
  'focus.completed',
  'quest.completed',
  'goal.completed',
  'habit.checked',
  'achievement.unlocked',
] as const satisfies readonly (keyof HubEventMap & string)[]

/** A webhook event name: must be a cataloged `HubEventMap` key. */
export type WebhookEvent = (typeof KNOWN_EVENTS)[number]

/** One env-declared webhook subscription. */
export interface WebhookTarget {
  event: WebhookEvent
  url: string
}

/** Runtime zod schema for one event name (env is a boundary). */
const webhookEventSchema = z.enum(KNOWN_EVENTS)

/**
 * Parse the `LEARNING_HUB_WEBHOOKS` spec: comma-separated `eventName=url` pairs.
 * Malformed pairs (no `=`, empty name/url) and event names outside the
 * `HubEventMap` catalog are warned about and skipped.
 */
export function parseWebhookSpec(spec: string | undefined): WebhookTarget[] {
  if (!spec || !spec.trim()) return []
  const targets: WebhookTarget[] = []
  for (const part of spec.split(',')) {
    const entry = part.trim()
    if (!entry) continue
    const eq = entry.indexOf('=')
    if (eq <= 0 || eq === entry.length - 1) {
      console.warn(`[webhooks] ignoring malformed entry "${entry}" (expected eventName=url)`)
      continue
    }
    const rawEvent = entry.slice(0, eq).trim()
    const url = entry.slice(eq + 1).trim()
    const event = webhookEventSchema.safeParse(rawEvent)
    if (!event.success) {
      console.warn(
        `[webhooks] unknown event "${rawEvent}" — skipped (subscribable: ${KNOWN_EVENTS.join(', ')})`,
      )
      continue
    }
    targets.push({ event: event.data, url })
  }
  return targets
}

/**
 * POST one event payload to one webhook URL (global fetch, 3 s timeout).
 * Resolves even on failure — delivery failures are logged, never fatal.
 */
export async function dispatchWebhook(target: WebhookTarget, payload: unknown): Promise<void> {
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[webhooks] ${target.event} → ${target.url} responded ${res.status}`)
    }
  } catch (err) {
    console.error(`[webhooks] ${target.event} → ${target.url} delivery failed:`, err)
  }
}

/** Result of {@link setupWebhooks} — used for the boot log line. */
export interface WebhookSetup {
  targets: WebhookTarget[]
  subscribed: number
}

/**
 * Subscribe every env-declared webhook to the core event bus. Subscribing is
 * sync and non-fatal; each listener hands the payload to an async best-effort
 * POST (never blocks, never throws into the bus).
 */
export function setupWebhooks(spec: string | undefined): WebhookSetup {
  const targets = parseWebhookSpec(spec)
  if (targets.length === 0) return { targets, subscribed: 0 }

  let subscribed = 0
  for (const target of targets) {
    try {
      eventBus.on(target.event, (payload) => {
        void dispatchWebhook(target, payload)
      })
      subscribed++
    } catch (err) {
      console.error(`[webhooks] failed to subscribe "${target.event}":`, err)
    }
  }
  console.log(
    `[webhooks] subscribed ${subscribed}/${targets.length} webhook(s) to the core event bus`,
  )
  return { targets, subscribed }
}

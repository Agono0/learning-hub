/**
 * Learning HUB server — outbound webhooks.
 *
 * `LEARNING_HUB_WEBHOOKS="eventName=url,eventName2=url2"` subscribes each named
 * event on the core event bus (packages/core events.ts `eventBus` singleton)
 * and POSTs the event JSON to its URL. Delivery is best-effort: global fetch
 * with a 3 s AbortSignal timeout, failures logged to console and never fatal
 * (the learning engine never waits on a webhook). Redirects are not followed: a 3xx is logged as
 * non-delivery (status and Location host only), so configure the final URL.
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
      console.warn(
        '[webhooks] ignoring a malformed entry (expected eventName=url); not shown, it may hold a secret',
      )
      continue
    }
    const rawEvent = entry.slice(0, eq).trim()
    const url = entry.slice(eq + 1).trim()
    const event = webhookEventSchema.safeParse(rawEvent)
    if (!event.success) {
      console.warn(
        `[webhooks] unknown event "${/^[\w.:-]{1,64}$/.test(rawEvent) ? rawEvent : '<not shown>'}" — skipped ` +
          `(subscribable: ${KNOWN_EVENTS.join(', ')})`,
      )
      continue
    }
    targets.push({ event: event.data, url })
  }
  return targets
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

/**
 * A configured webhook URL can carry a secret (a token in the path or query, userinfo), so logs
 * name the target by origin only. A URL that does not parse is shown as a fixed placeholder.
 */
export function originOf(url: string): string {
  try {
    const u = new URL(url)
    return u.host ? `${u.protocol}//${u.host}` : 'invalid-url'
  } catch {
    return 'invalid-url'
  }
}

/**
 * An error message with every part of the target URL that could be a secret removed: the full
 * URL, userinfo, path, query and fragment. Only the error name and the cleaned message are kept
 * (never the cause chain or stack, which may repeat the URL).
 */
export function describeFailure(err: unknown, url: string): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : 'non-error thrown'
  const secrets = [url]
  try {
    const u = new URL(url)
    secrets.push(u.href, u.username, u.password, u.search, u.hash)
    for (const seg of u.pathname.split('/')) secrets.push(seg)
    for (const [k, v] of u.searchParams) secrets.push(k, v)
    secrets.push(decodeURIComponent(u.pathname))
  } catch {
    // keep the raw URL only
  }
  let out = raw
  for (const part of secrets.filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) {
    out = out.split(part).join('[redacted]')
  }
  return out
}

/** What one POST to a configured URL came to. A redirect is never followed or counted as delivery. */
export type PostOutcome =
  | { kind: 'response'; status: number; ok: boolean }
  | { kind: 'redirect'; status: number; locationHost: string }

/** Host of a redirect's Location, for the log line: never the full URL, path, query or userinfo. */
function locationHostOf(res: Response, from: string): string {
  const location = res.headers.get('location')
  if (!location) return 'none'
  try {
    return new URL(location, from).host || 'unknown'
  } catch {
    return 'unparseable'
  }
}

/**
 * POST a JSON payload to an operator-configured URL. Redirects are NOT followed: a 3xx would
 * re-send the event to (or silently drop it at) a host the operator never wrote down, so every 3xx
 * is reported as a redirect and the caller treats it as non-delivery. The response body is always
 * cancelled so the socket is released. Throws on network error or timeout.
 */
export async function postJson(
  url: string,
  payload: unknown,
  opts: { timeoutMs: number; fetchFn?: FetchFn },
): Promise<PostOutcome> {
  const fetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i))
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'manual',
    signal: AbortSignal.timeout(opts.timeoutMs),
  })
  await res.body?.cancel().catch(() => undefined)
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    return { kind: 'redirect', status: res.status, locationHost: locationHostOf(res, url) }
  }
  return { kind: 'response', status: res.status, ok: res.ok }
}

/**
 * POST one event payload to one webhook URL (3 s timeout, no redirects).
 * Resolves even on failure — delivery failures are logged, never fatal.
 */
export async function dispatchWebhook(
  target: WebhookTarget,
  payload: unknown,
  fetchFn?: FetchFn,
): Promise<void> {
  try {
    const out = await postJson(target.url, payload, { timeoutMs: WEBHOOK_TIMEOUT_MS, fetchFn })
    if (out.kind === 'redirect') {
      console.error(
        `[webhooks] ${target.event} not delivered: ${originOf(target.url)} responded ` +
          `${out.status} redirect to ${out.locationHost}; redirects are not followed, set the final URL in LEARNING_HUB_WEBHOOKS`,
      )
    } else if (!out.ok) {
      console.error(`[webhooks] ${target.event} → ${originOf(target.url)} responded ${out.status}`)
    }
  } catch (err) {
    console.error(
      `[webhooks] ${target.event} → ${originOf(target.url)} delivery failed: ` +
        describeFailure(err, target.url),
    )
  }
}

/**
 * Weekly-digest delivery: POST the summary to every target (5 s timeout each, no redirects) and log
 * one line per target. Kept here, not in digest.ts, because digest.ts runs its job on import.
 */
export async function postDigestSummary(
  targets: WebhookTarget[],
  summary: unknown,
  fetchFn?: FetchFn,
): Promise<void> {
  for (const target of targets) {
    try {
      const out = await postJson(target.url, summary, { timeoutMs: 5000, fetchFn })
      if (out.kind === 'redirect') {
        console.warn(
          `[digest] not delivered: ${originOf(target.url)} responded ${out.status} redirect to ` +
            `${out.locationHost}; ` +
            'redirects are not followed, set the final URL in LEARNING_HUB_WEBHOOKS',
        )
      } else {
        console.log(`[digest] ${originOf(target.url)} → ${out.status}`)
      }
    } catch (err) {
      console.warn(`[digest] ${originOf(target.url)} failed: ${describeFailure(err, target.url)}`)
    }
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

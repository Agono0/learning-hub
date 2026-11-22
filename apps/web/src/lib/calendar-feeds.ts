'use client'

/**
 * Calendar subscriptions — device-local store for the planner's iCal /
 * CalDAV feed list (S3-27, `@/lib/calendar-feeds`).
 *
 * Why device-local (audit L7a family, like `@/lib/updates` update settings):
 * a subscription controls THIS device's planner overlay and carries a
 * user-chosen color + visibility (S3-83's future hook) — until a
 * subscriptions table ships (would be a LEAD schema batch, see
 * docs/SHARED_CHANGES.md), localStorage is the honest home; the store is
 * zod-validated at every read so a corrupted record degrades to an empty
 * list, never a planner crash.
 *
 * Fetching lives in the /api/calendar/import handler (rule 1 — no raw
 * fetch here); this module only manages the list + the last imported
 * snapshot cache (per subscription, so the planner can render events
 * offline between refreshes).
 */
import { z } from 'zod'
import {
  calendarFeedEventSchema as calendarFeedEventSchemaLocal,
  calendarFeedTodoSchema as calendarFeedTodoSchemaLocal,
} from '@learning-hub/core/ics'

/** One subscribed calendar feed. */
export const calendarSubscriptionSchema = z.object({
  /** Stable local id (uuid-ish; generated at add time). */
  id: z.string().min(1).max(64),
  /** User-facing name (e.g. "Course schedule"). */
  name: z.string().trim().min(1).max(80),
  /** https feed URL (validated again at import time by the handler). */
  url: z.string().trim().url().max(2048),
  /** `ical` = plain VCALENDAR; `caldav` = multistatus-wrapped calendar-data. */
  kind: z.enum(['ical', 'caldav']).default('ical'),
  /** Dot color token (planner rows + per-calendar toggle, S3-83). */
  color: z.enum(['indigo', 'teal', 'amber', 'rose', 'lime']).default('indigo'),
  /** Show/hide the calendar's events in the planner (S3-83). */
  visible: z.boolean().default(true),
  /** ISO timestamp of the last successful import (informational). */
  lastImportedAt: z.string().optional(),
})
export type CalendarSubscription = z.infer<typeof calendarSubscriptionSchema>

/** Last imported snapshot for one subscription (planner offline render). */
export const calendarFeedCacheSchema = z.object({
  subscriptionId: z.string().min(1),
  events: z.array(calendarFeedEventSchemaLocal).max(1000),
  todos: z.array(calendarFeedTodoSchemaLocal).max(1000),
  fetchedAt: z.string().min(1),
})
export type CalendarFeedCache = z.infer<typeof calendarFeedCacheSchema>

const SUBS_KEY = 'lh-calendar-subscriptions'
const CACHE_KEY = 'lh-calendar-feed-cache'

/** Calm palette defaults for a new subscription's color. */
export const SUBSCRIPTION_COLORS = ['indigo', 'teal', 'amber', 'rose', 'lime'] as const

/**
 * Read the subscription list. Returns the schema defaults' empty list when
 * storage is unavailable (SSR/tests/private mode) or the record is invalid —
 * a corrupted store reads as "no subscriptions", never a crash.
 */
export function loadSubscriptions(): CalendarSubscription[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SUBS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => calendarSubscriptionSchema.safeParse(item))
      .filter((r): r is { success: true; data: CalendarSubscription } => r.success)
      .map((r) => r.data)
  } catch {
    return []
  }
}

/** Persist the subscription list (silent on storage errors — a nicety). */
export function saveSubscriptions(subs: CalendarSubscription[]): void {
  if (typeof window === 'undefined') return
  const valid = subs.map((s) => calendarSubscriptionSchema.parse(s))
  try {
    window.localStorage.setItem(SUBS_KEY, JSON.stringify(valid))
  } catch {
    // private mode / quota — subscriptions stay session-local
  }
}

/** Add a subscription (validated; trims the fields at the boundary). */
export function addSubscription(input: {
  name: string
  url: string
  kind?: 'ical' | 'caldav'
  color?: CalendarSubscription['color']
}): CalendarSubscription[] {
  const subs = loadSubscriptions()
  const next: CalendarSubscription = calendarSubscriptionSchema.parse({
    id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    url: input.url,
    kind: input.kind ?? 'ical',
    color: input.color ?? 'indigo',
    visible: true,
  })
  const updated = [...subs, next]
  saveSubscriptions(updated)
  return updated
}

/** Remove by id. Unknown ids are a no-op (idempotent delete). */
export function removeSubscription(id: string): CalendarSubscription[] {
  const updated = loadSubscriptions().filter((s) => s.id !== id)
  saveSubscriptions(updated)
  saveFeedCache(loadFeedCache().filter((c) => c.subscriptionId !== id))
  return updated
}

/** Toggle visibility / patch any field (validated patch merge). */
export function updateSubscription(
  id: string,
  patch: Partial<Pick<CalendarSubscription, 'name' | 'color' | 'visible' | 'lastImportedAt'>>,
): CalendarSubscription[] {
  const updated = loadSubscriptions().map((s) =>
    s.id === id ? calendarSubscriptionSchema.parse({ ...s, ...patch }) : s,
  )
  saveSubscriptions(updated)
  return updated
}

/** Read all cached feed snapshots (planner offline render). */
export function loadFeedCache(): CalendarFeedCache[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => calendarFeedCacheSchema.safeParse(item))
      .filter((r): r is { success: true; data: CalendarFeedCache } => r.success)
      .map((r) => r.data)
  } catch {
    return []
  }
}

/** Persist feed snapshots (capped per subscription by the zod maxes). */
export function saveFeedCache(entries: CalendarFeedCache[]): void {
  if (typeof window === 'undefined') return
  const valid = entries.map((e) => calendarFeedCacheSchema.parse(e))
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(valid))
  } catch {
    // over-quota (huge feeds) — the cache is disposable, next import rebuilds it
  }
}

/** Store (replace) one subscription's snapshot; stamps the subscription. */
export function putFeedCache(entry: {
  subscriptionId: string
  events: CalendarFeedCache['events']
  todos: CalendarFeedCache['todos']
  fetchedAt: string
}): CalendarFeedCache[] {
  const others = loadFeedCache().filter((c) => c.subscriptionId !== entry.subscriptionId)
  const next = [...others, calendarFeedCacheSchema.parse(entry)]
  saveFeedCache(next)
  updateSubscription(entry.subscriptionId, { lastImportedAt: entry.fetchedAt })
  return next
}

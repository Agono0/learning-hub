/**
 * Learning HUB — Notification Center policy (pure, runtime-neutral).
 *
 * The user-managed gate between "something happened" and "the OS buzzed".
 * Every OS notification in the app funnels through {@link evaluateDelivery},
 * which consults the user's channel choices, quiet hours, one-click Do-Not-
 * Disturb and the daily cap — in that order — and returns an honest decision
 * with a reason we can show in the history feed ("suppressed: quiet hours").
 *
 * Why a separate layer from the reminder planner (`reminders/`): reminders
 * decide *what* deserves attention; this layer decides *how it may be
 * delivered right now* — for reminders AND timer alerts AND achievements.
 * Policy is pure so every host (web, native worker, CLI) enforces the exact
 * same rules, and the history feed can be generated deterministically.
 *
 * Respect research: interruptions carry a resumption cost of ~23 minutes
 * (Leroy 2009), so quiet hours + DND default to protecting evening wind-down,
 * and caps prevent notification fatigue (Pielot et al. 2014, "productivity
 * interrupts attention"). The user always wins: every suppression reason is
 * inspectable, never hidden.
 */

import { z } from 'zod'
import { localDayKey } from '../streaks'
import { isQuietHours } from '../reminders'

/* ------------------------------------------------------------------ */
/* Channel catalog — the user-facing vocabulary of what can notify.    */
/* ------------------------------------------------------------------ */

export const NOTIFICATION_CHANNEL_IDS = [
  'review_due',
  'streak_saver',
  'break_reminder',
  'curriculum_nudge',
  'idea_resurface',
  'friction_checkin',
  'exam_countdown',
  'focus_complete',
  'break_complete',
  'max_focus',
  'achievement',
] as const

export type NotificationChannelId = (typeof NOTIFICATION_CHANNEL_IDS)[number]

/** Grouping for the center UI (calm: grouped lists beat flat walls). */
export const NOTIFICATION_CATEGORIES = ['reviews', 'focus', 'curriculum', 'system'] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export interface NotificationChannelDef {
  id: NotificationChannelId
  title: string
  /** One sentence: when does this fire? Shown under the channel toggle. */
  description: string
  category: NotificationCategory
  /** Ships enabled? (additive channels can default off for existing users) */
  defaultEnabled: boolean
  /** Delivery surface when enabled: OS notification vs in-app toast only. */
  defaultViaOs: boolean
}

/**
 * Channel catalog. Display order = category order, calmest first within
 * category. `focus_complete`/`break_complete` are the timer's voices (see
 * docs/native focus timer); `achievement` is deliberately default-off —
 * celebrating should never buzz a phone unsolicited.
 */
export const NOTIFICATION_CHANNELS: Readonly<
  Record<NotificationChannelId, NotificationChannelDef>
> = {
  review_due: {
    id: 'review_due',
    title: 'Reviews due',
    description: 'Your daily spaced-repetition queue is ready.',
    category: 'reviews',
    defaultEnabled: true,
    defaultViaOs: true,
  },
  streak_saver: {
    id: 'streak_saver',
    title: 'Streak saver',
    description: 'A gentle evening warning before your streak is at risk.',
    category: 'reviews',
    defaultEnabled: true,
    defaultViaOs: true,
  },
  break_reminder: {
    id: 'break_reminder',
    title: 'Break time',
    description: 'Suggests a break after a long continuous focus stretch.',
    category: 'focus',
    defaultEnabled: true,
    defaultViaOs: true,
  },
  focus_complete: {
    id: 'focus_complete',
    title: 'Focus timer finished',
    description:
      'Fires the moment a focus session completes — even when the app is in the background.',
    category: 'focus',
    defaultEnabled: true,
    defaultViaOs: true,
  },
  break_complete: {
    id: 'break_complete',
    title: 'Break over',
    description: 'Nudges you back when a scheduled break ends.',
    category: 'focus',
    defaultEnabled: true,
    defaultViaOs: true,
  },
  max_focus: {
    id: 'max_focus',
    title: 'Max Focus lock',
    description:
      'Fires when a Max Focus lock engages and when it unlocks — timer, PIN exit, battery or tamper (M2-31).',
    category: 'focus',
    defaultEnabled: true,
    defaultViaOs: true,
  },
  curriculum_nudge: {
    id: 'curriculum_nudge',
    title: 'Curriculum nudge',
    description: 'A course you have not touched in a while.',
    category: 'curriculum',
    defaultEnabled: true,
    defaultViaOs: true,
  },
  idea_resurface: {
    id: 'idea_resurface',
    title: 'Idea resurfacing',
    description: 'Resurfaces a decayed idea or note for deliberate reconsideration.',
    category: 'curriculum',
    defaultEnabled: false,
    defaultViaOs: false,
  },
  exam_countdown: {
    id: 'exam_countdown',
    title: 'Exam countdown',
    description: 'Milestone warnings as an exam approaches.',
    category: 'curriculum',
    defaultEnabled: true,
    defaultViaOs: true,
  },
  friction_checkin: {
    id: 'friction_checkin',
    title: 'Friction check-in',
    description: 'A check-in after catching repeated distractions.',
    category: 'system',
    defaultEnabled: false,
    defaultViaOs: false,
  },
  achievement: {
    id: 'achievement',
    title: 'Achievements',
    description: 'Celebrate streaks, badges and milestones.',
    category: 'system',
    defaultEnabled: false,
    defaultViaOs: true,
  },
}

/** Reminder-planner kinds → notification-center channels (1:1 where they overlap). */
export const REMINDER_KIND_TO_CHANNEL = {
  daily_review: 'review_due',
  streak_saver: 'streak_saver',
  break_reminder: 'break_reminder',
  curriculum_nudge: 'curriculum_nudge',
  idea_resurface: 'idea_resurface',
  friction_checkin: 'friction_checkin',
  exam_countdown: 'exam_countdown',
} as const satisfies Partial<Record<string, NotificationChannelId>>

/* ------------------------------------------------------------------ */
/* Prefs schema — persisted as JSON in user_settings.notification_prefs */
/* ------------------------------------------------------------------ */

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24-hour)')

export const notificationChannelPrefSchema = z.object({
  enabled: z.boolean(),
  /** Deliver through the OS (true) or keep it in-app (false). */
  viaOs: z.boolean(),
})

export type NotificationChannelPref = z.infer<typeof notificationChannelPrefSchema>

export const notificationPrefsSchema = z.object({
  /** Master switch — off means the app never contacts the OS for anything. */
  masterEnabled: z.boolean().default(true),
  channels: z.record(z.string(), notificationChannelPrefSchema).default({}),
  quietHours: z
    .object({
      enabled: z.boolean().default(true),
      start: HHMM.default('22:00'),
      end: HHMM.default('08:00'),
    })
    // NOTE: the default spells out every field — a bare `.default({})` in zod 3
    // bypasses the inner defaults and would yield `{}` (found by tests).
    .default({ enabled: true, start: '22:00', end: '08:00' }),
  /** Max OS notifications per calendar day, across all channels. */
  dailyCap: z.number().int().min(1).max(30).default(8),
  /** ISO timestamp: while now < until, suppress everything (one-click silence). */
  doNotDisturbUntil: z
    .string()
    .refine((v) => Number.isFinite(new Date(v).getTime()), 'Must be an ISO timestamp')
    .nullable()
    .default(null),
})

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>

/** Build the default prefs from the catalog (single source of truth). */
export function defaultNotificationPrefs(): NotificationPrefs {
  return notificationPrefsSchema.parse({
    channels: Object.fromEntries(
      NOTIFICATION_CHANNEL_IDS.map((id) => [
        id,
        {
          enabled: NOTIFICATION_CHANNELS[id].defaultEnabled,
          viaOs: NOTIFICATION_CHANNELS[id].defaultViaOs,
        },
      ]),
    ),
  })
}

/**
 * Parse stored prefs with hardening: unknown channel ids are dropped (older
 * catalogs), missing ids fall back to catalog defaults, invalid input falls
 * back to defaults. The user's customizations survive partial schema drift.
 */
export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const defaults = defaultNotificationPrefs()
  const parsed = notificationPrefsSchema.safeParse(raw)
  if (!parsed.success) return defaults
  const merged = { ...parsed.data, channels: { ...defaults.channels, ...parsed.data.channels } }
  const cleanChannels: Record<string, NotificationChannelPref> = {}
  for (const id of NOTIFICATION_CHANNEL_IDS) {
    cleanChannels[id] = merged.channels[id] ?? defaults.channels[id]!
  }
  return { ...merged, channels: cleanChannels }
}

/** Channel pref with catalog default applied. */
export function channelPref(
  prefs: NotificationPrefs,
  id: NotificationChannelId,
): NotificationChannelPref {
  return (
    prefs.channels[id] ?? {
      enabled: NOTIFICATION_CHANNELS[id].defaultEnabled,
      viaOs: NOTIFICATION_CHANNELS[id].defaultViaOs,
    }
  )
}

/* ------------------------------------------------------------------ */
/* Delivery decisions — the single gate every OS notification passes.  */
/* ------------------------------------------------------------------ */

export const DELIVERY_DECISIONS = [
  'deliver',
  'suppress_master',
  'suppress_dnd',
  'suppress_quiet_hours',
  'suppress_channel',
  'suppress_cap',
] as const

export type DeliveryDecision = (typeof DELIVERY_DECISIONS)[number]

/** Human-readable reasons for the history feed (never hidden from the user). */
export const DELIVERY_DECISION_REASON: Record<DeliveryDecision, string> = {
  deliver: 'Delivered',
  suppress_master: 'Notifications are turned off',
  suppress_dnd: 'Do not disturb was active',
  suppress_quiet_hours: 'Quiet hours (sleep protected)',
  suppress_channel: 'You turned this channel off',
  suppress_cap: 'Daily notification cap reached',
}

/** Facts the gate needs about the current moment. */
export interface DeliveryContext {
  now?: string | Date
  /** OS deliveries already made today, across all channels. */
  deliveredToday: number
}

/** Pure gate: decide how one notification for one channel is delivered. */
export function evaluateDelivery(
  channelId: NotificationChannelId,
  prefs: NotificationPrefs,
  ctx: DeliveryContext,
): DeliveryDecision {
  if (!prefs.masterEnabled) return 'suppress_master'
  if (prefs.doNotDisturbUntil) {
    const now = ctx.now ?? new Date()
    const until = new Date(prefs.doNotDisturbUntil)
    if (Number.isFinite(until.getTime()) && now < until) return 'suppress_dnd'
  }
  const pref = channelPref(prefs, channelId)
  if (!pref.enabled) return 'suppress_channel'
  if (prefs.quietHours.enabled) {
    const now = ctx.now ?? new Date()
    const hhmm = extractHHMM(now)
    if (isQuietHours(hhmm, prefs.quietHours.start, prefs.quietHours.end))
      return 'suppress_quiet_hours'
  }
  if (ctx.deliveredToday >= prefs.dailyCap) return 'suppress_cap'
  return 'deliver'
}

/**
 * Whether this channel's enabled deliveries go through the OS (`viaOs`) or
 * stay in-app. Suppressed deliveries never surface at all.
 */
export function deliverViaOs(prefs: NotificationPrefs, channelId: NotificationChannelId): boolean {
  return channelPref(prefs, channelId).viaOs
}

/** Extract local "HH:MM" from a Date/ISO string (same semantics as reminders). */
export function extractHHMM(dateOrIso: string | Date): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/* ------------------------------------------------------------------ */
/* Do-Not-Disturb presets — one-click calm.                            */
/* ------------------------------------------------------------------ */

export const DND_PRESETS = ['1h', '3h', 'until_tomorrow_morning'] as const

export type DndPreset = (typeof DND_PRESETS)[number]

/**
 * Compute the DND deadline for a preset. `until_tomorrow_morning` extends to
 * the *next* occurrence of the quiet-hours end time (defaults to 08:00 when
 * quiet hours are disabled), so "silence until tomorrow morning" always lands
 * after sleep, never mid-morning-of-the-same-day.
 */
export function nextDndUntil(
  preset: DndPreset,
  now: string | Date = new Date(),
  quietEnd = '08:00',
): string {
  const base = typeof now === 'string' ? new Date(now) : now
  if (preset === '1h') return new Date(base.getTime() + 60 * 60 * 1000).toISOString()
  if (preset === '3h') return new Date(base.getTime() + 3 * 60 * 60 * 1000).toISOString()

  const [endH, endM] = quietEnd.split(':').map(Number)
  const tomorrowEnd = new Date(base)
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)
  tomorrowEnd.setHours(endH ?? 8, endM ?? 0, 0, 0)
  return tomorrowEnd.toISOString()
}

/** Remaining DND milliseconds (0 when inactive) — for the center's countdown. */
export function dndRemainingMs(prefs: NotificationPrefs, now: string | Date = new Date()): number {
  if (!prefs.doNotDisturbUntil) return 0
  const until = new Date(prefs.doNotDisturbUntil).getTime()
  const nowMs = (typeof now === 'string' ? new Date(now) : now).getTime()
  return Number.isFinite(until) ? Math.max(0, until - nowMs) : 0
}

/**
 * Local calendar-day bounds as ISO instants, given the client's
 * `Date#getTimezoneOffset()` semantics (minutes to ADD to local time to get
 * UTC; negative east of UTC). Used by the daily-cap counter so "today" means
 * the user's today, not the server's.
 */
export function localDayBoundsIso(
  offsetMinutes = 0,
  now: string | Date = new Date(),
): { dayStartIso: string; dayEndIso: string; dayKey: string } {
  const d = typeof now === 'string' ? new Date(now) : now
  // dayKey = the local wall-clock date (same math as streaks.localDayKey).
  const dayKey = localDayKey(d, offsetMinutes)
  // Real instant of local midnight = shifted 00:00Z shifted back by the offset.
  const dayStartMs = new Date(`${dayKey}T00:00:00.000Z`).getTime() + offsetMinutes * 60_000
  return {
    dayStartIso: new Date(dayStartMs).toISOString(),
    dayEndIso: new Date(dayStartMs + 24 * 60 * 60 * 1000).toISOString(),
    dayKey,
  }
}

/* ------------------------------------------------------------------ */
/* Append-only delivery ledger row shape (history feed / search).      */
/* ------------------------------------------------------------------ */

export const notificationLogEntrySchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNEL_IDS),
  title: z.string().min(1).max(200),
  body: z.string().max(500).default(''),
  actionUrl: z.string().max(500).nullable().default(null),
  decision: z.enum(DELIVERY_DECISIONS),
  /** ISO instant of the decision. */
  createdAt: z.string(),
})

export type NotificationLogEntry = z.infer<typeof notificationLogEntrySchema>

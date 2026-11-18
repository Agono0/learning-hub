/**
 * Notification Center policy tests — the user-managed delivery gate.
 */
import { describe, expect, it } from 'vitest'
import {
  DND_PRESETS,
  DELIVERY_DECISION_REASON,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_IDS,
  REMINDER_KIND_TO_CHANNEL,
  channelPref,
  defaultNotificationPrefs,
  deliverViaOs,
  dndRemainingMs,
  evaluateDelivery,
  extractHHMM,
  localDayBoundsIso,
  nextDndUntil,
  notificationPrefsSchema,
  parseNotificationPrefs,
} from '../src/notification-center'

const NAP = defaultNotificationPrefs()
const NOON = new Date('2026-01-15T12:00:00')

describe('catalog integrity', () => {
  it('has unique ids with complete copy', () => {
    expect(new Set(NOTIFICATION_CHANNEL_IDS).size).toBeGreaterThanOrEqual(10)
    for (const id of NOTIFICATION_CHANNEL_IDS) {
      const def = NOTIFICATION_CHANNELS[id]
      expect(def.title.length).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
      expect(NOTIFICATION_CATEGORIES).toContain(def.category)
    }
  })

  it('maps every reminder planner kind to a channel', () => {
    const kinds: Array<keyof typeof REMINDER_KIND_TO_CHANNEL> = [
      'daily_review',
      'streak_saver',
      'break_reminder',
      'curriculum_nudge',
      'idea_resurface',
      'friction_checkin',
      'exam_countdown',
    ]
    for (const kind of kinds) {
      expect(NOTIFICATION_CHANNEL_IDS).toContain(REMINDER_KIND_TO_CHANNEL[kind])
    }
  })

  it('defaults match the catalog defaults exactly', () => {
    for (const id of NOTIFICATION_CHANNEL_IDS) {
      const pref = channelPref(NAP, id)
      expect(pref.enabled).toBe(NOTIFICATION_CHANNELS[id].defaultEnabled)
      expect(pref.viaOs).toBe(NOTIFICATION_CHANNELS[id].defaultViaOs)
    }
    // achievements are opt-in (celebration never buzzes unsolicited)
    expect(NOTIFICATION_CHANNELS.achievement.defaultEnabled).toBe(false)
  })
})

describe('evaluateDelivery — the single gate', () => {
  it('delivers by default at noon', () => {
    expect(evaluateDelivery('review_due', NAP, { now: NOON, deliveredToday: 0 })).toBe('deliver')
  })

  it('master switch wins over everything', () => {
    const off = parseNotificationPrefs({ ...NAP, masterEnabled: false })
    for (const id of NOTIFICATION_CHANNEL_IDS) {
      expect(evaluateDelivery(id, off, { now: NOON, deliveredToday: 0 })).toBe('suppress_master')
    }
  })

  it('DND suppresses while active and expires on time', () => {
    const dnd = parseNotificationPrefs({
      ...NAP,
      doNotDisturbUntil: new Date('2026-01-15T14:00:00').toISOString(),
    })
    expect(evaluateDelivery('review_due', dnd, { now: NOON, deliveredToday: 0 })).toBe(
      'suppress_dnd',
    )
    expect(
      evaluateDelivery('review_due', dnd, {
        now: new Date('2026-01-15T14:00:01'),
        deliveredToday: 0,
      }),
    ).toBe('deliver')
  })

  it('invalid DND deadline never suppresses forever', () => {
    const broken = parseNotificationPrefs({ ...NAP, doNotDisturbUntil: 'not-a-date' })
    expect(broken.doNotDisturbUntil).toBeNull()
    expect(evaluateDelivery('review_due', broken, { now: NOON, deliveredToday: 0 })).toBe('deliver')
  })

  it('quiet hours hold overnight windows (22:00→08:00 wrap)', () => {
    expect(
      evaluateDelivery('review_due', NAP, {
        now: new Date('2026-01-15T23:30:00'),
        deliveredToday: 0,
      }),
    ).toBe('suppress_quiet_hours')
    expect(
      evaluateDelivery('review_due', NAP, {
        now: new Date('2026-01-15T03:00:00'),
        deliveredToday: 0,
      }),
    ).toBe('suppress_quiet_hours')
    expect(
      evaluateDelivery('review_due', NAP, {
        now: new Date('2026-01-15T08:00:00'),
        deliveredToday: 0,
      }),
    ).toBe('deliver')
  })

  it('channel off beats quiet hours reporting (honest reason)', () => {
    const off = parseNotificationPrefs({
      ...NAP,
      channels: { review_due: { enabled: false, viaOs: true } },
    })
    expect(
      evaluateDelivery('review_due', off, {
        now: new Date('2026-01-15T23:30:00'),
        deliveredToday: 0,
      }),
    ).toBe('suppress_channel')
  })

  it('daily cap suppresses after the configured count', () => {
    expect(evaluateDelivery('review_due', NAP, { now: NOON, deliveredToday: 7 })).toBe('deliver')
    expect(evaluateDelivery('review_due', NAP, { now: NOON, deliveredToday: 8 })).toBe(
      'suppress_cap',
    )
    const tight = parseNotificationPrefs({ ...NAP, dailyCap: 1 })
    expect(evaluateDelivery('review_due', tight, { now: NOON, deliveredToday: 1 })).toBe(
      'suppress_cap',
    )
  })

  it('every decision has a user-facing reason (no hidden suppressions)', () => {
    for (const d of [
      'deliver',
      'suppress_master',
      'suppress_dnd',
      'suppress_quiet_hours',
      'suppress_channel',
      'suppress_cap',
    ] as const) {
      expect(DELIVERY_DECISION_REASON[d].length).toBeGreaterThan(0)
    }
  })
})

describe('viaOs routing', () => {
  it('routes per channel (idea resurfacing is in-app by default)', () => {
    expect(deliverViaOs(NAP, 'review_due')).toBe(true)
    expect(deliverViaOs(NAP, 'idea_resurface')).toBe(false)
  })

  it('viaOs is a user choice that survives parsing', () => {
    const p = parseNotificationPrefs({
      ...NAP,
      channels: { achievement: { enabled: true, viaOs: true } },
    })
    expect(channelPref(p, 'achievement')).toEqual({ enabled: true, viaOs: true })
  })
})

describe('parsing hardening', () => {
  it('unknown channel ids are dropped, missing ids fall back to catalog defaults', () => {
    const p = parseNotificationPrefs({
      ...NAP,
      channels: {
        review_due: { enabled: false, viaOs: false },
        ancient_channel: { enabled: true, viaOs: true },
      },
    })
    expect(channelPref(p, 'review_due').enabled).toBe(false)
    expect(channelPref(p, 'streak_saver')).toEqual(channelPref(NAP, 'streak_saver'))
    expect(p.channels.ancient_channel).toBeUndefined()
  })

  it('garbage input falls back to defaults', () => {
    expect(parseNotificationPrefs(null)).toEqual(defaultNotificationPrefs())
    expect(parseNotificationPrefs('junk')).toEqual(defaultNotificationPrefs())
    expect(parseNotificationPrefs(42)).toEqual(defaultNotificationPrefs())
  })

  it('schema rejects out-of-range caps and malformed times', () => {
    expect(notificationPrefsSchema.safeParse({ ...NAP, dailyCap: 0 }).success).toBe(false)
    expect(notificationPrefsSchema.safeParse({ ...NAP, dailyCap: 31 }).success).toBe(false)
    expect(
      notificationPrefsSchema.safeParse({
        ...NAP,
        quietHours: { enabled: true, start: '25:99', end: '08:00' },
      }).success,
    ).toBe(false)
  })
})

describe('DND presets + local day bounds', () => {
  it('1h/3h presets add exact deltas', () => {
    expect(new Date(nextDndUntil('1h', NOON)).getTime()).toBe(NOON.getTime() + 3.6e6)
    expect(new Date(nextDndUntil('3h', NOON)).getTime()).toBe(NOON.getTime() + 10.8e6)
    expect(DND_PRESETS).toHaveLength(3)
  })

  it('until_tomorrow_morning lands after the quiet-hours end, next day', () => {
    const iso = nextDndUntil('until_tomorrow_morning', NOON, '08:00')
    const d = new Date(iso)
    expect(d.getDate()).toBe(16)
    expect(d.getHours()).toBe(8)
  })

  it('dndRemainingMs counts down to zero (never negative)', () => {
    const prefs = parseNotificationPrefs({
      ...NAP,
      doNotDisturbUntil: new Date('2026-01-15T12:30:00').toISOString(),
    })
    expect(dndRemainingMs(prefs, NOON)).toBe(1.8e6)
    expect(dndRemainingMs(prefs, new Date('2026-01-15T13:00:00'))).toBe(0)
    expect(dndRemainingMs(NAP, NOON)).toBe(0)
  })

  it('localDayBoundsIso matches the streaks dayKey convention', () => {
    // UTC+2 (offset -120): local Jan 15 00:30 = Jan 14 22:30 UTC
    const bounds = localDayBoundsIso(-120, new Date('2026-01-14T22:30:00Z'))
    expect(bounds.dayKey).toBe('2026-01-15')
    const start = new Date(bounds.dayStartIso)
    expect(start.toISOString()).toBe('2026-01-14T22:00:00.000Z') // local midnight
    expect(new Date(bounds.dayEndIso).getTime() - start.getTime()).toBe(24 * 3.6e6)
  })
})

describe('time extraction', () => {
  it('extractHHMM zero-pads', () => {
    expect(extractHHMM(new Date(2026, 0, 15, 3, 5))).toBe('03:05')
    expect(extractHHMM(new Date(2026, 0, 15, 23, 59))).toBe('23:59')
  })
})

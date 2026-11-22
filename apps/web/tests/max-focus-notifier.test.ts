/**
 * Max Focus notifications (M2-31) — the pure transition/copy contract that
 * the Providers-mounted watcher consumes, plus the `max_focus` channel's
 * presence in the Notification Center catalog (the gate every delivery
 * funnels through). The hook's network/OS side is exercised in CI via the
 * settings/notification suites; these pin the decision rules.
 */
import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_IDS,
  defaultNotificationPrefs,
  evaluateDelivery,
} from '@learning-hub/core'
import {
  MAX_FOCUS_NOTIFICATION_TAG,
  maxFocusNotificationCopy,
  maxFocusNotificationDecision,
} from '../src/lib/use-max-focus-notifier'

describe('max focus notification decisions', () => {
  it('fires engaged only on an inactive → active edge', () => {
    expect(maxFocusNotificationDecision(null, { sessionId: 7, endsAt: 'x' })).toBe('engaged')
    expect(
      maxFocusNotificationDecision({ sessionId: 7, endsAt: 'x' }, { sessionId: 7, endsAt: 'x' }),
    ).toBeNull()
    // re-observations while active never re-fire
    expect(
      maxFocusNotificationDecision({ sessionId: 7, endsAt: 'x' }, { sessionId: 8, endsAt: 'y' }),
    ).toBeNull()
  })

  it('fires unlocked only on an active → inactive edge', () => {
    expect(maxFocusNotificationDecision({ sessionId: 7, endsAt: 'x' }, null)).toBe('unlocked')
    expect(maxFocusNotificationDecision(null, null)).toBeNull()
  })
})

describe('max focus notification copy', () => {
  it('engaged copy carries the lock deadline when readable', () => {
    const { title, body } = maxFocusNotificationCopy('engaged', {
      endsAt: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(title).toBe('Max Focus engaged')
    expect(body).toMatch(/Locked until/)
    expect(body).toMatch(/PIN/)
  })

  it('engaged copy falls back honestly on a missing deadline', () => {
    const { body } = maxFocusNotificationCopy('engaged', { endsAt: null })
    expect(body).toContain('The lock is on')
    // corrupt timestamps never crash the copy
    const bad = maxFocusNotificationCopy('engaged', { endsAt: 'not-a-date' })
    expect(bad.title).toBe('Max Focus engaged')
  })

  it('unlock copy points at Focus Studio (the report card narrates the ending)', () => {
    const { title, body } = maxFocusNotificationCopy('unlocked', { endsAt: null })
    expect(title).toBe('Max Focus unlocked')
    expect(body).toContain('Focus Studio')
  })

  it('the persistent-toast tag is pinned (one toast, replaced on unlock)', () => {
    expect(MAX_FOCUS_NOTIFICATION_TAG).toBe('max-focus-session')
  })
})

describe('max_focus channel in the notification gate', () => {
  it('is a first-class catalog entry with sane defaults', () => {
    expect(NOTIFICATION_CHANNEL_IDS).toContain('max_focus')
    expect(NOTIFICATION_CHANNELS['max_focus']?.category).toBe('focus')
    expect(NOTIFICATION_CHANNELS['max_focus']?.defaultEnabled).toBe(true)
    expect(NOTIFICATION_CHANNELS['max_focus']?.defaultViaOs).toBe(true)
    // prefs built from the catalog carry the channel automatically
    expect(defaultNotificationPrefs().channels['max_focus']?.enabled).toBe(true)
  })

  it('respects the gate: disabled channel suppresses, quiet hours apply', () => {
    const prefs = defaultNotificationPrefs()
    prefs.channels['max_focus'] = { enabled: false, viaOs: true }
    expect(evaluateDelivery('max_focus', prefs, { now: new Date(), deliveredToday: 0 })).not.toBe(
      'deliver',
    )
    prefs.channels['max_focus'] = { enabled: true, viaOs: true }
    // mid-day → not quiet hours → delivers
    const noon = new Date()
    noon.setHours(12, 0, 0, 0)
    expect(evaluateDelivery('max_focus', prefs, { now: noon, deliveredToday: 0 })).toBe('deliver')
  })
})

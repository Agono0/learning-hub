/**
 * Global timer web integration — the widget/chip derive everything from the
 * pure engine; this pins the wiring contract and the device persistence
 * shape (no DOM required: vitest runs in node).
 */
import { describe, expect, it } from 'vitest'
import {
  advance,
  describePhase,
  formatClock,
  idleTimerState,
  pauseTimer,
  remainingSeconds,
  startFocus,
  type FocusTimerState,
} from '@learning-hub/core/focus-timer'
import {
  defaultNotificationPrefs,
  evaluateDelivery,
  parseNotificationPrefs,
} from '@learning-hub/core/notification-center'

const T0 = new Date('2026-03-02T09:00:00.000Z')

/** The exact shape the provider persists to localStorage (wiring contract). */
function persistedShape(state: FocusTimerState): unknown {
  return JSON.parse(JSON.stringify(state))
}

describe('timer ↔ widget wiring contract', () => {
  it('widget values come from pure derivation (clock, phase, progress inputs)', () => {
    const s = startFocus(idleTimerState(), { plannedMinutes: 25 }, T0)
    const remaining = remainingSeconds(s, new Date(T0.getTime() + 10 * 60_000))
    expect(formatClock(remaining)).toBe('15:00')
    expect(describePhase(s)).toBe('Focus 1')
  })

  it('paused state freezes the visible clock (wall-clock ignored while paused)', () => {
    const s = pauseTimer(
      startFocus(idleTimerState(), { plannedMinutes: 25 }, T0),
      new Date(T0.getTime() + 10 * 60_000),
    )
    expect(remainingSeconds(s, new Date(T0.getTime() + 60 * 60_000))).toBe(15 * 60)
  })

  it('persisted state survives a JSON round-trip and restores exactly', () => {
    const s = pauseTimer(
      startFocus(idleTimerState(), { plannedMinutes: 25 }, T0),
      new Date(T0.getTime() + 5 * 60_000),
    )
    const restored = JSON.parse(JSON.stringify(persistedShape(s)))
    expect(restored.phase).toBe('paused')
    expect(restored.pausedRemainingSeconds).toBe(20 * 60)
    // advance() after restore stays idempotent for a paused state
    expect(advance(restored, new Date(T0.getTime() + 90 * 60_000)).events).toEqual([])
  })

  it('idle state renders nothing (chip/widget hidden), progress 0', () => {
    const idle = idleTimerState()
    expect(idle.phase).toBe('idle')
    expect(remainingSeconds(idle, T0)).toBe(0)
  })
})

describe('timer completion notification gate', () => {
  it('focus_complete passes the Notification Center gate with prefs defaults', () => {
    const prefs = parseNotificationPrefs(defaultNotificationPrefs())
    const noon = new Date('2026-03-02T12:00:00')
    expect(evaluateDelivery('focus_complete', prefs, { now: noon, deliveredToday: 0 })).toBe(
      'deliver',
    )
    // quiet hours (22:00) hold the completion honestly
    const night = new Date('2026-03-02T23:30:00')
    expect(evaluateDelivery('focus_complete', prefs, { now: night, deliveredToday: 0 })).toBe(
      'suppress_quiet_hours',
    )
  })

  it('channel toggles gate timer notifications like any other channel', () => {
    const prefs = parseNotificationPrefs({
      ...defaultNotificationPrefs(),
      channels: { focus_complete: { enabled: false, viaOs: true } },
    })
    expect(
      evaluateDelivery('focus_complete', prefs, {
        now: new Date('2026-03-02T12:00:00'),
        deliveredToday: 0,
      }),
    ).toBe('suppress_channel')
  })

  it('the ledger records the delivery decision shape the dispatcher posts', async () => {
    const { notificationLogEntrySchema } = await import('@learning-hub/core/notification-center')
    const parsed = notificationLogEntrySchema.safeParse({
      channel: 'focus_complete',
      title: 'Focus session complete',
      body: 'Take your break.',
      actionUrl: null,
      decision: 'deliver',
      createdAt: new Date().toISOString(),
    })
    expect(parsed.success).toBe(true)
    const bad = notificationLogEntrySchema.safeParse({
      channel: 'focus_complete',
      decision: 'maybe',
    })
    expect(bad.success).toBe(false)
  })
})

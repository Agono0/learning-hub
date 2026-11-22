import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BATTERY_UNLOCK_THRESHOLD,
  shouldAutoUnlockBattery,
} from '../src/focus-lock/battery.js'
import { forceUnlockSession, startMaxFocusSession } from '../src/focus-lock/session.js'

describe('shouldAutoUnlockBattery (M2-19)', () => {
  it('unlocks at or below the threshold on battery power', () => {
    expect(shouldAutoUnlockBattery(15, false)).toBe(true)
    expect(shouldAutoUnlockBattery(5, false)).toBe(true)
    expect(shouldAutoUnlockBattery(0, false)).toBe(true)
  })

  it('never unlocks early while plugged in', () => {
    expect(shouldAutoUnlockBattery(15, true)).toBe(false)
    expect(shouldAutoUnlockBattery(1, true)).toBe(false)
    expect(shouldAutoUnlockBattery(0, true)).toBe(false)
  })

  it('stays locked above the threshold', () => {
    expect(shouldAutoUnlockBattery(16, false)).toBe(false)
    expect(shouldAutoUnlockBattery(100, false)).toBe(false)
  })

  it('honors a custom threshold', () => {
    expect(shouldAutoUnlockBattery(25, false, 25)).toBe(true)
    expect(shouldAutoUnlockBattery(26, false, 25)).toBe(false)
    expect(shouldAutoUnlockBattery(9, false, 10)).toBe(true)
  })

  it('is defensive: junk readings never end a session', () => {
    expect(shouldAutoUnlockBattery(Number.NaN, false)).toBe(false)
    expect(shouldAutoUnlockBattery(-1, false)).toBe(false)
    expect(shouldAutoUnlockBattery(101, false)).toBe(false)
    expect(shouldAutoUnlockBattery(1.5, false)).toBe(false)
    expect(shouldAutoUnlockBattery(15, false, Number.NaN)).toBe(false)
    expect(shouldAutoUnlockBattery(15, false, -1)).toBe(false)
  })

  it('uses the 15% default threshold', () => {
    expect(DEFAULT_BATTERY_UNLOCK_THRESHOLD).toBe(15)
  })
})

describe('battery unlock integrates with the session machine (M2-01)', () => {
  it('forceUnlockSession(reason battery) ends the session and logs the reason', () => {
    const session = startMaxFocusSession({
      sessionId: 's-battery',
      startedAtMs: 1_000_000,
      minutes: 120,
      monoAnchorMs: 5_000,
    })
    const clock = { wallMs: 1_000_000 + 60 * 60_000, monoMs: 5_000 + 60 * 60_000 }
    const ended = forceUnlockSession(session, clock, 'battery')
    expect(ended.state).toBe('ended')
    expect(ended.unlockReason).toBe('battery')
    expect(ended.endedAtMs).toBe(clock.wallMs)
    // Idempotent: an already-ended session is returned unchanged.
    expect(forceUnlockSession(ended, clock, 'battery')).toEqual(ended)
  })
})

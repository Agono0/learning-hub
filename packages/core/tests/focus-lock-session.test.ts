/**
 * Max Focus session state machine — full transition matrix (M2-01).
 *
 * Every unit is pure: tests drive the machine with synthetic paired clocks
 * (wallMs, monoMs), never the real system time. M2-26 extends this file with
 * the deeper tamper/clock/battery matrix once M2-19/M2-20 land.
 */
import { describe, expect, it } from 'vitest'
import {
  CLOCK_TAMPER_TOLERANCE_MS,
  COOLDOWN_SECONDS,
  MAX_FOCUS_HARD_CAP_MINUTES,
  DEFAULT_BATTERY_UNLOCK_THRESHOLD,
  shouldAutoUnlockBattery,
  advanceSession,
  confirmSessionExit,
  extendMaxSession,
  forceUnlockSession,
  maxFocusSessionSchema,
  maxSessionStartSchema,
  missingRequiredPermissions,
  requestSessionExit,
  startMaxFocusSession,
  tamperFrictionReason,
  updateApplyGate,
  type MaxFocusSession,
  type SessionClock,
} from '../src/focus-lock'

/** Fixed session start: epoch 1_000_000_000_000, monotonic anchor 500_000. */
const START_MS = 1_000_000_000_000
const ANCHOR_MS = 500_000

/** Paired clock where monotonic time tracks wall time 1:1 (the honest host). */
function clockAt(wallOffsetMs: number): SessionClock {
  return { wallMs: START_MS + wallOffsetMs, monoMs: ANCHOR_MS + wallOffsetMs }
}

function startSession(minutes = 25): MaxFocusSession {
  return startMaxFocusSession({
    sessionId: 's1',
    startedAtMs: START_MS,
    minutes,
    monoAnchorMs: ANCHOR_MS,
  })
}

describe('max focus session — start', () => {
  it('starts locked with planned end derived from minutes', () => {
    const s = startSession(45)
    expect(s.state).toBe('locked')
    expect(s.plannedEndMs).toBe(START_MS + 45 * 60_000)
    expect(s.hardCapAtMs).toBe(START_MS + MAX_FOCUS_HARD_CAP_MINUTES * 60_000)
    expect(s.unlockReason).toBeNull()
    expect(s.endedAtMs).toBeNull()
    expect(s.exitRequestedAtMs).toBeNull()
  })

  it('hard cap is exactly 4 hours regardless of planned minutes', () => {
    expect(MAX_FOCUS_HARD_CAP_MINUTES).toBe(240)
    const s = startSession(240)
    expect(s.plannedEndMs).toBe(s.hardCapAtMs)
  })

  it('rejects out-of-bounds durations at the zod boundary', () => {
    expect(() =>
      startMaxFocusSession({
        sessionId: 's1',
        startedAtMs: START_MS,
        minutes: 5,
        monoAnchorMs: ANCHOR_MS,
      }),
    ).toThrow()
    expect(() =>
      startMaxFocusSession({
        sessionId: 's1',
        startedAtMs: START_MS,
        minutes: MAX_FOCUS_HARD_CAP_MINUTES + 1,
        monoAnchorMs: ANCHOR_MS,
      }),
    ).toThrow()
    expect(() =>
      maxSessionStartSchema.parse({ sessionId: '', startedAtMs: 0, minutes: 25, monoAnchorMs: 0 }),
    ).toThrow()
  })

  it('rejects hand-built sessions whose planned end exceeds the hard cap', () => {
    expect(() =>
      maxFocusSessionSchema.parse({
        ...startSession(10),
        plannedEndMs: START_MS + 300 * 60_000,
      }),
    ).toThrow()
  })
})

describe('max focus session — natural end (timer)', () => {
  it('stays locked with no events before the planned end', () => {
    const { session, events } = advanceSession(startSession(25), clockAt(24 * 60_000))
    expect(session.state).toBe('locked')
    expect(events).toEqual([])
  })

  it('ends with reason timer exactly at the planned end', () => {
    const { session, events } = advanceSession(startSession(25), clockAt(25 * 60_000))
    expect(session.state).toBe('ended')
    expect(session.unlockReason).toBe('timer')
    expect(session.endedAtMs).toBe(START_MS + 25 * 60_000)
    expect(events).toEqual(['session_ended'])
  })

  it('ends with reason timer at the hard cap for a full-cap session', () => {
    const s = startSession(MAX_FOCUS_HARD_CAP_MINUTES)
    const { session } = advanceSession(s, clockAt(MAX_FOCUS_HARD_CAP_MINUTES * 60_000))
    expect(session.state).toBe('ended')
    expect(session.unlockReason).toBe('timer')
  })

  it('advance is idempotent once ended (no further events or reason change)', () => {
    const first = advanceSession(startSession(10), clockAt(10 * 60_000))
    const second = advanceSession(first.session, clockAt(20 * 60_000))
    expect(second.session).toEqual(first.session)
    expect(second.events).toEqual([])
  })
})

describe('max focus session — early exit flow (request → cooldown → confirm)', () => {
  it('moves locked → cooldown with a cooldownEndsAt exactly COOLDOWN_SECONDS later', () => {
    const requested = requestSessionExit(startSession(25), clockAt(5 * 60_000))
    expect(requested.state).toBe('cooldown')
    expect(requested.exitRequestedAtMs).toBe(START_MS + 5 * 60_000)
    expect(requested.cooldownEndsAtMs).toBe(START_MS + 5 * 60_000 + COOLDOWN_SECONDS * 1000)
    expect(COOLDOWN_SECONDS).toBe(60)
  })

  it('stays in cooldown (no event) before the cooldown elapses', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    const { session, events } = advanceSession(requested, clockAt(COOLDOWN_SECONDS * 1000 - 1))
    expect(session.state).toBe('cooldown')
    expect(events).toEqual([])
  })

  it('moves cooldown → can_confirm with a cooldown_elapsed event once elapsed', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    const { session, events } = advanceSession(requested, clockAt(COOLDOWN_SECONDS * 1000))
    expect(session.state).toBe('can_confirm')
    expect(events).toEqual(['cooldown_elapsed'])
  })

  it('cannot confirm from locked even with a verified PIN (cooldown is not bypassable)', () => {
    const s = startSession(25)
    const rejected = confirmSessionExit(s, clockAt(0), { pinVerified: true })
    expect(rejected).toEqual(s)
  })

  it('cannot confirm from cooldown even with a verified PIN', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    const rejected = confirmSessionExit(requested, clockAt(1_000), { pinVerified: true })
    expect(rejected).toEqual(requested)
  })

  it('does not confirm with an unverified PIN from can_confirm', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    const canConfirm = advanceSession(requested, clockAt(COOLDOWN_SECONDS * 1000)).session
    const rejected = confirmSessionExit(canConfirm, clockAt(COOLDOWN_SECONDS * 1000 + 1_000), {
      pinVerified: false,
    })
    expect(rejected).toEqual(canConfirm)
  })

  it('confirms from can_confirm with a verified PIN → ended with reason pin', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    const canConfirm = advanceSession(requested, clockAt(COOLDOWN_SECONDS * 1000)).session
    const exited = confirmSessionExit(canConfirm, clockAt(COOLDOWN_SECONDS * 1000 + 2_000), {
      pinVerified: true,
    })
    expect(exited.state).toBe('ended')
    expect(exited.unlockReason).toBe('pin')
    expect(exited.endedAtMs).toBe(START_MS + COOLDOWN_SECONDS * 1000 + 2_000)
  })

  it('re-requesting during cooldown keeps the EARLIEST request (no cooldown pushing)', () => {
    const first = requestSessionExit(startSession(25), clockAt(0))
    const second = requestSessionExit(first, clockAt(30_000))
    expect(second.exitRequestedAtMs).toBe(first.exitRequestedAtMs)
    expect(second.cooldownEndsAtMs).toBe(first.cooldownEndsAtMs)
    expect(second.state).toBe('cooldown')
  })

  it('requesting during can_confirm or on an ended session is a no-op', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    const canConfirm = advanceSession(requested, clockAt(COOLDOWN_SECONDS * 1000)).session
    expect(requestSessionExit(canConfirm, clockAt(COOLDOWN_SECONDS * 1000 + 5_000))).toEqual(
      canConfirm,
    )
    const ended = advanceSession(canConfirm, clockAt(25 * 60_000)).session
    expect(requestSessionExit(ended, clockAt(25 * 60_000 + 1_000))).toEqual(ended)
  })

  it('a natural end during cooldown wins over the pending exit (timer, no cooldown_elapsed)', () => {
    const requested = requestSessionExit(startSession(10), clockAt(9 * 60_000))
    const { session, events } = advanceSession(requested, clockAt(10 * 60_000))
    expect(session.state).toBe('ended')
    expect(session.unlockReason).toBe('timer')
    expect(events).toEqual(['session_ended'])
  })
})

describe('max focus session — system-forced unlock', () => {
  it.each(['battery', 'failure', 'tamper'] as const)(
    'force-unlocks a locked session with reason %s',
    (reason) => {
      const ended = forceUnlockSession(startSession(25), clockAt(60_000), reason)
      expect(ended.state).toBe('ended')
      expect(ended.unlockReason).toBe(reason)
      expect(ended.endedAtMs).toBe(START_MS + 60_000)
    },
  )

  it('force-unlocks mid-cooldown and mid-can_confirm too', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    const forced = forceUnlockSession(requested, clockAt(1_000), 'battery')
    expect(forced.unlockReason).toBe('battery')
    const canConfirm = advanceSession(requested, clockAt(COOLDOWN_SECONDS * 1000)).session
    const forced2 = forceUnlockSession(
      canConfirm,
      clockAt(COOLDOWN_SECONDS * 1000 + 1_000),
      'failure',
    )
    expect(forced2.unlockReason).toBe('failure')
  })

  it('force-unlock on an ended session is a no-op (first reason wins)', () => {
    const ended = advanceSession(startSession(10), clockAt(10 * 60_000)).session
    const after = forceUnlockSession(ended, clockAt(11 * 60_000), 'battery')
    expect(after).toEqual(ended)
    expect(after.unlockReason).toBe('timer')
  })
})

describe('max focus session — monotonic anchor vs wall clock (tamper)', () => {
  it('accepts drift within CLOCK_TAMPER_TOLERANCE_MS (NTP slew noise)', () => {
    const s = startSession(25)
    const within = advanceSession(s, {
      wallMs: START_MS + CLOCK_TAMPER_TOLERANCE_MS,
      monoMs: ANCHOR_MS,
    })
    expect(within.session.state).toBe('locked')
    expect(within.events).toEqual([])
  })

  it('ends with reason tamper when wall time jumps ahead of monotonic time', () => {
    const s = startSession(25)
    const clock = {
      wallMs: START_MS + CLOCK_TAMPER_TOLERANCE_MS + 60_000, // wall jumped ~1min
      monoMs: ANCHOR_MS, // monotonic barely moved
    }
    const { session, events } = advanceSession(s, clock)
    expect(session.state).toBe('ended')
    expect(session.unlockReason).toBe('tamper')
    expect(events).toEqual(['session_ended'])
  })

  it('ends with reason tamper when the wall clock is rolled BACK', () => {
    const s = startSession(25)
    const clock = { wallMs: START_MS - 60_000, monoMs: ANCHOR_MS + 30_000 }
    const { session } = advanceSession(s, clock)
    expect(session.state).toBe('ended')
    expect(session.unlockReason).toBe('tamper')
  })

  it('tamper end is terminal — later honest advances cannot resurrect it', () => {
    const s = startSession(25)
    const tampered = advanceSession(s, {
      wallMs: START_MS + 3_600_000,
      monoMs: ANCHOR_MS + 1_000,
    }).session
    const honest = advanceSession(tampered, clockAt(60_000))
    expect(honest.session).toEqual(tampered)
    expect(honest.events).toEqual([])
  })
})

describe('max focus session — extend (clamped by hard cap)', () => {
  it('extends the planned end while locked', () => {
    const extended = extendMaxSession(startSession(25), clockAt(1_000), { extraMinutes: 25 })
    expect(extended.plannedEndMs).toBe(START_MS + 50 * 60_000)
    expect(extended.state).toBe('locked')
  })

  it('clamps the extension at the hard cap', () => {
    const extended = extendMaxSession(startSession(200), clockAt(1_000), { extraMinutes: 100 })
    expect(extended.plannedEndMs).toBe(extended.hardCapAtMs)
    expect(extended.plannedEndMs).toBe(START_MS + MAX_FOCUS_HARD_CAP_MINUTES * 60_000)
  })

  it('refuses to extend outside the locked state (no outrunning the exit gate)', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    expect(extendMaxSession(requested, clockAt(1_000), { extraMinutes: 10 })).toEqual(requested)
  })

  it('rejects non-positive or oversized extra minutes at the zod boundary', () => {
    expect(() => extendMaxSession(startSession(25), clockAt(0), { extraMinutes: 0 })).toThrow()
    expect(() => extendMaxSession(startSession(25), clockAt(0), { extraMinutes: 241 })).toThrow()
  })
})

describe('max focus session — clock boundary validation', () => {
  it('rejects malformed clock readings (negative or non-finite)', () => {
    const s = startSession(25)
    expect(() => advanceSession(s, { wallMs: -1, monoMs: 0 })).toThrow()
    expect(() => advanceSession(s, { wallMs: Number.NaN, monoMs: 0 })).toThrow()
    expect(() => advanceSession(s, { wallMs: 0, monoMs: Number.POSITIVE_INFINITY })).toThrow()
  })
})

describe('update-apply gate (O1-06) — never apply during Max Focus', () => {
  it('allows apply with no session at all', () => {
    expect(updateApplyGate(null)).toEqual({ allowed: true, reason: 'no-session' })
  })

  it('allows apply once the session has ended (nothing left to protect)', () => {
    const ended = advanceSession(startSession(10), clockAt(10 * 60_000)).session
    expect(updateApplyGate(ended)).toEqual({ allowed: true, reason: 'session-ended' })
    const pinned = confirmSessionExit(
      advanceSession(
        requestSessionExit(startSession(25), clockAt(0)),
        clockAt(COOLDOWN_SECONDS * 1000),
      ).session,
      clockAt(COOLDOWN_SECONDS * 1000 + 1_000),
      { pinVerified: true },
    )
    expect(updateApplyGate(pinned)).toEqual({ allowed: true, reason: 'session-ended' })
  })

  it('refuses apply in every running phase (locked / cooldown / can_confirm)', () => {
    const locked = startSession(25)
    expect(updateApplyGate(locked)).toEqual({ allowed: false, reason: 'session-active' })
    const cooldown = requestSessionExit(locked, clockAt(0))
    expect(updateApplyGate(cooldown)).toEqual({ allowed: false, reason: 'session-active' })
    const canConfirm = advanceSession(cooldown, clockAt(COOLDOWN_SECONDS * 1000)).session
    expect(updateApplyGate(canConfirm)).toEqual({ allowed: false, reason: 'session-active' })
  })

  it('refuses apply for a hard-cap-extended session that is still running', () => {
    const extended = extendMaxSession(startSession(200), clockAt(0), { extraMinutes: 40 })
    expect(updateApplyGate(extended)).toEqual({ allowed: false, reason: 'session-active' })
  })
})

describe('tamper detection (M2-20) — permissions revoked + friction reasons', () => {
  const REQUIRED = ['overlay', 'device_admin', 'usage_stats']

  it('reports missing permissions case-insensitively and trims noise', () => {
    expect(
      missingRequiredPermissions([' Overlay ', 'DEVICE_ADMIN', 'usage-stats'], REQUIRED),
    ).toEqual(['usage_stats'])
    expect(
      missingRequiredPermissions(['overlay', 'device_admin', 'usage_stats'], REQUIRED),
    ).toEqual([])
    expect(missingRequiredPermissions([], REQUIRED)).toEqual(REQUIRED)
  })

  it('classifies the friction reason for revoked permissions', () => {
    const missing = missingRequiredPermissions(['device_admin'], REQUIRED)
    expect(missing).toEqual(['overlay', 'usage_stats'])
    expect(tamperFrictionReason(missing)).toBe('permissions revoked: overlay, usage_stats')
    expect(tamperFrictionReason([])).toBe(
      'clock tamper: wall clock diverged from the monotonic anchor',
    )
  })

  it('ends the session with reason tamper when permissions are revoked mid-session', () => {
    const s = startSession(25)
    // Tick 1: all granted — session continues.
    expect(advanceSession(s, clockAt(60_000)).session.state).toBe('locked')
    // Tick 2: the user revoked device_admin → platform detects, force-ends.
    const missing = missingRequiredPermissions(['overlay'], REQUIRED)
    const ended = forceUnlockSession(s, clockAt(120_000), 'tamper')
    expect(ended.state).toBe('ended')
    expect(ended.unlockReason).toBe('tamper')
    expect(tamperFrictionReason(missing)).toBe('permissions revoked: device_admin, usage_stats')
    // The tamper end is terminal (idempotent advance).
    expect(advanceSession(ended, clockAt(180_000)).events).toEqual([])
  })
})

describe('max focus session — full transition matrix (M2-26)', () => {
  it('matrix: every state × every operation converges to the documented outcome', () => {
    const states = {
      locked: startSession(25),
      cooldown: requestSessionExit(startSession(25), clockAt(0)),
      can_confirm: advanceSession(requestSessionExit(startSession(25), clockAt(0)), {
        wallMs: START_MS + (COOLDOWN_SECONDS + 1) * 1000,
        monoMs: ANCHOR_MS + (COOLDOWN_SECONDS + 1) * 1000,
      }).session,
      ended: advanceSession(startSession(10), clockAt(10 * 60_000)).session,
    } as const

    for (const [stateName, session] of Object.entries(states)) {
      // advance (honest clocks, mid-window): only cooldown → can_confirm moves.
      const advanced = advanceSession(session, clockAt(60_000))
      if (stateName === 'cooldown') {
        expect(advanced.session.state).toBe('can_confirm')
        expect(advanced.events).toContain('cooldown_elapsed')
      } else {
        expect(advanced.session.state).toBe(session.state)
        expect(advanced.events).toEqual([])
      }

      // requestExit: only locked moves; everything else unchanged.
      const requested = requestSessionExit(session, clockAt(60_000))
      if (stateName === 'locked') {
        expect(requested.state).toBe('cooldown')
      } else {
        expect(requested).toEqual(session)
      }

      // confirm(pin): only can_confirm ends with reason pin.
      const confirmed = confirmSessionExit(session, clockAt(60_000), { pinVerified: true })
      if (stateName === 'can_confirm') {
        expect(confirmed.state).toBe('ended')
        expect(confirmed.unlockReason).toBe('pin')
      } else {
        expect(confirmed).toEqual(session)
      }

      // forceUnlock: any non-ended state ends with the given reason; ended keeps its first reason.
      const forced = forceUnlockSession(session, clockAt(60_000), 'failure')
      if (stateName === 'ended') {
        expect(forced).toEqual(session)
        expect(forced.unlockReason).toBe('timer')
      } else {
        expect(forced.state).toBe('ended')
        expect(forced.unlockReason).toBe('failure')
      }

      // extend: only locked changes the planned end.
      const extended = extendMaxSession(session, clockAt(60_000), { extraMinutes: 5 })
      if (stateName === 'locked') {
        expect(extended.plannedEndMs).toBe(session.plannedEndMs + 5 * 60_000)
      } else {
        expect(extended).toEqual(session)
      }
    }
  })

  it('battery gate → force-unlock end-to-end: low battery on battery power ends with reason battery', () => {
    // The M2-19 gate (core/focus-lock/battery.ts) decides; the machine executes.
    const levelPct = 12
    const pluggedIn = false
    const gateFires = !pluggedIn && levelPct <= DEFAULT_BATTERY_UNLOCK_THRESHOLD
    expect(gateFires).toBe(true)
    const ended = forceUnlockSession(startSession(120), clockAt(90 * 60_000), 'battery')
    expect(ended.state).toBe('ended')
    expect(ended.unlockReason).toBe('battery')
    // Charging device at the same level: gate stays closed, session continues.
    expect(shouldAutoUnlockBattery(levelPct, true)).toBe(false)
    expect(shouldAutoUnlockBattery(levelPct + 10, pluggedIn)).toBe(false)
  })

  it('clock tamper mid-exit-flow ends the session with tamper (before the gate can win)', () => {
    const requested = requestSessionExit(startSession(25), clockAt(0))
    const tampered = advanceSession(requested, {
      wallMs: START_MS + 3_600_000, // wall jumped an hour
      monoMs: ANCHOR_MS + 1_000, // monotonic barely moved
    })
    expect(tampered.session.state).toBe('ended')
    expect(tampered.session.unlockReason).toBe('tamper')
    expect(tampered.events).toEqual(['session_ended'])
  })

  it('resume equivalence: a fresh-anchored resumed session behaves like a started one (M2-24)', () => {
    // startMaxFocusSession at T with anchor A; the resumed twin at T+60min has
    // anchor = its own "now". Same wall deadline → same end behavior.
    const original = startSession(120)
    const resumedTwin = startMaxFocusSession({
      sessionId: original.sessionId,
      startedAtMs: original.startedAtMs + 60 * 60_000,
      minutes: 60,
      monoAnchorMs: ANCHOR_MS + 60 * 60_000,
    })
    // Both end at the same absolute instant with reason timer.
    const wallEnd = START_MS + 120 * 60_000 + 1_000
    const endOriginal = advanceSession(original, {
      wallMs: wallEnd,
      monoMs: ANCHOR_MS + 120 * 60_000 + 1_000,
    })
    const endResumed = advanceSession(resumedTwin, {
      wallMs: wallEnd,
      // The twin's monotonic clock keeps ticking from ITS anchor: it was
      // re-based at start (fresh anchor), and by wallEnd it has advanced the
      // twin's full wall elapsed (60min + 1s). A stale reading trips the
      // tamper gate BY DESIGN — that is exactly what M2-20 detects.
      monoMs: ANCHOR_MS + 120 * 60_000 + 1_000,
    })
    expect(endOriginal.session.unlockReason).toBe('timer')
    expect(endResumed.session.unlockReason).toBe('timer')
    expect(endResumed.session.endedAtMs).toBe(endOriginal.session.endedAtMs)
  })
})

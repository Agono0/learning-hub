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
  advanceSession,
  confirmSessionExit,
  extendMaxSession,
  forceUnlockSession,
  maxFocusSessionSchema,
  maxSessionStartSchema,
  requestSessionExit,
  startMaxFocusSession,
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

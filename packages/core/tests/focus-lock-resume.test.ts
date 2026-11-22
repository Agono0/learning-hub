import { describe, expect, it } from 'vitest'
import {
  persistedMaxFocusSessionSchema,
  resumeMaxFocusSession,
  type PersistedMaxFocusSession,
} from '../src/focus-lock/resume.js'
import { advanceSession, startMaxFocusSession } from '../src/focus-lock/session.js'

const BASE: PersistedMaxFocusSession = {
  sessionId: 's-resume',
  startedAtMs: 1_000_000,
  plannedEndMs: 1_000_000 + 60 * 60_000, // 1h window
  hardCapAtMs: 1_000_000 + 240 * 60_000,
  allowedApps: ['com.android.dialer', 'code'],
  savedAtMs: 1_000_000 + 30 * 60_000,
  resumeExpected: true,
}

describe('resumeMaxFocusSession (M2-24)', () => {
  it('resumes the remaining window with a FRESH monotonic anchor', () => {
    // Device rebooted: wall clock continued, monotonic clock restarted (~10s).
    const clock = { wallMs: BASE.savedAtMs + 60_000, monoMs: 10_000 }
    const resumed = resumeMaxFocusSession(BASE, clock)
    expect(resumed).not.toBeNull()
    expect(resumed?.sessionId).toBe('s-resume')
    // Deadlines preserved exactly — the user loses no locked time.
    expect(resumed?.plannedEndMs).toBe(BASE.plannedEndMs)
    expect(resumed?.hardCapAtMs).toBe(BASE.hardCapAtMs)
    // Fresh anchor: aligned with the new monotonic epoch…
    expect(resumed?.monoAnchorMs).toBe(clock.monoMs)
    // …so the tamper gate passes on the first post-resume advance.
    const next = { wallMs: clock.wallMs + 5_000, monoMs: clock.monoMs + 5_000 }
    expect(() => advanceSession(resumed!, next)).not.toThrow()
    expect(advanceSession(resumed!, next).session.state).toBe('locked')
  })

  it('returns null once the planned end has passed (session complete, not resumed)', () => {
    const clock = { wallMs: BASE.plannedEndMs + 1, monoMs: 50_000 }
    expect(resumeMaxFocusSession(BASE, clock)).toBeNull()
  })

  it('returns null when the hard cap passed (belt and suspenders)', () => {
    const overCap = { ...BASE, plannedEndMs: BASE.hardCapAtMs + 60_000 }
    const clock = { wallMs: BASE.hardCapAtMs + 1, monoMs: 50_000 }
    expect(resumeMaxFocusSession(overCap, clock)).toBeNull()
  })

  it('fails CLOSED on corrupt persistence (wrong cap order, bad shape)', () => {
    const corrupt = { ...BASE, plannedEndMs: BASE.hardCapAtMs + 1, hardCapAtMs: BASE.hardCapAtMs }
    const clock = { wallMs: BASE.startedAtMs + 1_000, monoMs: 500 }
    expect(resumeMaxFocusSession(corrupt, clock)).toBeNull()
    expect(resumeMaxFocusSession({ ...BASE, sessionId: '' }, clock)).toBeNull()
    expect(resumeMaxFocusSession({ ...BASE, resumeExpected: false as never }, clock)).toBeNull()
    expect(resumeMaxFocusSession(null as never, clock)).toBeNull()
  })

  it('a resumed session still enforces its original planned end', () => {
    const clock = { wallMs: BASE.savedAtMs + 60_000, monoMs: 10_000 }
    const resumed = resumeMaxFocusSession(BASE, clock)!
    // The paired clock at the planned end: wall advanced to plannedEndMs+1,
    // so monotonic must have advanced by the SAME span since the resume
    // anchor (plannedEndMs - resumeWall) — otherwise the tamper gate
    // correctly trips (M2-24 fixture math; twin fixed in session.test).
    const atEnd = {
      wallMs: BASE.plannedEndMs + 1,
      monoMs: clock.monoMs + (BASE.plannedEndMs - clock.wallMs) + 1,
    }
    const advanced = advanceSession(resumed, atEnd)
    expect(advanced.session.state).toBe('ended')
    expect(advanced.session.unlockReason).toBe('timer')
    expect(advanced.events).toContain('session_ended')
  })

  it('resumed data survives a JSON round-trip the way device-local storage stores it', () => {
    const restored: PersistedMaxFocusSession = JSON.parse(JSON.stringify(BASE))
    expect(() => persistedMaxFocusSessionSchema.parse(restored)).not.toThrow()
    expect(
      resumeMaxFocusSession(restored, { wallMs: BASE.savedAtMs, monoMs: 5_000 }),
    ).not.toBeNull()
  })

  it('coexists with the normal start path (start → persist → resume equivalence)', () => {
    // The persisted record came from a machine session; resumed fields for
    // the same instant must line up with a fresh start of the same shape.
    const machine = startMaxFocusSession({
      sessionId: BASE.sessionId,
      startedAtMs: BASE.startedAtMs,
      minutes: 60,
      monoAnchorMs: 1_000,
    })
    expect(machine.plannedEndMs).toBe(BASE.plannedEndMs)
  })
})

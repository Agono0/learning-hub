/**
 * Global focus timer engine tests — wall-clock derivation, pause/resume,
 * cycle advancement, missed completions, persistence hardening.
 */
import { describe, expect, it } from 'vitest'
import {
  advance,
  cancelTimer,
  channelForEvent,
  describePhase,
  deserializeTimerState,
  formatClock,
  idleTimerState,
  isFocusing,
  pauseTimer,
  plannedSeconds,
  progress01,
  remainingSeconds,
  resumeTimer,
  serializeTimerState,
  startBreak,
  startFocus,
  timerStartConfigSchema,
  type FocusTimerState,
} from '../src/focus-timer'

const T0 = new Date('2026-03-02T09:00:00.000Z')
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000)

/** Start a 25m focus with the canonical pomodoro config. */
function started(
  now = T0,
  overrides: Partial<{
    plannedMinutes: number
    autoBreak: boolean
    cyclesPerLongBreak: number
    serverSessionId: number | null
  }> = {},
): FocusTimerState {
  return startFocus(
    idleTimerState(),
    {
      plannedMinutes: overrides.plannedMinutes ?? 25,
      autoBreak: overrides.autoBreak ?? true,
      cyclesPerLongBreak: overrides.cyclesPerLongBreak ?? 4,
      serverSessionId: overrides.serverSessionId ?? null,
    },
    now,
  )
}

describe('startFocus', () => {
  it('sets a wall-clock deadline and the focusing phase', () => {
    const s = started()
    expect(s.phase).toBe('focusing')
    expect(new Date(s.endsAt).getTime()).toBe(at(25).getTime())
    expect(s.cycle).toBe(0)
  })

  it('rejects a second concurrent run (explicit error, not silent restart)', () => {
    expect(() => startFocus(started(), { plannedMinutes: 10 }, T0)).toThrow(/already running/)
  })

  it('validates config through zod (1..180 minutes)', () => {
    expect(timerStartConfigSchema.safeParse({ plannedMinutes: 0 }).success).toBe(false)
    expect(timerStartConfigSchema.safeParse({ plannedMinutes: 181 }).success).toBe(false)
    expect(timerStartConfigSchema.safeParse({ plannedMinutes: 25 }).success).toBe(true)
  })

  it('carries the task label and type', () => {
    const s = startFocus(
      idleTimerState(),
      { plannedMinutes: 45, type: 'deep', task: 'FSRS paper' },
      T0,
    )
    expect(s.task).toBe('FSRS paper')
    expect(s.type).toBe('deep')
  })
})

describe('remaining/progress — drift-free derivation', () => {
  it('derives remaining time from the wall clock, not tick counts', () => {
    const s = started()
    expect(remainingSeconds(s, at(10))).toBe(15 * 60)
    expect(remainingSeconds(s, at(25))).toBe(0)
    expect(remainingSeconds(s, at(120))).toBe(0) // never negative
  })

  it('progress saturates at [0,1]', () => {
    const s = started()
    expect(progress01(s, at(5))).toBeCloseTo(0.2)
    expect(progress01(s, at(50))).toBe(1)
    expect(progress01(idleTimerState(), T0)).toBe(0)
  })

  it('plannedSeconds reflects the running phase (focus vs break)', () => {
    const s = started()
    expect(plannedSeconds(s)).toBe(25 * 60)
    const { state: brk } = advance(s, at(25))
    expect(brk.phase).toBe('breaking')
    expect(plannedSeconds(brk)).toBe(5 * 60)
  })
})

describe('advance — completions and cycles', () => {
  it('emits focus_complete exactly once and auto-starts the break', () => {
    const s = started()
    const first = advance(s, at(25))
    expect(first.events).toEqual(['focus_complete'])
    expect(first.state.phase).toBe('breaking')
    expect(first.state.cycle).toBe(1)
    // idempotent: advancing again at the same instant emits nothing new
    const second = advance(first.state, at(25))
    expect(second.events).toEqual([])
    expect(second.state.phase).toBe('breaking') // break deadline is future
    // break deadline = focus endsAt + breakMinutes
    expect(new Date(second.state.endsAt).getTime()).toBe(at(30).getTime())
  })

  it('emits break_complete and returns to idle-ready', () => {
    const s = advance(started(), at(25)).state
    const done = advance(s, at(30))
    expect(done.events).toEqual(['break_complete'])
    expect(done.state.phase).toBe('idle')
    expect(done.state.cycle).toBe(1)
  })

  it('long break after every Nth completed cycle', () => {
    // cyclesPerLongBreak = 2: the second auto-break must be the LONG one (15m).
    let s = started(T0, { cyclesPerLongBreak: 2 })
    s = advance(s, at(25)).state // cycle 1 → short break (5m)
    expect(new Date(s.endsAt).getTime()).toBe(at(30).getTime())
    s = advance(s, at(30)).state // break done → idle
    s = startFocus(s, { plannedMinutes: 25, cyclesPerLongBreak: 2 }, at(30))
    s = advance(s, at(55)).state // cycle 2 → LONG break (15m)
    expect(s.cycle).toBe(2)
    expect(new Date(s.endsAt).getTime()).toBe(at(70).getTime())
  })

  it('with autoBreak off, parks in awaiting_break instead of starting a break', () => {
    const s = started(T0, { autoBreak: false })
    const { state: next, events } = advance(s, at(25))
    expect(events).toEqual(['focus_complete'])
    expect(next.phase).toBe('awaiting_break')
    expect(next.endsAt).toBe('')
    // user continues manually
    const brk = startBreak(next, at(26))
    expect(brk.phase).toBe('breaking')
    expect(new Date(brk.endsAt).getTime()).toBe(at(26 + 5).getTime())
  })

  it('missed completions (device asleep for hours) settle calmly, never spam', () => {
    const s = started(at(-600)) // started 10h ago — dozens of cycles passed
    const { state: next, events } = advance(s, new Date())
    // At most one of each event; the break (also long past) completes inline.
    expect(events).toEqual(['focus_complete', 'break_complete'])
    expect(next.phase).toBe('idle')
    expect(next.cycle).toBe(1) // honest: one settled block, not fabricated dozens
    // idempotent: advancing again emits nothing
    expect(advance(next, new Date()).events).toEqual([])
  })

  it('a partially-elapsed break survives a short gap', () => {
    const s = advance(started(), at(25)).state // break until 09:30
    const { state: next, events } = advance(s, at(27))
    expect(events).toEqual([])
    expect(next.phase).toBe('breaking')
    expect(remainingSeconds(next, at(27))).toBe(3 * 60)
  })
})

describe('pause/resume', () => {
  it('freezes remaining seconds and resumes with a fresh deadline', () => {
    const s = started()
    const p = pauseTimer(s, at(10))
    expect(p.phase).toBe('paused')
    expect(p.pausedRemainingSeconds).toBe(15 * 60)
    expect(remainingSeconds(p, at(40))).toBe(15 * 60) // frozen — wall clock ignored
    const r = resumeTimer(p, at(40))
    expect(r.phase).toBe('focusing')
    expect(new Date(r.endsAt).getTime()).toBe(at(55).getTime())
  })

  it('remembers a paused BREAK and resumes into breaking', () => {
    const s = advance(started(), at(25)).state
    const p = pauseTimer(s, at(26))
    expect(p.pausedPhaseWasBreak).toBe(true)
    const r = resumeTimer(p, at(28))
    expect(r.phase).toBe('breaking')
  })

  it('pause is a no-op on idle; resume without a pause is a no-op', () => {
    const idle = idleTimerState()
    expect(pauseTimer(idle, T0).phase).toBe('idle')
    expect(resumeTimer(idle, T0).phase).toBe('idle')
  })

  it('isFocusing distinguishes focus from break across pauses', () => {
    const s = started()
    expect(isFocusing(s)).toBe(true)
    const brk = advance(s, at(25)).state
    expect(isFocusing(brk)).toBe(false)
    expect(isFocusing(pauseTimer(brk, at(26)))).toBe(false)
    expect(isFocusing(pauseTimer(s, at(1)))).toBe(true)
  })
})

describe('cancel + persistence', () => {
  it('cancel resets to idle but keeps the user config', () => {
    const s = started(T0, { plannedMinutes: 50 })
    const c = cancelTimer(s)
    expect(c.phase).toBe('idle')
    expect(c.cycle).toBe(0)
    expect(c.plannedMinutes).toBe(25) // fresh start defaults
    expect(c.breakMinutes).toBe(5) // config kept
  })

  it('serializes and restores without loss', () => {
    const s = pauseTimer(started(), at(10))
    const restored = deserializeTimerState(JSON.parse(JSON.stringify(serializeTimerState(s))))
    expect(restored).not.toBeNull()
    expect(restored?.phase).toBe('paused')
    expect(restored?.pausedRemainingSeconds).toBe(15 * 60)
    expect(remainingSeconds(restored!, at(99))).toBe(15 * 60)
  })

  it('corrupt storage degrades to null (caller falls back to idle)', () => {
    expect(deserializeTimerState(null)).toBeNull()
    expect(deserializeTimerState({ phase: 'banana' })).toBeNull()
    expect(deserializeTimerState('junk')).toBeNull()
    expect(deserializeTimerState({ ...idleTimerState(), plannedMinutes: 999 })).toBeNull()
  })
})

describe('presentation', () => {
  it('formatClock zero-pads mm:ss', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(600)).toBe('10:00')
  })

  it('describePhase labels every phase (color never the only signal)', () => {
    expect(describePhase(idleTimerState())).toBe('Idle')
    expect(describePhase(started())).toBe('Focus 1')
    expect(describePhase(advance(started(), at(25)).state)).toBe('Break')
    expect(describePhase(pauseTimer(started(), at(5)))).toBe('Paused')
    expect(describePhase(advance(started(T0, { autoBreak: false }), at(25)).state)).toBe(
      'Break ready',
    )
  })

  it('timer events map to notification-center channels', () => {
    expect(channelForEvent('focus_complete')).toBe('focus_complete')
    expect(channelForEvent('break_complete')).toBe('break_complete')
  })
})

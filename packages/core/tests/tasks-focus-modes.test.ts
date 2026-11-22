/**
 * Focus strategies (S3-32 / S3-80): pomodoro cadence + long breaks, flowtime
 * earned breaks, countdown defaults from a task's remaining estimate, and
 * the S3-34 taskId binding riding on every state.
 */
import { describe, expect, it } from 'vitest'
import {
  advanceFocusMode,
  cancelFocusMode,
  completeFocusRunEarly,
  countdownMinutesFor,
  defaultFocusModeState,
} from '../src/tasks/focus-modes'

const NOW = 1_000_000_000_000
const MIN = 60_000

describe('pomodoro', () => {
  it('starts a 25-minute focus phase bound to the task (S3-34)', () => {
    const s = defaultFocusModeState('pomodoro', 7, NOW)
    expect(s.phase).toBe('focus')
    expect(s.phaseEndsAtMs).toBe(NOW + 25 * MIN)
    expect(s.taskId).toBe(7)
    expect(s.completedRuns).toBe(0)
  })

  it('rolls into a short break, then the long break on the 4th run', () => {
    let s = defaultFocusModeState('pomodoro', null, NOW)
    for (let run = 1; run <= 3; run++) {
      const step = advanceFocusMode(s, s.phaseEndsAtMs)
      s = step.state
      if (run < 3) expect(step.events).toEqual(['phase_complete'])
      expect(s.phase).toBe('break')
      expect(s.longBreak).toBe(false)
      // break completes → next focus
      s = advanceFocusMode(s, s.phaseEndsAtMs).state
      expect(s.phase).toBe('focus')
    }
    // 4th focus completes → LONG break
    const step = advanceFocusMode(s, s.phaseEndsAtMs)
    expect(step.events).toEqual(['phase_complete', 'long_break_start'])
    expect(step.state.phase).toBe('break')
    expect(step.state.longBreak).toBe(true)
    expect(step.state.completedRuns).toBe(4)
  })

  it('is idempotent before the phase ends', () => {
    const s = defaultFocusModeState('pomodoro', null, NOW)
    const mid = advanceFocusMode(s, NOW + 5 * MIN)
    const again = advanceFocusMode(mid.state, NOW + 5 * MIN)
    expect(again.state).toEqual(mid.state)
    expect(again.events).toEqual([])
  })
})

describe('flowtime', () => {
  it('earns a proportional break when the run is stopped manually', () => {
    const s = defaultFocusModeState('flowtime', 3, NOW)
    // 90 minutes elapsed → 20% = 18m earned (≥ the 5m floor)
    const stop = completeFocusRunEarly(s, NOW + 90 * MIN)
    expect(stop.earnedBreakMinutes).toBe(18)
    expect(stop.state.phase).toBe('break')
    expect(stop.state.phaseEndsAtMs).toBe(NOW + 90 * MIN + 18 * MIN)
    expect(stop.state.completedRuns).toBe(1)
  })

  it('floors the earned break at the configured minimum', () => {
    const s = defaultFocusModeState('flowtime', null, NOW)
    const stop = completeFocusRunEarly(s, NOW + 5 * MIN) // 5m × 20% = 1m → floor 5
    expect(stop.earnedBreakMinutes).toBe(5)
  })

  it('throws when stopped outside a focus phase', () => {
    const s = defaultFocusModeState('flowtime', null, NOW)
    const onBreak = completeFocusRunEarly(s, NOW + 30 * MIN).state
    expect(() => completeFocusRunEarly(onBreak, NOW + 40 * MIN)).toThrow(/focus phase/)
  })
})

describe('countdown', () => {
  it('starts a fixed block of the configured minutes', () => {
    const s = defaultFocusModeState('countdown', 2, NOW)
    expect(s.phaseEndsAtMs).toBe(NOW + 25 * MIN)
  })

  it('rolls into the minimum pause after the block', () => {
    const s = defaultFocusModeState('countdown', null, NOW)
    const step = advanceFocusMode(s, s.phaseEndsAtMs)
    expect(step.state.phase).toBe('break')
    // next focus restarts the countdown length
    const next = advanceFocusMode(step.state, step.state.phaseEndsAtMs)
    expect(next.state.phase).toBe('focus')
    expect(next.state.phaseEndsAtMs).toBe(step.state.phaseEndsAtMs + 25 * MIN)
  })
})

describe('countdownMinutesFor (S3-80)', () => {
  it('defaults to the task’s remaining estimate', () => {
    expect(
      countdownMinutesFor({ estimateMs: 60 * MIN, timeSpentOnDay: { d: 15 * MIN } }, 'd'),
    ).toBe(45)
  })

  it('floors at minMinutes and needs an estimate', () => {
    expect(countdownMinutesFor({ estimateMs: 2 * MIN, timeSpentOnDay: {} }, 'd')).toBe(5)
    expect(countdownMinutesFor({ estimateMs: null, timeSpentOnDay: {} }, 'd')).toBeNull()
    expect(
      countdownMinutesFor({ estimateMs: 60 * MIN, timeSpentOnDay: { d: 60 * MIN } }, 'd'),
    ).toBe(5)
  })
})

describe('cancelFocusMode', () => {
  it('resets runs and phases but keeps the strategy + binding', () => {
    let s = defaultFocusModeState('pomodoro', 9, NOW)
    s = advanceFocusMode(s, s.phaseEndsAtMs).state
    const cancelled = cancelFocusMode(s, NOW)
    expect(cancelled.completedRuns).toBe(0)
    expect(cancelled.phase).toBe('focus')
    expect(cancelled.strategy).toBe('pomodoro')
    expect(cancelled.taskId).toBe(9)
  })
})

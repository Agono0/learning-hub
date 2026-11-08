import { describe, expect, it } from 'vitest'
import {
  BREATHS_REQUIRED,
  BREATH_CYCLE_SECONDS,
  COUNTDOWN_SECONDS,
  GateError,
  createFrictionGate,
  createGate,
  computeLeakCount,
  finishTimeVisibility,
  phoneProtocolChecklist,
  POMODORO_PRESETS,
  tickGate,
  type FrictionGate,
  type GateAction,
} from '../src/focus'

function act(gate: FrictionGate, action: GateAction): FrictionGate {
  return tickGate(gate, action)
}

function runToReflection(opts?: {
  trigger?: 'break_focus' | 'relapse' | 'distraction'
}): FrictionGate {
  let gate = createFrictionGate(opts?.trigger ?? 'relapse')
  gate = act(gate, { type: 'begin_countdown' })
  for (let i = 0; i < COUNTDOWN_SECONDS; i++) gate = act(gate, { type: 'tick' })
  for (let i = 0; i < BREATHS_REQUIRED * BREATH_CYCLE_SECONDS; i++)
    gate = act(gate, { type: 'tick' })
  return gate
}

describe('friction gate — happy path', () => {
  it('starts idle and runs a session', () => {
    const gate = createGate()
    expect(gate.state.phase).toBe('idle')
    const running = act(gate, {
      type: 'start_session',
      plannedMinutes: 25,
      task: 'Linear algebra ch. 3',
      startedAt: '2026-11-04T09:00:00.000Z',
    })
    expect(running.state.phase).toBe('focus_running')
    expect(running.state.session?.plannedMinutes).toBe(25)
    expect(running.state.session?.task).toBe('Linear algebra ch. 3')
  })

  it('completes the full flow: running → armed → countdown → breathing → reflection → proceeded → resume', () => {
    let gate = createGate()
    gate = act(gate, {
      type: 'start_session',
      plannedMinutes: 50,
      startedAt: '2026-11-04T09:00:00.000Z',
    })
    gate = act(gate, { type: 'arm', trigger: 'break_focus' })
    expect(gate.state.phase).toBe('friction_armed')
    expect(gate.state.trigger).toBe('break_focus')

    // 10s countdown, tickable
    gate = act(gate, { type: 'begin_countdown' })
    expect(gate.state.phase).toBe('countdown')
    expect(gate.state.secondsLeft).toBe(COUNTDOWN_SECONDS)
    for (let i = 1; i <= COUNTDOWN_SECONDS; i++) {
      gate = act(gate, { type: 'tick' })
      if (i < COUNTDOWN_SECONDS) {
        expect(gate.state.phase).toBe('countdown')
        expect(gate.state.secondsLeft).toBe(COUNTDOWN_SECONDS - i)
      }
    }
    expect(gate.state.phase).toBe('breathing')
    expect(gate.state.breathNumber).toBe(1)

    // exactly 3 × 19s breath cycles (4-7-8)
    for (let i = 0; i < BREATHS_REQUIRED * BREATH_CYCLE_SECONDS; i++) {
      gate = act(gate, { type: 'tick' })
      if (i < BREATHS_REQUIRED * BREATH_CYCLE_SECONDS - 1) {
        expect(gate.state.phase).toBe('breathing')
      }
    }
    expect(gate.state.phase).toBe('reflection')

    // written reflection required to proceed
    expect(() => act(gate, { type: 'reflect', text: '   ' })).toThrow(GateError)
    gate = act(gate, { type: 'reflect', text: 'I will open the review queue and do 10 cards.' })
    expect(gate.state.phase).toBe('outcome')
    expect(gate.state.outcome).toBe('proceeded')
    expect(gate.state.reflection).toContain('10 cards')

    // resume returns to the running session; then completes back to idle
    gate = act(gate, { type: 'resume' })
    expect(gate.state.phase).toBe('focus_running')
    gate = act(gate, { type: 'complete_session' })
    expect(gate.state.phase).toBe('idle')
  })

  it('aborted outcome is terminal until reset', () => {
    let gate = runToReflection()
    gate = act(gate, { type: 'abort' })
    expect(gate.state.outcome).toBe('aborted')
    expect(() => act(gate, { type: 'resume' })).toThrow(GateError)
    gate = act(gate, { type: 'reset' })
    expect(gate.state.phase).toBe('idle')
  })

  it('createFrictionGate arms directly and disarm returns to running', () => {
    const gate = createFrictionGate('distraction')
    expect(gate.state.phase).toBe('friction_armed')
    expect(gate.state.trigger).toBe('distraction')
    const back = act(gate, { type: 'disarm' })
    expect(back.state.phase).toBe('focus_running')
    // first tick on an armed gate begins the countdown
    const ticked = act(createFrictionGate('relapse'), { type: 'tick' })
    expect(ticked.state.phase).toBe('countdown')
    expect(ticked.state.secondsLeft).toBe(COUNTDOWN_SECONDS)
  })

  it('counts down from armed via explicit begin_countdown only once', () => {
    let gate = createFrictionGate('break_focus')
    gate = act(gate, { type: 'begin_countdown' })
    expect(() => act(gate, { type: 'begin_countdown' })).toThrow(GateError)
  })

  it('is pure — the input gate is never mutated', () => {
    const gate = createGate()
    const next = act(gate, {
      type: 'start_session',
      plannedMinutes: 25,
      startedAt: '2026-11-04T09:00:00.000Z',
    })
    expect(gate.state.phase).toBe('idle')
    expect(next.state.phase).toBe('focus_running')
    expect(next.trail).toEqual(['idle', 'focus_running'])
  })

  it('records the phase trail for telemetry', () => {
    let gate = createFrictionGate('relapse')
    gate = act(gate, { type: 'begin_countdown' })
    for (let i = 0; i < COUNTDOWN_SECONDS + BREATHS_REQUIRED * BREATH_CYCLE_SECONDS; i++) {
      gate = act(gate, { type: 'tick' })
    }
    gate = act(gate, { type: 'reflect', text: 'do 3 cards' })
    expect(gate.trail).toEqual([
      'friction_armed',
      'countdown',
      'breathing',
      'reflection',
      'outcome',
    ])
  })
})

describe('friction gate — invalid transitions are rejected', () => {
  it('cannot proceed (reflect) without completing the countdown and breathing', () => {
    const armed = createFrictionGate('relapse')
    expect(() => act(armed, { type: 'reflect', text: 'just let me out' })).toThrow(GateError)
    const counting = act(armed, { type: 'begin_countdown' })
    expect(() => act(counting, { type: 'reflect', text: 'just let me out' })).toThrow(GateError)
    const counting2 = act(armed, { type: 'tick' })
    expect(() => act(counting2, { type: 'reflect', text: 'no' })).toThrow(GateError)
    // one tick short of full breathing → still not reflective
    const short = act(armed, { type: 'begin_countdown' })
    let gate = short
    for (let i = 0; i < COUNTDOWN_SECONDS - 1; i++) gate = act(gate, { type: 'tick' }) // stop at 1s left
    expect(() => act(gate, { type: 'reflect', text: 'no' })).toThrow(GateError)
    let almost = act(gate, { type: 'tick' })
    for (let i = 0; i < BREATHS_REQUIRED * BREATH_CYCLE_SECONDS - 1; i++)
      almost = act(almost, { type: 'tick' })
    expect(almost.state.phase).toBe('breathing')
    expect(() => act(almost, { type: 'reflect', text: 'no' })).toThrow(GateError)
  })

  it('cannot arm when not running, cannot start twice', () => {
    const idle = createGate()
    expect(() => act(idle, { type: 'arm', trigger: 'relapse' })).toThrow(GateError)
    expect(() => act(idle, { type: 'begin_countdown' })).toThrow(GateError)
    expect(() => act(idle, { type: 'tick' })).toThrow(GateError)
    const running = act(idle, {
      type: 'start_session',
      plannedMinutes: 10,
      startedAt: '2026-11-04T09:00:00.000Z',
    })
    expect(() =>
      act(running, {
        type: 'start_session',
        plannedMinutes: 20,
        startedAt: '2026-11-04T09:00:00.000Z',
      }),
    ).toThrow(GateError)
    expect(() => act(running, { type: 'reflect', text: 'hi' })).toThrow(GateError)
    expect(() => act(running, { type: 'abort' })).toThrow(GateError)
    expect(() => act(running, { type: 'resume' })).toThrow(GateError)
    expect(() => act(idle, { type: 'start_session', plannedMinutes: 0, startedAt: 'x' })).toThrow(
      GateError,
    )
  })

  it('cannot tick outside countdown/breathing, cannot disarm outside armed', () => {
    const reflection = runToReflection()
    expect(() => act(reflection, { type: 'tick' })).toThrow(GateError)
    expect(() => act(reflection, { type: 'disarm' })).toThrow(GateError)
    const running = act(createGate(), {
      type: 'start_session',
      plannedMinutes: 10,
      startedAt: '2026-11-04T09:00:00.000Z',
    })
    expect(() => act(running, { type: 'disarm' })).toThrow(GateError)
    expect(() => act(running, { type: 'begin_countdown' })).toThrow(GateError)
  })

  it('cannot complete a session that is not running', () => {
    const idle = createGate()
    expect(() => act(idle, { type: 'complete_session' })).toThrow(GateError)
  })
})

describe('focus helpers', () => {
  it('computeLeakCount counts transitions into hidden', () => {
    const events = [
      { hidden: true, at: 'a' },
      { hidden: false, at: 'b' },
      { hidden: true, at: 'c' },
      { hidden: false, at: 'd' },
      { hidden: true, at: 'e' },
    ]
    expect(computeLeakCount(events)).toBe(3)
    expect(computeLeakCount([])).toBe(0)
    expect(computeLeakCount([{ hidden: false }])).toBe(0)
  })

  it('POMODORO_PRESETS are 25/5, 50/10, 90/20', () => {
    expect(POMODORO_PRESETS.map((p) => `${p.focus}/${p.breakMinutes}`)).toEqual([
      '25/5',
      '50/10',
      '90/20',
    ])
  })

  it('finishTimeVisibility shows the endpoint time', () => {
    // local clock: build a local Date at 14:00
    const now = new Date(2026, 10, 4, 14, 0, 0)
    const line = finishTimeVisibility(now, 25)
    expect(line).toMatch(/^start now → done by 14:25$/)
    expect(finishTimeVisibility(new Date(2026, 10, 4, 9, 50, 0), 30)).toContain('done by 10:20')
  })

  it('phone protocol covers the Ward 2017 brain-drain protocol', () => {
    const ids = phoneProtocolChecklist.map((i) => i.id)
    expect(ids).toContain('phone_away')
    expect(ids).toContain('notifications_off')
    expect(ids).toContain('grayscale')
    expect(ids).toContain('water')
    expect(ids).toContain('one_task')
    expect(phoneProtocolChecklist.length).toBe(5)
  })
})

/**
 * Focus & addiction defense — the friction gate state machine.
 *
 * The mechanic: every attempt to break focus passes through a full-screen gate —
 * a 10-second countdown, three 4-7-8 breaths, then a written reflection
 * ("What will you do in the app? Write it."). Friction converts impulsive exits
 * into deliberate ones; published friction studies (e.g. NYT app-flow and
 * reCAPTCHA-style gates; Fogg's behavior model) show even seconds of added cost
 * cut unwanted exits dramatically (our reference target: ~57% reduction).
 *
 * The reducer is PURE: same gate + same action → same gate. The client drives it
 * with 1-second 'tick' actions; the server stores the outcome in friction_events.
 */
import type { FrictionTrigger } from './types'

// ─── Timing constants ───────────────────────────────────────────────────────

export const COUNTDOWN_SECONDS = 10
/** 4-7-8 breathing (Weil): inhale 4s, hold 7s, exhale 8s = 19s per cycle. */
export const BREATH_SECONDS = { inhale: 4, hold: 7, exhale: 8 } as const
/** Seconds in one 4-7-8 breath cycle (4 + 7 + 8 = 19). */
export const BREATH_CYCLE_SECONDS = BREATH_SECONDS.inhale + BREATH_SECONDS.hold + BREATH_SECONDS.exhale // 19
/** Breaths the user must complete before the reflection step unlocks. */
export const BREATHS_REQUIRED = 3
/** The reflection question the friction gate asks. */
export const FRICTION_PROMPT = 'What will you do in the app? Write it.'

// ─── State ──────────────────────────────────────────────────────────────────

export interface GateSession {
  plannedMinutes: number
  task?: string
  startedAt: string // ISO
}

/** Phases of the friction-gate state machine. */
export type GatePhase =
  | 'idle'
  | 'focus_running'
  | 'friction_armed'
  | 'countdown'
  | 'breathing'
  | 'reflection'
  | 'outcome'

/** How a friction attempt ends. */
export type GateOutcome = 'proceeded' | 'aborted'

/** Snapshot of the gate machine at a point in time (persisted client-side). */
export interface GateState {
  phase: GatePhase
  session?: GateSession
  trigger?: FrictionTrigger
  /** countdown seconds remaining (10 → 0) */
  secondsLeft?: number
  /** 1-based number of the breath currently in progress */
  breathNumber?: number
  /** seconds elapsed inside the current 19s breath cycle */
  cycleSecond?: number
  reflection?: string
  outcome?: GateOutcome
}

/** Gate machine value: current state plus the visited-phase trail. */
export interface FrictionGate {
  state: GateState
  /** visited phases, for debugging/telemetry (pure — grows on each transition) */
  trail: GatePhase[]
}

/** Thrown on any transition the machine does not allow. */
export class GateError extends Error {
  constructor(readonly phase: GatePhase, readonly action: string, detail?: string) {
    super(detail ?? `Action "${action}" is not allowed in phase "${phase}"`)
    this.name = 'GateError'
  }
}

/** All reducer inputs the friction gate accepts (client-driven events). */
export type GateAction =
  | { type: 'start_session'; plannedMinutes: number; task?: string; startedAt?: string }
  | { type: 'arm'; trigger: FrictionTrigger }
  | { type: 'disarm' }
  | { type: 'begin_countdown' }
  | { type: 'tick' }
  | { type: 'reflect'; text: string }
  | { type: 'abort' }
  | { type: 'resume' }
  | { type: 'complete_session' }
  | { type: 'reset' }

function trail(gate: FrictionGate, nextPhase: GatePhase, next: GateState): FrictionGate {
  const last = gate.trail[gate.trail.length - 1]
  // same-phase ticks (countdown/breathing decrements) don't duplicate entries
  return { state: next, trail: last === nextPhase ? gate.trail : [...gate.trail, nextPhase] }
}

/**
 * The full-screen friction gate: armed with a trigger, counting down.
 * Equivalent to createGate() → arm(trigger), for when the session is already
 * managed by the client and only the gate flow is needed.
 */
export function createFrictionGate(
  trigger: FrictionTrigger,
  opts?: { session?: GateSession; reflection?: string },
): FrictionGate {
  return {
    state: {
      phase: 'friction_armed',
      trigger,
      session: opts?.session,
      reflection: opts?.reflection,
    },
    trail: ['friction_armed'],
  }
}

/** Fresh machine in the idle phase. */
export function createGate(): FrictionGate {
  return { state: { phase: 'idle' }, trail: ['idle'] }
}

/**
 * Reducer. Invalid transitions throw GateError — the 10s countdown + 3 breaths
 * CANNOT be skipped: there is no action path from armed/countdown/breathing to
 * 'proceeded' other than the full sequence.
 */
export function tickGate(gate: FrictionGate, action: GateAction): FrictionGate {
  const s = gate.state
  switch (action.type) {
    // ── session lifecycle ────────────────────────────────────────────────
    case 'start_session': {
      if (s.phase !== 'idle') throw new GateError(s.phase, action.type)
      if (!(action.plannedMinutes > 0)) throw new GateError(s.phase, action.type, 'plannedMinutes must be > 0')
      return trail(gate, 'focus_running', {
        phase: 'focus_running',
        session: {
          plannedMinutes: Math.round(action.plannedMinutes),
          task: action.task,
          startedAt: action.startedAt ?? new Date().toISOString(),
        },
      })
    }
    case 'complete_session': {
      if (s.phase !== 'focus_running') throw new GateError(s.phase, action.type)
      return trail(gate, 'idle', { phase: 'idle' })
    }

    // ── arming the gate ──────────────────────────────────────────────────
    case 'arm': {
      if (s.phase !== 'focus_running') throw new GateError(s.phase, action.type)
      return trail(gate, 'friction_armed', {
        phase: 'friction_armed',
        session: s.session,
        trigger: action.trigger,
        reflection: s.reflection,
      })
    }
    case 'disarm': {
      if (s.phase !== 'friction_armed') throw new GateError(s.phase, action.type)
      return trail(gate, 'focus_running', {
        phase: 'focus_running',
        session: s.session,
        reflection: s.reflection,
      })
    }

    // ── countdown (10s, tickable) ────────────────────────────────────────
    case 'begin_countdown': {
      if (s.phase !== 'friction_armed') throw new GateError(s.phase, action.type)
      return trail(gate, 'countdown', {
        phase: 'countdown',
        session: s.session,
        trigger: s.trigger,
        reflection: s.reflection,
        secondsLeft: COUNTDOWN_SECONDS,
      })
    }
    case 'tick': {
      if (s.phase === 'friction_armed') {
        // convenience: first tick starts the countdown
        return tickGate(gate, { type: 'begin_countdown' })
      }
      if (s.phase === 'countdown') {
        const left = (s.secondsLeft ?? 0) - 1
        if (left > 0) {
          return trail(gate, 'countdown', { ...s, secondsLeft: left })
        }
        return trail(gate, 'breathing', {
          phase: 'breathing',
          session: s.session,
          trigger: s.trigger,
          reflection: s.reflection,
          breathNumber: 1,
          cycleSecond: 0,
        })
      }
      if (s.phase === 'breathing') return tickBreath(gate)
      throw new GateError(s.phase, action.type)
    }

    // ── reflection & outcome ─────────────────────────────────────────────
    case 'reflect': {
      if (s.phase !== 'reflection') throw new GateError(s.phase, action.type)
      const text = action.text.trim()
      if (text.length === 0) {
        throw new GateError(s.phase, action.type, 'The reflection must be written before proceeding.')
      }
      return trail(gate, 'outcome', {
        phase: 'outcome',
        session: s.session,
        trigger: s.trigger,
        reflection: s.reflection === undefined ? text : `${s.reflection}\n${text}`,
        outcome: 'proceeded',
      })
    }
    case 'abort': {
      if (s.phase !== 'reflection') throw new GateError(s.phase, action.type)
      return trail(gate, 'outcome', {
        phase: 'outcome',
        session: s.session,
        trigger: s.trigger,
        reflection: s.reflection,
        outcome: 'aborted',
      })
    }
    case 'resume': {
      if (s.phase !== 'outcome' || s.outcome !== 'proceeded') throw new GateError(s.phase, action.type)
      return trail(gate, 'focus_running', {
        phase: 'focus_running',
        session: s.session,
        reflection: s.reflection,
      })
    }

    // ── escape hatch ─────────────────────────────────────────────────────
    case 'reset': {
      return { state: { phase: 'idle' }, trail: [...gate.trail, 'idle'] }
    }

    default: {
      const exhaustive: never = action
      throw new GateError(s.phase, String((exhaustive as { type: string }).type))
    }
  }
}

/** Advance the 4-7-8 cycle by one second; after BREATHS_REQUIRED cycles → reflection. */
function tickBreath(gate: FrictionGate): FrictionGate {
  const s = gate.state
  if (s.phase !== 'breathing' || s.breathNumber == null || s.cycleSecond == null) {
    throw new GateError(s.phase, 'tick')
  }
  const nextSecond = s.cycleSecond + 1
  if (nextSecond < BREATH_CYCLE_SECONDS) {
    return trail(gate, 'breathing', { ...s, cycleSecond: nextSecond })
  }
  if (s.breathNumber < BREATHS_REQUIRED) {
    return trail(gate, 'breathing', { ...s, breathNumber: s.breathNumber + 1, cycleSecond: 0 })
  }
  return trail(gate, 'reflection', {
    phase: 'reflection',
    session: s.session,
    trigger: s.trigger,
    reflection: s.reflection,
  })
}

// ─── Leak counting (Page Visibility API) ────────────────────────────────────

export interface VisibilityEvent {
  /** document.hidden at the moment of a visibilitychange */
  hidden: boolean
  at?: string // ISO timestamp (optional; not needed for counting)
}

/** A "leak" is every transition INTO hidden — the user left the tab. */
export function computeLeakCount(events: VisibilityEvent[]): number {
  return events.filter((e) => e.hidden).length
}

// ─── Pomodoro presets ───────────────────────────────────────────────────────

export interface PomodoroPreset {
  id: string
  label: string
  focus: number // minutes
  breakMinutes: number
}

/** Built-in focus/break presets (classic, deep, ultradian). */
export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: 'classic', label: 'Classic', focus: 25, breakMinutes: 5 },
  { id: 'deep', label: 'Deep', focus: 50, breakMinutes: 10 },
  { id: 'ultradian', label: 'Ultradian', focus: 90, breakMinutes: 20 },
]

// ─── Finish-time visibility (Llama Life pattern) ────────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** "start now → done by 14:35" — showing the endpoint makes starting cheaper. */
export function finishTimeVisibility(now: Date, minutes: number): string {
  const done = new Date(now.getTime() + Math.max(0, Math.round(minutes)) * 60_000)
  return `start now → done by ${pad2(done.getHours())}:${pad2(done.getMinutes())}`
}

// ─── Phone protocol (Ward et al. 2017 — "Brain Drain") ──────────────────────

export interface PhoneProtocolItem {
  id: string
  label: string
}

/** Mere presence of your own smartphone reduces available cognitive capacity —
 * the pre-session checklist neutralizes it. */
export const PHONE_PROTOCOL_SOURCE =
  'Ward, Duke, Gneezy & Bos (2017): "Brain Drain" — JACR'

/** Pre-session phone-neutralizing checklist (Ward et al. 2017). */
export const phoneProtocolChecklist: PhoneProtocolItem[] = [
  { id: 'phone_away', label: 'Phone in another room (not just face-down)' },
  { id: 'notifications_off', label: 'Notifications off on every visible device' },
  { id: 'grayscale', label: 'Screen grayscale to kill the color pull' },
  { id: 'water', label: 'Water within reach — hydration breaks stay seated' },
  { id: 'one_task', label: 'One task on the desk; everything else closed' },
]

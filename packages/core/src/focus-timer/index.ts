/**
 * Learning HUB — Global focus timer engine (pure, runtime-neutral).
 *
 * A wall-clock pomodoro engine that survives reloads, backgrounding and OS
 * sleep. Time is derived from absolute `endsAt` instants — never from
 * accumulated 1-second ticks — so remaining time is always recomputable from
 * the persisted state (`remainingSeconds(state, now)`), which is what makes
 * the timer visible on the home page and in the nav chip *everywhere*, not
 * just on the page that started it.
 *
 * Cycle structure (Cirillo 1988, with drift-free wall-clock execution):
 * focus (plannedMinutes) → short break → focus → … → long break after every
 * `cyclesPerLongBreak` completed focus blocks. `autoBreak` controls whether
 * the break starts on its own; with autoBreak off the engine parks in
 * `awaiting_break` so the user chooses to continue (calm by default).
 *
 * The engine NEVER talks to the OS or the network. Completion events are
 * derived by {@link advance}; the caller (web provider) turns `focus_complete`
 * / `break_complete` events into session PATCHes and user-managed
 * notifications through the Notification Center gate.
 */

import { z } from 'zod'

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export const TIMER_PHASES = ['idle', 'focusing', 'breaking', 'paused', 'awaiting_break'] as const

export type TimerPhase = (typeof TIMER_PHASES)[number]

/**
 * Engine state. All instants are ISO strings (persistable), `endsAt` is the
 * wall-clock deadline of the RUNNING phase (ignored while paused/idle).
 * `serverSessionId` links the running focus block to its `focus_sessions`
 * row so completion flows through the one canonical grading/XP path.
 */
export interface FocusTimerState {
  phase: TimerPhase
  /** Focus blocks completed since the last long break / cancel (1-based when focusing). */
  cycle: number
  plannedMinutes: number
  /** Wall-clock deadline of the running phase (ISO). */
  endsAt: string
  /** While paused: seconds remaining when the pause began. */
  pausedRemainingSeconds: number | null
  /** While paused: was the paused phase a break? (resume returns to it) */
  pausedPhaseWasBreak: boolean
  startedAt: string
  breakMinutes: number
  longBreakMinutes: number
  cyclesPerLongBreak: number
  autoBreak: boolean
  type: 'pomodoro' | 'deep' | 'custom'
  task: string | null
  serverSessionId: number | null
}

/** Events derived by {@link advance} (idempotent per phase transition). */
export const TIMER_EVENTS = ['focus_complete', 'break_complete'] as const

export type TimerEvent = (typeof TIMER_EVENTS)[number]

/* ------------------------------------------------------------------ */
/* Config + persistence schemas                                        */
/* ------------------------------------------------------------------ */

export const timerStartConfigSchema = z.object({
  plannedMinutes: z.number().int().min(1).max(180),
  breakMinutes: z.number().int().min(1).max(30).default(5),
  longBreakMinutes: z.number().int().min(5).max(45).default(15),
  cyclesPerLongBreak: z.number().int().min(2).max(8).default(4),
  autoBreak: z.boolean().default(true),
  type: z.enum(['pomodoro', 'deep', 'custom']).default('pomodoro'),
  task: z.string().max(200).nullable().default(null),
  serverSessionId: z.number().int().nullable().default(null),
})

export type TimerStartConfig = z.infer<typeof timerStartConfigSchema>

/** Caller-facing input: only `plannedMinutes` is required; defaults fill the rest. */
export type TimerStartConfigInput = z.input<typeof timerStartConfigSchema>

const stateSchema = z.object({
  phase: z.enum(TIMER_PHASES),
  cycle: z.number().int().min(0),
  plannedMinutes: z.number().min(1).max(180),
  endsAt: z.string(),
  pausedRemainingSeconds: z.number().nullable(),
  pausedPhaseWasBreak: z.boolean(),
  startedAt: z.string(),
  breakMinutes: z.number().min(1).max(30),
  longBreakMinutes: z.number().min(5).max(45),
  cyclesPerLongBreak: z.number().int().min(2).max(8),
  autoBreak: z.boolean(),
  type: z.enum(['pomodoro', 'deep', 'custom']),
  task: z.string().max(200).nullable(),
  serverSessionId: z.number().int().nullable(),
})

export const persistedTimerStateSchema = stateSchema

export type PersistedTimerState = z.infer<typeof persistedTimerStateSchema>

/** Parse persisted state; corrupt storage yields a clean idle engine. */
export function deserializeTimerState(raw: unknown): FocusTimerState | null {
  const parsed = stateSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data
}

export function serializeTimerState(state: FocusTimerState): PersistedTimerState {
  return state
}

/** Fresh idle state — the only place phases outside a run are minted. */
export function idleTimerState(): FocusTimerState {
  return {
    phase: 'idle',
    cycle: 0,
    plannedMinutes: 25,
    endsAt: '',
    pausedRemainingSeconds: null,
    pausedPhaseWasBreak: false,
    startedAt: '',
    breakMinutes: 5,
    longBreakMinutes: 15,
    cyclesPerLongBreak: 4,
    autoBreak: true,
    type: 'pomodoro',
    task: null,
    serverSessionId: null,
  }
}

/* ------------------------------------------------------------------ */
/* Pure actions                                                        */
/* ------------------------------------------------------------------ */

const toMs = (iso: string | Date): number =>
  (typeof iso === 'string' ? new Date(iso) : iso).getTime()

/** Start a focus block. Errors on an already-running timer (explicit, not silent). */
export function startFocus(
  state: FocusTimerState,
  config: TimerStartConfigInput,
  now: string | Date = new Date(),
): FocusTimerState {
  if (state.phase === 'focusing' || state.phase === 'breaking') {
    throw new Error('A timer is already running — pause or cancel it first')
  }
  const cfg = timerStartConfigSchema.parse(config)
  return {
    ...state,
    phase: 'focusing',
    cycle: state.phase === 'awaiting_break' ? state.cycle : Math.max(state.cycle, 0),
    plannedMinutes: cfg.plannedMinutes,
    endsAt: new Date(toMs(now) + cfg.plannedMinutes * 60_000).toISOString(),
    pausedRemainingSeconds: null,
    startedAt: new Date(toMs(now)).toISOString(),
    breakMinutes: cfg.breakMinutes,
    longBreakMinutes: cfg.longBreakMinutes,
    cyclesPerLongBreak: cfg.cyclesPerLongBreak,
    autoBreak: cfg.autoBreak,
    type: cfg.type,
    task: cfg.task,
    serverSessionId: cfg.serverSessionId,
  }
}

/** Pause: freeze remaining seconds; the deadline is recomputed on resume. */
export function pauseTimer(
  state: FocusTimerState,
  now: string | Date = new Date(),
): FocusTimerState {
  if (state.phase !== 'focusing' && state.phase !== 'breaking') return state
  return {
    ...state,
    phase: 'paused',
    pausedPhaseWasBreak: state.phase === 'breaking',
    pausedRemainingSeconds: Math.max(0, Math.round((toMs(state.endsAt) - toMs(now)) / 1000)),
  }
}

/** Resume from a pause with a fresh wall-clock deadline. */
export function resumeTimer(
  state: FocusTimerState,
  now: string | Date = new Date(),
): FocusTimerState {
  if (state.phase !== 'paused' || state.pausedRemainingSeconds === null) return state
  return {
    ...state,
    phase: state.pausedPhaseWasBreak ? 'breaking' : 'focusing',
    endsAt: new Date(toMs(now) + state.pausedRemainingSeconds * 1000).toISOString(),
    pausedRemainingSeconds: null,
    pausedPhaseWasBreak: false,
  }
}

/**
 * Begin the break after a completed focus block. Long break after every Nth
 * cycle. This is where `autoBreak=false` parks the engine instead, awaiting
 * the user's explicit continue.
 */
export function startBreak(
  state: FocusTimerState,
  now: string | Date = new Date(),
): FocusTimerState {
  if (state.phase !== 'awaiting_break') return state
  const long = state.cycle % state.cyclesPerLongBreak === 0
  const minutes = long ? state.longBreakMinutes : state.breakMinutes
  return {
    ...state,
    phase: 'breaking',
    endsAt: new Date(toMs(now) + minutes * 60_000).toISOString(),
    startedAt: new Date(toMs(now)).toISOString(),
    pausedPhaseWasBreak: false,
  }
}

/**
 * Cancel everything (no events emitted — the caller settles the server
 * session via its own cancel flow). Cycle count resets; a fresh start is a
 * fresh morning.
 */
export function cancelTimer(state: FocusTimerState): FocusTimerState {
  return {
    ...idleTimerState(),
    breakMinutes: state.breakMinutes,
    longBreakMinutes: state.longBreakMinutes,
    cyclesPerLongBreak: state.cyclesPerLongBreak,
    autoBreak: state.autoBreak,
  }
}

/* ------------------------------------------------------------------ */
/* Derivation — the heart of the engine                                */
/* ------------------------------------------------------------------ */

export interface TimerAdvance {
  state: FocusTimerState
  events: TimerEvent[]
}

/**
 * Advance the engine to `now`, emitting phase-transition events. Pure and
 * idempotent: calling twice with the same `now` yields events only on the
 * first state transition (afterwards the state is already past the phase).
 *
 * - focusing + past endsAt → `focus_complete`, cycle++, then either auto-start
 *   the break (autoBreak) or park in `awaiting_break`.
 * - breaking + past endsAt → `break_complete`, phase → idle (ready to focus).
 *
 * Missed completions (device asleep through several cycles) NEVER spam:
 * `advance` emits at most one `focus_complete` and one `break_complete` per
 * call. If the auto-started break's deadline has also elapsed, it completes
 * immediately and the engine lands idle — the user returns to a calm "ready
 * to focus" state, not a queue of 20 notifications.
 */
export function advance(state: FocusTimerState, now: string | Date = new Date()): TimerAdvance {
  const events: TimerEvent[] = []
  let next = state
  const nowMs = toMs(now)

  if (state.phase === 'focusing' && nowMs >= toMs(state.endsAt)) {
    events.push('focus_complete')
    const cycle = state.cycle + 1
    if (state.autoBreak) {
      const long = cycle % state.cyclesPerLongBreak === 0
      const minutes = long ? state.longBreakMinutes : state.breakMinutes
      const breakEndsAt = toMs(state.endsAt) + minutes * 60_000
      if (breakEndsAt <= nowMs) {
        // The break is already over too — settle quietly to idle.
        events.push('break_complete')
        next = { ...state, phase: 'idle', cycle, endsAt: '', pausedPhaseWasBreak: false }
      } else {
        next = {
          ...state,
          phase: 'breaking',
          cycle,
          endsAt: new Date(breakEndsAt).toISOString(),
          startedAt: new Date(toMs(state.endsAt)).toISOString(),
          pausedPhaseWasBreak: false,
        }
      }
    } else {
      next = { ...state, phase: 'awaiting_break', cycle, endsAt: '', pausedPhaseWasBreak: false }
    }
  } else if (state.phase === 'breaking' && nowMs >= toMs(state.endsAt)) {
    events.push('break_complete')
    next = { ...state, phase: 'idle', endsAt: '', pausedPhaseWasBreak: false }
  }

  return { state: next, events }
}

/** Seconds remaining in the running phase (0 when idle/paused-past). */
export function remainingSeconds(state: FocusTimerState, now: string | Date = new Date()): number {
  if (state.phase === 'paused' && state.pausedRemainingSeconds !== null)
    return state.pausedRemainingSeconds
  if (state.phase !== 'focusing' && state.phase !== 'breaking') return 0
  return Math.max(0, Math.round((toMs(state.endsAt) - toMs(now)) / 1000))
}

/** Planned seconds of the running phase (basis for progress). */
export function plannedSeconds(state: FocusTimerState): number {
  if (state.phase === 'breaking') {
    const long = state.cycle > 0 && state.cycle % state.cyclesPerLongBreak === 0
    return (long ? state.longBreakMinutes : state.breakMinutes) * 60
  }
  return state.plannedMinutes * 60
}

/** 0..1 elapsed fraction of the running phase (0 when idle — for rings/bars). */
export function progress01(state: FocusTimerState, now: string | Date = new Date()): number {
  if (state.phase !== 'focusing' && state.phase !== 'breaking' && state.phase !== 'paused') return 0
  const total = plannedSeconds(state)
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, 1 - remainingSeconds(state, now) / total))
}

/** Is a focus block (not a break) running or paused? */
export function isFocusing(state: FocusTimerState): boolean {
  if (state.phase === 'focusing') return true
  return state.phase === 'paused' && !state.pausedPhaseWasBreak
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** mm:ss clock (zero-padded, tabular-nums friendly). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** Human phase label for chips/widgets: "Focus 3", "Break", "Paused". */
export function describePhase(state: FocusTimerState): string {
  switch (state.phase) {
    case 'focusing':
      return `Focus ${state.cycle + 1}`
    case 'breaking':
      return state.cycle > 0 && state.cycle % state.cyclesPerLongBreak === 0
        ? 'Long break'
        : 'Break'
    case 'paused':
      return 'Paused'
    case 'awaiting_break':
      return 'Break ready'
    default:
      return 'Idle'
  }
}

/** Notification channel for a timer event (feeds the Notification Center gate). */
export function channelForEvent(event: TimerEvent): 'focus_complete' | 'break_complete' {
  return event === 'focus_complete' ? 'focus_complete' : 'break_complete'
}

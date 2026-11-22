/**
 * Focus strategies (S3-32 / S3-80) — SP's Pomodoro / Flowtime / Countdown
 * modes as a pure state machine over the existing timer's wall-clock phase
 * model (`use-global-timer` owns the ticks; this module owns the RULES).
 *
 * - **pomodoro** — fixed focus blocks; every `longBreakEvery`-th focus run
 *   earns the long break.
 * - **flowtime** — no fixed focus end: the run ends when the user stops
 *   (`completeFocusRunEarly`), and the earned break = elapsed ×
 *   `breakRatio` (min `minBreakMinutes`).
 * - **countdown** — one fixed block; S3-80's default is the task's
 *   REMAINING estimate (`countdownMinutesFor`).
 *
 * The binding half (S3-34): the state carries `taskId` — the timer logs
 * ticks against that task with `source: 'focus'` while the mode runs; the
 * Max Focus path binds the same way (a Max session started from a task).
 *
 * Pure: `nowMs` injected; phases are wall-clock `phaseEndsAtMs` like the
 * focus-timer module (drift-free resume).
 */
import { z } from 'zod'

export const FOCUS_STRATEGIES = ['pomodoro', 'flowtime', 'countdown'] as const

/** The {@link FOCUS_STRATEGIES} union. */
export type FocusStrategy = (typeof FOCUS_STRATEGIES)[number]

/** Pomodoro cadence (SP defaults: 25/5, long 15 every 4). */
export const pomodoroConfigSchema = z.object({
  focusMinutes: z.number().int().min(5).max(120).default(25),
  breakMinutes: z.number().int().min(1).max(60).default(5),
  longBreakMinutes: z.number().int().min(5).max(60).default(15),
  longBreakEvery: z.number().int().min(2).max(10).default(4),
})

/** Flowtime earn rule: break = elapsed × ratio, floored at the minimum. */
export const flowtimeConfigSchema = z.object({
  /** Break as a percentage of the elapsed focus run (SP: ~20%). */
  breakRatioPercent: z.number().int().min(10).max(50).default(20),
  minBreakMinutes: z.number().int().min(1).max(30).default(5),
})

/** Countdown: one fixed block (S3-80 defaults it to the task's remainder). */
export const countdownConfigSchema = z.object({
  minutes: z.number().int().min(1).max(240).default(25),
})

/** The running-mode state (persisted by the timer glue, same as its own state). */
export const focusModeStateSchema = z.object({
  strategy: z.enum(FOCUS_STRATEGIES),
  pomodoro: pomodoroConfigSchema.default({}),
  flowtime: flowtimeConfigSchema.default({}),
  countdown: countdownConfigSchema.default({}),
  /** Current phase. */
  phase: z.enum(['focus', 'break']),
  /** Whether the current break is the long one (pomodoro). */
  longBreak: z.boolean().default(false),
  /** Wall-clock end of the current phase. */
  phaseEndsAtMs: z.number().int().positive(),
  /** Completed focus runs since the mode started. */
  completedRuns: z.number().int().nonnegative().default(0),
  /** The bound task (S3-34) — ticks log against it; null = untracked mode. */
  taskId: z.number().int().positive().nullable().default(null),
})

export type FocusModeState = z.infer<typeof focusModeStateSchema>

/** Events `advanceFocusMode` derives (idempotent per transition). */
export const FOCUS_MODE_EVENTS = ['phase_complete', 'long_break_start'] as const

export type FocusModeEvent = (typeof FOCUS_MODE_EVENTS)[number]

/** Strategy defaults for the picker. */
export function defaultFocusModeState(
  strategy: FocusStrategy,
  taskId: number | null,
  nowMs: number,
): FocusModeState {
  const base = focusModeStateSchema.parse({
    strategy,
    pomodoro: pomodoroConfigSchema.parse({}),
    flowtime: flowtimeConfigSchema.parse({}),
    countdown: countdownConfigSchema.parse({}),
    taskId,
    phase: 'focus',
    phaseEndsAtMs: nowMs,
    completedRuns: 0,
  })
  if (strategy === 'countdown') {
    return { ...base, phaseEndsAtMs: nowMs + base.countdown.minutes * 60_000 }
  }
  if (strategy === 'pomodoro') {
    return { ...base, phaseEndsAtMs: nowMs + base.pomodoro.focusMinutes * 60_000 }
  }
  // flowtime: the phase is open-ended — park the end far out; the user
  // completes it manually (`completeFocusRunEarly`).
  return { ...base, phaseEndsAtMs: nowMs + 24 * 60 * 60_000 }
}

/**
 * Reconcile the mode against now (the timer calls this on every tick —
 * same shape as the focus-timer's `advance`). When a phase completes, the
 * NEXT phase starts immediately with its wall-clock end set; the events
 * tell the glue to log/notify. Idempotent at the same instant.
 */
export function advanceFocusMode(
  state: FocusModeState,
  nowMs: number,
): { state: FocusModeState; events: FocusModeEvent[] } {
  const parsed = focusModeStateSchema.parse(state)
  const events: FocusModeEvent[] = []

  if (nowMs < parsed.phaseEndsAtMs) return { state: parsed, events }

  // A phase completed. Flowtime focus phases are user-completed, so an
  // auto-complete here only happens for their parked 24h end (treat as a
  // normal pomodoro-style rollover into a minimum break).
  if (parsed.phase === 'focus') {
    const runs = parsed.completedRuns + 1
    if (parsed.strategy === 'pomodoro') {
      const isLong = runs % parsed.pomodoro.longBreakEvery === 0
      const breakMinutes = isLong ? parsed.pomodoro.longBreakMinutes : parsed.pomodoro.breakMinutes
      events.push(
        ...(isLong
          ? (['phase_complete', 'long_break_start'] as const)
          : (['phase_complete'] as const)),
      )
      return {
        state: {
          ...parsed,
          phase: 'break',
          longBreak: isLong,
          completedRuns: runs,
          phaseEndsAtMs: parsed.phaseEndsAtMs + breakMinutes * 60_000,
        },
        events,
      }
    }
    // flowtime + countdown: after focus comes a short pause (a flowtime run
    // that reaches the parked end earns the minimum break — real flowtime
    // breaks are earned via `completeFocusRunEarly`).
    const breakMinutes = parsed.flowtime.minBreakMinutes
    return {
      state: {
        ...parsed,
        phase: 'break',
        longBreak: false,
        completedRuns: runs,
        phaseEndsAtMs: parsed.phaseEndsAtMs + breakMinutes * 60_000,
      },
      events: ['phase_complete'],
    }
  }

  // Break complete → the next focus run starts on the strategy's focus length.
  const focusMinutes =
    parsed.strategy === 'pomodoro'
      ? parsed.pomodoro.focusMinutes
      : parsed.strategy === 'countdown'
        ? parsed.countdown.minutes
        : 24 * 60 // flowtime is open-ended again
  return {
    state: {
      ...parsed,
      phase: 'focus',
      longBreak: false,
      phaseEndsAtMs: parsed.phaseEndsAtMs + focusMinutes * 60_000,
    },
    events,
  }
}

/**
 * Flowtime's manual stop (S3-32): the earned break = elapsed focus time ×
 * `breakRatioPercent`, floored at `minBreakMinutes`. Throws when there is
 * no elapsed run to earn from (called on the same ms as start).
 */
export function completeFocusRunEarly(
  state: FocusModeState,
  nowMs: number,
): { state: FocusModeState; earnedBreakMinutes: number } {
  const parsed = focusModeStateSchema.parse(state)
  if (parsed.phase !== 'focus') {
    throw new Error('completeFocusRunEarly is only valid during a focus phase.')
  }
  const elapsedMs = Math.max(0, nowMs - (parsed.phaseEndsAtMs - 24 * 60 * 60_000))
  const elapsedMinutes = Math.floor(elapsedMs / 60_000)
  const earned = Math.max(
    parsed.flowtime.minBreakMinutes,
    Math.floor((elapsedMinutes * parsed.flowtime.breakRatioPercent) / 100),
  )
  return {
    state: {
      ...parsed,
      phase: 'break',
      longBreak: false,
      completedRuns: parsed.completedRuns + 1,
      phaseEndsAtMs: nowMs + earned * 60_000,
    },
    earnedBreakMinutes: earned,
  }
}

/** Abandon the mode (timer cancelled): the state resets, nothing logged. */
export function cancelFocusMode(state: FocusModeState, nowMs: number): FocusModeState {
  return focusModeStateSchema.parse({
    strategy: state.strategy,
    pomodoro: state.pomodoro,
    flowtime: state.flowtime,
    countdown: state.countdown,
    taskId: state.taskId,
    phase: 'focus',
    phaseEndsAtMs: nowMs,
    completedRuns: 0,
  })
}

/**
 * S3-80: the countdown default for a task — its REMAINING estimate
 * (estimate − tracked today), floored at `minMinutes`, null when the task
 * has no estimate (the picker then asks for a length).
 */
export function countdownMinutesFor(
  task: { estimateMs: number | null; timeSpentOnDay: Record<string, number> },
  today: string,
  minMinutes = 5,
): number | null {
  if (task.estimateMs === null) return null
  const spent = task.timeSpentOnDay[today] ?? 0
  const remainingMs = Math.max(0, task.estimateMs - spent)
  if (remainingMs === 0) return minMinutes
  return Math.max(minMinutes, Math.round(remainingMs / 60_000))
}

/**
 * Max Focus session state machine (pure, runtime-neutral).
 *
 * Extends the static early-exit gate ({@link exitGate} in `./index.ts`) with a
 * full session lifecycle: `locked → cooldown → can_confirm → ended`, an
 * absolute hard cap (locked Phase-1 decision: 4 hours), system-forced unlock
 * reasons, and monotonic-anchor vs wall-clock tamper detection.
 *
 * Why pure: callers (web handler, Rust bridge, Kotlin plugin) own the real
 * clocks and persistence; this module owns the *rules*. Every `advance`
 * carries BOTH a wall-clock reading and a monotonic reading so clock
 * manipulation is detectable — rolling the system clock back moves wall time
 * but not monotonic time, and the divergence trips the tamper gate.
 *
 * Clock sources per platform (callers MUST pass a sleep-inclusive monotonic
 * reading when available, so suspend does not false-positive):
 * - Web/webview: `performance.timeOrigin + performance.now()` vs `Date.now()`.
 * - Windows: `QueryUnbiasedInterruptTime` is sleep-exclusive; prefer
 *   `QueryInterruptTime` (sleep-inclusive) for the anchor.
 * - Android: `SystemClock.elapsedRealtime()` (sleep-inclusive).
 */

import { z } from 'zod'

/**
 * Reflection cooldown between exit request and confirmation, in seconds.
 * Single source of truth — `./index.ts` re-exports it and {@link exitGate}
 * consumes it, so the gate and this state machine can never drift apart.
 */
export const COOLDOWN_SECONDS = 60

/** Absolute session ceiling (locked Phase-1 decision): 4 hours, extendable up to. */
export const MAX_FOCUS_HARD_CAP_MINUTES = 240

/**
 * How far wall-clock elapsed may drift from monotonic elapsed before the
 * session is declared tampered. Generous enough for NTP slew and OS
 * accounting noise; a deliberate clock rollback/forward moves wall time by
 * minutes, far past this. Tamper classification and friction logging are
 * M2-20's job — this module only detects and ends.
 */
export const CLOCK_TAMPER_TOLERANCE_MS = 5_000

/** Session phases — `ExitGateState` plus an explicit terminal state. */
export type MaxSessionPhase = 'locked' | 'cooldown' | 'can_confirm' | 'ended'

/**
 * Reasons a session can end:
 * - `timer` — natural completion (planned end or hard cap).
 * - `pin` — user-confirmed early exit (cooldown elapsed + PIN verified).
 * - `battery` — battery dropped below the safety threshold (M2-19).
 * - `failure` — watchdog/heartbeat loss; the platform layer gave up (M2-23).
 * - `tamper` — monotonic anchor vs wall-clock mismatch (clock manipulation).
 */
export type SessionUnlockReason = 'timer' | 'pin' | 'battery' | 'failure' | 'tamper'

/** Events derived by {@link advanceSession} (idempotent per transition). */
export const SESSION_EVENTS = ['cooldown_elapsed', 'session_ended'] as const

export type SessionEvent = (typeof SESSION_EVENTS)[number]

/** One paired clock reading — wall clock and monotonic, captured together. */
export const sessionClockSchema = z.object({
  /** Wall-clock reading in epoch ms (`Date.now()`). */
  wallMs: z.number().finite().nonnegative(),
  /** Monotonic reading in ms since an arbitrary anchor (`performance.now()`-family). */
  monoMs: z.number().finite().nonnegative(),
})

export type SessionClock = z.infer<typeof sessionClockSchema>

/** Persisted session record — M2-03 maps this 1:1 onto `max_focus_sessions`. */
export const maxFocusSessionSchema = z
  .object({
    sessionId: z.string().min(1).max(100),
    /** Wall-clock ms at session start (epoch). */
    startedAtMs: z.number().finite().nonnegative(),
    /** Wall-clock deadline of the planned block (epoch ms). */
    plannedEndMs: z.number().finite().nonnegative(),
    /** Absolute ceiling: `startedAtMs + MAX_FOCUS_HARD_CAP_MINUTES * 60_000`. */
    hardCapAtMs: z.number().finite().nonnegative(),
    /** Monotonic reading captured at start — the tamper anchor. */
    monoAnchorMs: z.number().finite().nonnegative(),
    state: z.enum(['locked', 'cooldown', 'can_confirm', 'ended']),
    /** Wall-clock ms of the early-exit request (null while none pending). */
    exitRequestedAtMs: z.number().nullable(),
    /** Wall-clock ms the cooldown ends (null while none pending). */
    cooldownEndsAtMs: z.number().nullable(),
    /** Why the session ended (null while running). */
    unlockReason: z.enum(['timer', 'pin', 'battery', 'failure', 'tamper']).nullable(),
    /** Wall-clock ms the session reached `ended` (null while running). */
    endedAtMs: z.number().nullable(),
  })
  .refine((s) => s.plannedEndMs <= s.hardCapAtMs, {
    message: 'plannedEndMs must not exceed the hard cap',
  })

export type MaxFocusSession = z.infer<typeof maxFocusSessionSchema>

/** Start input — bounds mirror `maxFocusStartSchema` (10 min … hard cap). */
export const maxSessionStartSchema = z.object({
  sessionId: z.string().min(1).max(100),
  startedAtMs: z.number().finite().nonnegative(),
  minutes: z.number().int().min(10).max(MAX_FOCUS_HARD_CAP_MINUTES),
  monoAnchorMs: z.number().finite().nonnegative(),
})

export type MaxSessionStartInput = z.infer<typeof maxSessionStartSchema>

/** Extend input — extra minutes clamped by {@link MAX_FOCUS_HARD_CAP_MINUTES}. */
export const maxSessionExtendSchema = z.object({
  extraMinutes: z.number().int().min(1).max(MAX_FOCUS_HARD_CAP_MINUTES),
})

export type MaxSessionExtendInput = z.infer<typeof maxSessionExtendSchema>

/** Result of {@link advanceSession} — mirrors the focus-timer advance shape. */
export interface SessionAdvance {
  session: MaxFocusSession
  events: SessionEvent[]
}

/** Internal: terminal transition, shared by every unlock path. */
function endSession(
  session: MaxFocusSession,
  reason: SessionUnlockReason,
  wallMs: number,
): MaxFocusSession {
  return { ...session, state: 'ended', unlockReason: reason, endedAtMs: wallMs }
}

/**
 * Starts a Max Focus session in the `locked` state.
 *
 * `plannedEndMs` is derived from `minutes` (≤ hard cap by schema), so the
 * hard cap can never be exceeded at start; extensions are clamped in
 * {@link extendMaxSession}.
 */
export function startMaxFocusSession(input: MaxSessionStartInput): MaxFocusSession {
  const parsed = maxSessionStartSchema.parse(input)
  const hardCapAtMs = parsed.startedAtMs + MAX_FOCUS_HARD_CAP_MINUTES * 60_000
  return {
    sessionId: parsed.sessionId,
    startedAtMs: parsed.startedAtMs,
    plannedEndMs: parsed.startedAtMs + parsed.minutes * 60_000,
    hardCapAtMs,
    monoAnchorMs: parsed.monoAnchorMs,
    state: 'locked',
    exitRequestedAtMs: null,
    cooldownEndsAtMs: null,
    unlockReason: null,
    endedAtMs: null,
  }
}

/**
 * Reconciles the session against a paired clock reading. Idempotent:
 * repeated advances at the same instant produce no further events.
 *
 * Transition order (deliberate):
 * 1. tamper — clock divergence ends immediately, before any other rule,
 *    so a manipulated clock cannot also masquerade as a natural end;
 * 2. time end — planned end or hard cap, reason `timer` (even mid-cooldown);
 * 3. cooldown progression — `cooldown → can_confirm`.
 */
export function advanceSession(session: MaxFocusSession, clock: SessionClock): SessionAdvance {
  const { wallMs, monoMs } = sessionClockSchema.parse(clock)
  const events: SessionEvent[] = []

  if (session.state === 'ended') {
    return { session, events }
  }

  // 1. Monotonic anchor vs wall clock. Both deltas measure the same real
  //    interval from session start; a divergence past the tolerance means
  //    the wall clock was moved.
  const wallElapsed = wallMs - session.startedAtMs
  const monoElapsed = monoMs - session.monoAnchorMs
  if (Math.abs(wallElapsed - monoElapsed) > CLOCK_TAMPER_TOLERANCE_MS) {
    return { session: endSession(session, 'tamper', wallMs), events: ['session_ended'] }
  }

  // 2. Natural end — planned end and hard cap both fire reason `timer`
  //    (the record keeps hardCapAtMs so callers can tell them apart).
  if (wallMs >= session.plannedEndMs || wallMs >= session.hardCapAtMs) {
    return { session: endSession(session, 'timer', wallMs), events: ['session_ended'] }
  }

  // 3. Cooldown elapsed → the user may confirm (PIN + reflection) the exit.
  if (
    session.state === 'cooldown' &&
    session.cooldownEndsAtMs !== null &&
    wallMs >= session.cooldownEndsAtMs
  ) {
    events.push('cooldown_elapsed')
    return { session: { ...session, state: 'can_confirm' }, events }
  }

  return { session, events }
}

/**
 * Opens the early-exit flow: `locked → cooldown`.
 *
 * Anti-gaming rules baked in:
 * - re-requesting while in `cooldown` keeps the EARLIEST request — a
 *   re-request can never push the cooldown later;
 * - requesting while in `can_confirm` changes nothing (already past it);
 * - a request on an `ended` session is a no-op.
 */
export function requestSessionExit(session: MaxFocusSession, clock: SessionClock): MaxFocusSession {
  const { wallMs } = sessionClockSchema.parse(clock)
  if (session.state === 'ended') return session
  if (session.state !== 'locked') return session
  return {
    ...session,
    state: 'cooldown',
    exitRequestedAtMs: wallMs,
    cooldownEndsAtMs: wallMs + COOLDOWN_SECONDS * 1000,
  }
}

/**
 * Confirms the early exit: `can_confirm → ended` with reason `pin`.
 *
 * Requires BOTH the elapsed cooldown (state must be `can_confirm` — the
 * 60-second reflection is not bypassable, even with a verified PIN) and a
 * verified PIN (M2-02 vault; verification happens at the boundary, this
 * module only consumes the verdict). Any other state or an unverified PIN
 * returns the session unchanged.
 */
export function confirmSessionExit(
  session: MaxFocusSession,
  clock: SessionClock,
  args: { pinVerified: boolean },
): MaxFocusSession {
  const { wallMs } = sessionClockSchema.parse(clock)
  if (session.state !== 'can_confirm' || !args.pinVerified) return session
  return endSession(session, 'pin', wallMs)
}

/**
 * System-forced immediate unlock (battery threshold, watchdog failure).
 * Deliberately does NOT accept `pin` (must traverse the cooldown) or
 * `timer` (natural end belongs to {@link advanceSession}) — the union type
 * makes the invalid calls unrepresentable.
 */
export function forceUnlockSession(
  session: MaxFocusSession,
  clock: SessionClock,
  reason: 'battery' | 'failure' | 'tamper',
): MaxFocusSession {
  const { wallMs } = sessionClockSchema.parse(clock)
  if (session.state === 'ended') return session
  return endSession(session, reason, wallMs)
}

/**
 * Extends the planned end of a running session, clamped to the hard cap.
 * Allowed only while `locked` — extending mid-exit-flow or mid-cooldown
 * would let a session outrun its own reflection gate. Returns the session
 * unchanged when the state is not `locked` (the caller surfaces the error).
 */
export function extendMaxSession(
  session: MaxFocusSession,
  clock: SessionClock,
  input: MaxSessionExtendInput,
): MaxFocusSession {
  // Validate the paired clock for consistency with the other mutators; the
  // extension math itself keys off plannedEndMs, not the current instant.
  sessionClockSchema.parse(clock)
  const { extraMinutes } = maxSessionExtendSchema.parse(input)
  if (session.state !== 'locked') return session
  const proposed = session.plannedEndMs + extraMinutes * 60_000
  return {
    ...session,
    plannedEndMs: Math.min(proposed, session.hardCapAtMs),
  }
}

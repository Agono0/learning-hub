/**
 * Idle detection (S3-33) — the pure classify/subtract math behind the
 * platform idle readers (Rust `system_idle_ms` on Windows, the webview
 * visibility heuristic elsewhere).
 *
 * SP semantics: when the user returns after being away, the tracked task
 * should not silently absorb dead time. Three outcomes:
 * - under `ignoreMs` — jitter (a coffee sip, a lock screen flicker):
 *   keep tracking, never prompt;
 * - between `ignoreMs` and `discardMs` — **suggest a break** (real rest,
 *   but the task wasn't advanced — offer the classify dialog);
 * - at/over `discardMs` — **suggest discard**: whatever happened was not
 *   work on the task, so the gap is not tracked.
 *
 * During a Max Focus session the whole gate is SUPPRESSED (S3-34's other
 * half): the device is locked, idle is meaningless, and prompting would
 * fight the lock. `classifyIdle` returns `active` with a reason so callers
 * can be honest about why nothing was suggested.
 *
 * Pure: milliseconds in, decisions out. No clock reads.
 */
import { z } from 'zod'

/** The decision the classify dialog renders. */
export type IdleVerdict = 'active' | 'suggest-break' | 'suggest-discard'

/** Thresholds (SP-ish defaults: 2 min ignore, 10 min discard). */
export const idleThresholdsSchema = z.object({
  /** Idle shorter than this is jitter — never prompt (default 2 min). */
  ignoreMs: z
    .number()
    .int()
    .min(0)
    .default(2 * 60_000),
  /** Idle at/over this suggests discarding the gap (default 10 min). */
  discardMs: z
    .number()
    .int()
    .min(60_000)
    .default(10 * 60_000),
})

export type IdleThresholds = z.infer<typeof idleThresholdsSchema>

/** Why the gate did not prompt (for honest logs). */
export type IdleSuppressReason = 'max-focus' | null

/** The classify result: verdict + how much of the gap may be subtracted. */
export interface IdleClassification {
  verdict: IdleVerdict
  /** The idle span in ms (clamped to the discard threshold when discarded). */
  idleMs: number
  /** Subtractable ms: the full gap for discard, 0 otherwise. */
  subtractMs: number
  /** Suppression reason when the gate was bypassed (else null). */
  suppressedBy: IdleSuppressReason
}

/**
 * Classify an idle gap. Max Focus suppresses everything (returns
 * `active` with `suppressedBy: 'max-focus'` — S3-34's idle half).
 */
export function classifyIdle(
  idleMs: number,
  thresholds?: Partial<IdleThresholds>,
  opts: { maxFocusActive?: boolean } = {},
): IdleClassification {
  const t = idleThresholdsSchema.parse({ ignoreMs: 2 * 60_000, ...thresholds })
  const idle = Math.max(0, Math.floor(idleMs))

  if (opts.maxFocusActive === true) {
    return { verdict: 'active', idleMs: idle, subtractMs: 0, suppressedBy: 'max-focus' }
  }
  if (idle < t.ignoreMs) {
    return { verdict: 'active', idleMs: idle, subtractMs: 0, suppressedBy: null }
  }
  if (idle >= t.discardMs) {
    // The gap wasn't work: subtractable, capped at the threshold so a
    // forgotten-overnight session cannot wipe a whole day's log.
    return {
      verdict: 'suggest-discard',
      idleMs: idle,
      subtractMs: Math.min(idle, t.discardMs),
      suppressedBy: null,
    }
  }
  return { verdict: 'suggest-break', idleMs: idle, subtractMs: 0, suppressedBy: null }
}

/**
 * Apply the classification to a tracked-day figure: returns the tracked ms
 * AFTER the subtraction (never below zero). A break/suggest-break verdict
 * subtracts nothing — the user chose to keep the time or the dialog says so.
 */
export function applyIdleSubtraction(
  trackedMs: number,
  classification: IdleClassification,
  action: 'assign' | 'break' | 'discard',
): number {
  const subtract = action === 'discard' ? classification.subtractMs : 0
  return Math.max(0, trackedMs - subtract)
}

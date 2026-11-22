/**
 * Max Focus session resume (M2-24) — the persisted-session contract that
 * makes a reboot or a killed app "not an exit".
 *
 * Flow: when a Max Focus session starts, the web layer saves the machine's
 * session fields + allowlist device-locally (`resumeExpected: true`). After a
 * reboot (MaxFocusBootReceiver relaunches the app, M2-14) or a kill-and-relaunch,
 * `resumeMaxFocusSession` decides whether the session should re-apply:
 *
 * - Past `plannedEndMs` (or `hardCapAtMs`) → `null`, the session is over —
 *   the report card (M2-34) shows what happened instead.
 * - Still inside the window → a FRESH machine session for the REMAINING
 *   time: wall-clock deadlines are preserved exactly, and the monotonic
 *   anchor is re-based to NOW — after a reboot the monotonic clock restarted,
 *   so carrying the old anchor would trip the tamper gate (M2-20) instantly
 *   and falsely. Re-basing is the honest contract: pre-boot wall-clock
 *   manipulation is undetectable by monotonic means (documented in
 *   docs/LIMITATIONS.md), post-resume manipulation still is.
 *
 * Pure + runtime-neutral; the web layer owns the device-local persistence
 * (localStorage, same pattern as update settings) and the native re-apply
 * (`focus_session_apply` → lock windows + guards, M2-23).
 */
import { z } from 'zod'
import { sessionClockSchema, type MaxFocusSession, type SessionClock } from './session'

/**
 * The persisted session record (device-local JSON). Machine fields mirror
 * `MaxFocusSession` (M2-01); `allowedApps` is the ENFORCED allowlist
 * (emergency dialer merged in, M2-15); `resumeExpected` distinguishes "a
 * session is running" from "a session ended normally" — only true records
 * resume.
 */
export const persistedMaxFocusSessionSchema = z.object({
  sessionId: z.string().min(1).max(100),
  startedAtMs: z.number().finite().nonnegative(),
  plannedEndMs: z.number().finite().nonnegative(),
  hardCapAtMs: z.number().finite().nonnegative(),
  allowedApps: z.array(z.string().min(1)).max(200),
  savedAtMs: z.number().finite().nonnegative(),
  resumeExpected: z.literal(true),
})

/** The parsed {@link persistedMaxFocusSessionSchema} shape. */
export type PersistedMaxFocusSession = z.infer<typeof persistedMaxFocusSessionSchema>

/**
 * Decide + build the resumed session for the remaining window.
 *
 * Returns `null` when there is nothing to resume (window over, invalid
 * persisted record, or a record whose planned end exceeds its hard cap —
 * corrupt/tampered persistence fails CLOSED: no resume rather than a wrong
 * lock). The returned session is a valid M2-01 machine session anchored to
 * the CURRENT clock reading, ready for `advanceSession` and the native
 * re-apply.
 */
export function resumeMaxFocusSession(
  persisted: PersistedMaxFocusSession,
  clock: SessionClock,
): MaxFocusSession | null {
  const record = persistedMaxFocusSessionSchema.safeParse(persisted)
  if (!record.success) return null
  const { wallMs, monoMs } = sessionClockSchema.parse(clock)

  const data = record.data
  // Corrupt persistence must fail closed, never lock someone wrongly.
  if (data.plannedEndMs > data.hardCapAtMs) return null
  // Window over while the device was off/killed → session complete.
  if (wallMs >= data.plannedEndMs || wallMs >= data.hardCapAtMs) return null

  return {
    sessionId: data.sessionId,
    // The machine session restarts NOW: fresh monotonic anchor (see header),
    // original wall deadlines preserved — the user loses no locked time.
    startedAtMs: wallMs,
    plannedEndMs: data.plannedEndMs,
    hardCapAtMs: data.hardCapAtMs,
    monoAnchorMs: monoMs,
    state: 'locked',
    exitRequestedAtMs: null,
    cooldownEndsAtMs: null,
    unlockReason: null,
    endedAtMs: null,
  }
}

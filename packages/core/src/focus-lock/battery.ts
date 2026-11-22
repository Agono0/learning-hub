/**
 * Max Focus battery auto-unlock (M2-19) — the pure gate behind the native
 * battery monitors (Rust on Windows, the OS battery broadcast on Android).
 *
 * Safety over stubbornness: a device about to die must not burn its last
 * minutes on a locked screen — when the battery drops to the threshold on
 * battery power, the session force-unlocks with reason `battery` (an
 * {@link SessionUnlockReason} from the M2-01 machine — callers pass the
 * verdict to `forceUnlockSession(session, clock, 'battery')`, which logs the
 * exit). Charging devices NEVER unlock early: plugged-in sessions run to
 * their planned end or the hard cap (which `advanceSession` already enforces
 * via `hardCapAtMs`, reason `timer`).
 *
 * Pure + runtime-neutral (core rule): the native layers own the real readings
 * (Windows `GetSystemPowerStatus`, Android `ACTION_BATTERY_CHANGED`) and this
 * module owns the decision.
 */
import { z } from 'zod'

/**
 * Battery percentage at or below which a battery-powered session force-unlocks.
 * 15% ≈ "minutes left" on most hardware; deliberately generous to safety.
 */
export const DEFAULT_BATTERY_UNLOCK_THRESHOLD = 15

/** One battery reading from the native monitor (percent 0–100 + power state). */
export const batteryStatusSchema = z.object({
  /** Battery percentage, 0–100 (rounded by the native reader). */
  levelPct: z.number().int().min(0).max(100),
  /** True when the device is plugged in (AC or USB). */
  pluggedIn: z.boolean(),
})

/** The parsed {@link batteryStatusSchema} shape. */
export type BatteryStatus = z.infer<typeof batteryStatusSchema>

/**
 * The M2-19 decision: should the running session force-unlock on battery?
 *
 * True exactly when the device is NOT plugged in AND the level is at or below
 * `thresholdPct` (default {@link DEFAULT_BATTERY_UNLOCK_THRESHOLD}). Total and
 * defensive: junk readings (NaN, out-of-range, non-finite) return `false` —
 * a broken sensor must never end a session, and the monitors report raw
 * values through {@link batteryStatusSchema} before reaching this gate.
 */
export function shouldAutoUnlockBattery(
  levelPct: number,
  pluggedIn: boolean,
  thresholdPct: number = DEFAULT_BATTERY_UNLOCK_THRESHOLD,
): boolean {
  const parsed = batteryStatusSchema.safeParse({ levelPct, pluggedIn })
  if (!parsed.success) return false
  if (typeof thresholdPct !== 'number' || !Number.isFinite(thresholdPct) || thresholdPct < 0) {
    return false
  }
  return !pluggedIn && levelPct <= thresholdPct
}

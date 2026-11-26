/**
 * Query-string number parsing for route handlers.
 *
 * `Math.min(50, Math.max(1, Number(raw || 10)))` looks safe but is not: a
 * non-numeric value makes `Number()` return NaN, and `Math.max`/`Math.min`
 * propagate it. SQLite binds NaN as NULL and `LIMIT NULL` (like `LIMIT -1`)
 * means no limit, so `?limit=abc` returned every row. These helpers always
 * return a finite integer inside the given bounds.
 */

export interface IntParamOptions {
  /** Used when the value is missing, empty, not a finite number, or negative infinity/NaN. */
  fallback: number
  min: number
  max: number
}

/**
 * Parse a query value as an integer in [min, max]. Missing, blank, non-numeric
 * and non-finite values give `fallback`; fractions are floored; out-of-range
 * finite values are clamped (so `?limit=-5` becomes `min`, `?limit=9999` `max`).
 */
export function intParam(raw: string | null | undefined, opts: IntParamOptions): number {
  const { fallback, min, max } = opts
  if (raw === null || raw === undefined || raw.trim() === '') return clamp(fallback, min, max)
  const n = Number(raw)
  if (!Number.isFinite(n)) return clamp(fallback, min, max)
  return clamp(Math.floor(n), min, max)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

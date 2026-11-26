/**
 * Strict query-string readers for GET/DELETE handlers.
 *
 * `Number(param)` is unsafe on its own: `-1` is SQLite's "no limit", `NaN` binds as NULL,
 * `1.5` and `Infinity` pass a bare `!id` check, and an empty string becomes `0`. These
 * helpers never throw and never return a non-finite or out-of-range number.
 */
import { z } from 'zod'

export interface IntOptions {
  /** Returned when the parameter is missing, empty, non-numeric or not an integer. */
  fallback: number
  min: number
  max: number
}

/** Parse a raw string as a base-10 integer, or null. Rejects '', ' ', '1.5', '1e3', '0x10', 'Infinity'. */
export function parseIntStrict(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const s = raw.trim()
  if (!/^[+-]?\d{1,15}$/.test(s)) return null
  return Number(s)
}

/** Integer query param clamped into [min, max]; anything unparseable gives `fallback` (also clamped). */
export function queryInt(sp: URLSearchParams, name: string, opts: IntOptions): number {
  const { fallback, min, max } = opts
  const v = parseIntStrict(sp.get(name))
  const n = v ?? fallback
  return Math.min(max, Math.max(min, n))
}

/** Row-count limit: default `fallback`, clamped to [1, max]. `-1`, `NaN`, `''` and `0.5` never widen the page. */
export function queryLimit(
  sp: URLSearchParams,
  fallback: number,
  max: number,
  name = 'limit',
): number {
  return queryInt(sp, name, { fallback, min: 1, max })
}

/** Positive integer row id (1..Number.MAX_SAFE_INTEGER), or null when absent or malformed. */
export function queryId(sp: URLSearchParams, name: string): number | null {
  const v = parseIntStrict(sp.get(name))
  return v !== null && v > 0 && Number.isSafeInteger(v) ? v : null
}

/** Comma-separated positive integer ids, de-duplicated, capped at `max` entries; junk entries are dropped. */
export function queryIdList(sp: URLSearchParams, name: string, max = 100): number[] {
  const raw = sp.get(name)
  if (!raw) return []
  const out = new Set<number>()
  for (const part of raw.split(',')) {
    const v = parseIntStrict(part)
    if (v !== null && v > 0 && Number.isSafeInteger(v)) out.add(v)
    if (out.size >= max) break
  }
  return [...out]
}

/** True for a real calendar day `YYYY-MM-DD` (rejects 2026-02-30, 2026-13-01, 0000-00-00). */
export function isCalendarDay(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

/** zod schema for a real calendar day string; a bare regex lets 2026-99-99 through to `new Date().toISOString()` which throws. */
export const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDay, 'not a real calendar day')

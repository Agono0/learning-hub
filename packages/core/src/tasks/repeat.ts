/**
 * Tasks — repeat engine (S3-07): SP-parity recurring tasks.
 *
 * A {@link RepeatCfg} generates occurrence dates for a repeating task:
 * cycle `d|w|m|y` × interval × start (± end) date, minus skipped dates,
 * with SP's three re-anchor modes deciding WHERE the next occurrence
 * anchors after an interaction:
 *
 * - `scheduled`: always from the calendar schedule (every Nth day from
 *   startDate, no matter when you completed);
 * - `completion`: the next occurrence anchors from when you completed
 *   ("every 3 days" means 3 days after you actually did it);
 * - `postponed`: the next occurrence anchors from when you postponed.
 *
 * Date math is pure and clamped the way SP clamps: Jan 31 + 1 month = Feb
 * 28 (last valid day), Feb 29 + 1 year = Feb 28 in common years. Occurrences
 * that land on a skip date roll forward to the next non-skipped day.
 *
 * Pure functions only: `YYYY-MM-DD` strings in, `YYYY-MM-DD` strings out,
 * no clock reads (callers pass the anchor). `task_repeat_cfgs` (S3-01)
 * persists the config; S3-47 renders the dialog.
 */
import { z } from 'zod'
import { dayKeySchema } from './index'

/** SP repeat cycles. */
export const repeatCycleSchema = z.enum(['d', 'w', 'm', 'y'])

/** A repeat cycle. */
export type RepeatCycle = z.infer<typeof repeatCycleSchema>

/** SP's re-anchor modes (what the next occurrence anchors from). */
export const repeatReAnchorSchema = z.enum(['scheduled', 'completion', 'postponed'])

/** A re-anchor mode. */
export type RepeatReAnchor = z.infer<typeof repeatReAnchorSchema>

/**
 * The repeat config — mirrors `task_repeat_cfgs` (S3-01). `id: 0` means
 * "not persisted yet". `endDate` is inclusive; `skipDates` are `YYYY-MM-DD`
 * days the task should never surface on (it rolls to the next free day).
 */
export const repeatCfgSchema = z.object({
  /** Row id; `0` for unpersisted drafts. */
  id: z.number().int().nonnegative(),
  /** Display title for the config (SP shows named repeats). */
  title: z.string().max(200).nullable(),
  cycle: repeatCycleSchema,
  /** Every N cycles (1 = every cycle). */
  interval: z.number().int().min(1).max(999),
  /** First occurrence (`YYYY-MM-DD`). */
  startDate: dayKeySchema,
  /** Last occurrence (inclusive); null = repeats forever. */
  endDate: dayKeySchema.nullable(),
  /** Days to skip — the occurrence rolls forward to the next free day. */
  skipDates: z.array(dayKeySchema),
  reAnchor: repeatReAnchorSchema,
})

/** The parsed {@link repeatCfgSchema} shape. */
export type RepeatCfg = z.infer<typeof repeatCfgSchema>

/** Input for {@link createRepeatCfg} (title optional). */
export const createRepeatCfgInputSchema = repeatCfgSchema.omit({ id: true }).extend({
  title: z.string().max(200).nullable().optional(),
})

/** The parsed {@link createRepeatCfgInputSchema} shape. */
export type CreateRepeatCfgInput = z.infer<typeof createRepeatCfgInputSchema>

/** Validation result (habits.ts style). */
export interface RepeatValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

// ── Date math (pure, UTC-based, clamped) ────────────────────────────────────

const MS_PER_DAY = 86_400_000

function parseDay(day: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) throw new RangeError(`Not a YYYY-MM-DD day: ${day}`)
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

function formatDay(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Days in a month (1-based month). */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Absolute day number (UTC midnight) — cheap day arithmetic. */
function dayNumber(day: string): number {
  const { y, m, d } = parseDay(day)
  return Date.UTC(y, m - 1, d) / MS_PER_DAY
}

function fromDayNumber(n: number): string {
  const utc = new Date(Math.round(n) * MS_PER_DAY)
  return formatDay(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

/**
 * Add `interval` cycles to a day, clamping to the last valid day of the
 * month (SP parity: Jan 31 + 1 month → Feb 28; Feb 29 + 1 year → Feb 28).
 */
export function addCycle(day: string, cycle: RepeatCycle, interval: number): string {
  const { y, m, d } = parseDay(day)
  switch (cycle) {
    case 'd':
      return fromDayNumber(dayNumber(day) + interval)
    case 'w':
      return fromDayNumber(dayNumber(day) + interval * 7)
    case 'm': {
      const total = y * 12 + (m - 1) + interval
      const ny = Math.floor(total / 12)
      const nm = (total % 12) + 1
      return formatDay(ny, nm, Math.min(d, daysInMonth(ny, nm)))
    }
    case 'y': {
      const ny = y + interval
      return formatDay(ny, m, Math.min(d, daysInMonth(ny, m)))
    }
  }
}

/**
 * Where the next occurrence anchors from, per SP's re-anchor mode:
 * completion (or postponement) date when set, otherwise the scheduled
 * anchor itself.
 */
function anchorFor(
  cfg: RepeatCfg,
  scheduledAnchor: string,
  interactionDate?: string | null,
): string {
  if (cfg.reAnchor === 'completion' && interactionDate) return interactionDate
  if (cfg.reAnchor === 'postponed' && interactionDate) return interactionDate
  return scheduledAnchor
}

/**
 * Roll a candidate day forward while it is skipped (SP: a repeat never
 * surfaces on a skip date). Bounded by 366 steps so an absurd cfg (whole
 * year skipped) degrades instead of hanging.
 */
function rollPastSkips(day: string, skips: Set<string>): string {
  let current = day
  for (let i = 0; i < 366 && skips.has(current); i++) {
    current = fromDayNumber(dayNumber(current) + 1)
  }
  return current
}

// ── Creation / validation ───────────────────────────────────────────────────

/** Build a config from validated input (`id: 0` = draft). */
export function createRepeatCfg(input: CreateRepeatCfgInput): RepeatCfg {
  const v = createRepeatCfgInputSchema.parse(input)
  return { ...v, id: 0, title: v.title ?? null, skipDates: [...new Set(v.skipDates)].sort() }
}

/**
 * Domain rules: endDate must not precede startDate; skip dates outside the
 * [start, end] window are useless (warning); more than ~40% of a year
 * skipped would starve the schedule (warning); unknown extra skips are
 * tolerated (idempotent create dedupes).
 */
export function validateRepeatCfg(cfg: RepeatCfg): RepeatValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (cfg.endDate !== null && cfg.endDate < cfg.startDate) {
    errors.push('The repeat ends before it starts.')
  }
  const startN = dayNumber(cfg.startDate)
  const endN = cfg.endDate === null ? Infinity : dayNumber(cfg.endDate)
  const outside = cfg.skipDates.filter((d) => dayNumber(d) < startN || dayNumber(d) > endN)
  if (outside.length > 0) {
    warnings.push(`${outside.length} skip date(s) fall outside the repeat window.`)
  }
  const yearSpan = Math.max(1, Math.round((endN - startN) / 365))
  if (cfg.skipDates.length > yearSpan * 183) {
    warnings.push('More than half the repeat window is skipped — check the skip list.')
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ── Occurrences ─────────────────────────────────────────────────────────────

/**
 * The next due day AFTER a given interaction/anchor, honoring the re-anchor
 * mode and skip dates.
 *
 * - `interactionDate` = the completion / postponement day (`null` for pure
 *   schedule math). `nextDueAfter(cfg, anchor, null)` is the "it rolled over
 *   at midnight" path; `nextDueAfter(cfg, anchor, completedOn)` is the
 *   completion path.
 * - The result is the first candidate ≥ the anchor that is not skipped;
 *   a candidate that rolls past skips still has to stay within `endDate`
 *   (the repeat is dead after its end, rolled or not — SP parity).
 *
 * Returns `null` when the repeat has ended.
 */
export function nextDueAfter(
  cfg: RepeatCfg,
  anchor: string,
  interactionDate?: string | null,
): string | null {
  const endN = cfg.endDate === null ? Infinity : dayNumber(cfg.endDate)
  const from = anchorFor(cfg, anchor, interactionDate)
  const candidate = addCycle(from, cfg.cycle, cfg.interval)
  if (dayNumber(candidate) > endN) return null
  const rolled = rollPastSkips(candidate, new Set(cfg.skipDates))
  if (dayNumber(rolled) > endN) return null
  return rolled
}

/**
 * Project the next `count` occurrence days starting from `startAfter`
 * (exclusive), honoring skips and endDate. Completion-driven cadences
 * (reAnchor `completion`) are approximated on the SCHEDULE here — callers
 * simulating completion-driven repeats should chain {@link nextDueAfter}
 * with interaction dates instead (see the tests).
 */
export function projectOccurrences(cfg: RepeatCfg, startAfter: string, count: number): string[] {
  const out: string[] = []
  let cursor = startAfter
  const endN = cfg.endDate === null ? Infinity : dayNumber(cfg.endDate)
  const skips = new Set(cfg.skipDates)

  for (let i = 0; i < count; i++) {
    const candidate = addCycle(cursor, cfg.cycle, cfg.interval)
    if (dayNumber(candidate) > endN) break
    const rolled = rollPastSkips(candidate, skips)
    if (dayNumber(rolled) > endN) break
    out.push(rolled)
    cursor = rolled
  }
  return out
}

/**
 * True when `day` is an occurrence day of the schedule (interval-aligned
 * from startDate, skipping forward over skip dates). Used to re-attach
 * inherited tasks to their schedule (S3-49's Today sync).
 */
export function isOccurrenceOn(cfg: RepeatCfg, day: string): boolean {
  if (dayNumber(day) < dayNumber(cfg.startDate)) return false
  if (cfg.endDate !== null && dayNumber(day) > dayNumber(cfg.endDate)) return false

  // Walk the schedule from startDate until we pass `day`; a candidate that
  // rolled over skips may surface ON `day`.
  let cursor = cfg.startDate
  for (let i = 0; i < 9999; i++) {
    if (dayNumber(cursor) > dayNumber(day)) return false
    const rolled = rollPastSkips(cursor, new Set(cfg.skipDates))
    if (rolled === day) return true
    if (dayNumber(rolled) > dayNumber(day)) return false
    cursor = addCycle(cursor, cfg.cycle, cfg.interval)
  }
  return false
}

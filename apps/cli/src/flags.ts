/**
 * Numeric CLI flag parsing.
 *
 * `Number('abc')` is NaN and `Number('')` is 0, and both flow straight into SQL `LIMIT` (NaN binds
 * as NULL, -1 means "no limit") and into scoring engines that then print NaN. `numFlag` accepts a
 * finite number only and otherwise throws a {@link FlagError} with a one-line message.
 */

export class FlagError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlagError'
  }
}

export interface NumFlagOptions {
  /** Reject fractions. */
  int?: boolean
  min?: number
  max?: number
}

/**
 * Parse the raw value of `--name <value>`. `undefined` (flag absent) and the empty string give
 * `fallback`. Anything that is not a finite number in range throws {@link FlagError}.
 */
export function numFlag(
  raw: string | undefined,
  name: string,
  fallback: number,
  opts: NumFlagOptions = {},
): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const text = raw.trim()
  const n = Number(text)
  const range =
    opts.min !== undefined && opts.max !== undefined
      ? ` between ${opts.min} and ${opts.max}`
      : opts.min !== undefined
        ? ` >= ${opts.min}`
        : opts.max !== undefined
          ? ` <= ${opts.max}`
          : ''
  const kind = opts.int ? 'an integer' : 'a number'
  const fail = () => new FlagError(`${name} must be ${kind}${range}, got "${raw}"`)
  if (!Number.isFinite(n) || /^0x|^[+-]?0b|^[+-]?0o/i.test(text)) throw fail()
  if (opts.int && !Number.isInteger(n)) throw fail()
  if (opts.min !== undefined && n < opts.min) throw fail()
  if (opts.max !== undefined && n > opts.max) throw fail()
  return n
}

/** Row-count flag: an integer in [1, max]. */
export function limitFlag(
  raw: string | undefined,
  fallback: number,
  max = 500,
  name = '--limit',
): number {
  return numFlag(raw, name, fallback, { int: true, min: 1, max })
}

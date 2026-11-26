/** Small, honest statistics: Wilson intervals, normalised entropy, grouped success rates. */
import { CTX_DEFAULTS, clamp01, round3, type ReviewContext } from './cues'

export interface Rate {
  n: number
  successes: number
  /** null when n is below the display minimum. */
  rate: number | null
  low: number | null
  high: number | null
}

/** Wilson score interval for a proportion (95%). */
export function wilson(successes: number, n: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 }
  const z = 1.96
  const p = successes / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { low: clamp01((c - m) / d), high: clamp01((c + m) / d) }
}

export function rateOf(
  successes: number,
  n: number,
  minGroup: number = CTX_DEFAULTS.minGroup,
): Rate {
  if (n < minGroup) return { n, successes, rate: null, low: null, high: null }
  const w = wilson(successes, n)
  return { n, successes, rate: round3(successes / n), low: round3(w.low), high: round3(w.high) }
}

/** Shannon entropy of counts divided by its maximum, 0 (one value) to 1 (even). */
export function normalizedEntropy(counts: number[]): number {
  const positive = counts.filter((c) => c > 0)
  if (positive.length < 2) return 0
  const total = positive.reduce((s, c) => s + c, 0)
  let h = 0
  for (const c of positive) {
    const p = c / total
    h -= p * Math.log(p)
  }
  return round3(h / Math.log(positive.length))
}

export type Dimension = 'place' | 'bucket' | 'dayType' | 'noise'

const keyOf = (r: ReviewContext, d: Dimension): string =>
  d === 'noise' ? (r.noise ?? 'unlogged') : (r[d] as string)

export interface GroupRate extends Rate {
  key: string
}

/** Success rate for each value of one dimension, biggest group first. */
export function rateBy(rows: ReviewContext[], dim: Dimension, minGroup?: number): GroupRate[] {
  const m = new Map<string, { n: number; s: number }>()
  for (const r of rows) {
    const k = keyOf(r, dim)
    const cur = m.get(k) ?? { n: 0, s: 0 }
    cur.n += 1
    if (r.success) cur.s += 1
    m.set(k, cur)
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, ...rateOf(v.s, v.n, minGroup) }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
}

/** Joint context label used for diversity and transfer: place + time of day. */
export const contextLabel = (r: ReviewContext): string => `${r.place}|${r.bucket}`

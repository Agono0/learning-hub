/** Accuracy and speed by position in the session, corrected for card difficulty. */
import { FAT_DEFAULTS, median, round3, wilson, type PlacedReview } from './cues'

export interface Bin {
  /** First and last position in the bin (inclusive). */
  from: number
  to: number
  reviews: number
  /** Share of Good or Easy. Null when the bin has too few reviews. */
  rate: number | null
  low: number | null
  high: number | null
  /** Mean of (result minus the card's usual rate). Zero means as expected. */
  excess: number | null
  /** Median of time divided by the card's own median time. 1 means usual speed. */
  speed: number | null
}

export function positionCurve(
  rows: PlacedReview[],
  binSize: number = FAT_DEFAULTS.binSize,
  maxBins: number = FAT_DEFAULTS.maxBins,
  minBin: number = FAT_DEFAULTS.minBin,
): Bin[] {
  const bins = new Map<number, PlacedReview[]>()
  for (const r of rows) {
    const i = Math.min(maxBins - 1, Math.floor((r.position - 1) / binSize))
    const list = bins.get(i)
    if (list) list.push(r)
    else bins.set(i, [r])
  }
  const out: Bin[] = []
  for (const [i, list] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
    const n = list.length
    const s = list.filter((r) => r.success).length
    const w = wilson(s, n)
    const enough = n >= minBin
    out.push({
      from: i * binSize + 1,
      // The last bin collects every later position.
      to: i === maxBins - 1 ? Math.max(...list.map((r) => r.position)) : (i + 1) * binSize,
      reviews: n,
      rate: enough ? round3(s / n) : null,
      low: enough ? round3(w.low) : null,
      high: enough ? round3(w.high) : null,
      excess: enough ? round3(list.reduce((a, r) => a + r.residual, 0) / n) : null,
      speed: enough ? round3(median(list.map((r) => r.speed))) : null,
    })
  }
  return out
}

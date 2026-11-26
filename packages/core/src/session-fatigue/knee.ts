/**
 * Where does performance drop? Try every boundary between positions (every 5)
 * and take the one where reviews after it do worst compared with reviews
 * before it, measured on difficulty-corrected results.
 *
 * Picking the worst boundary and then testing it on the same data would find a
 * "drop" in pure noise. So the sessions are split in two halves, the boundary
 * is chosen on one half and the drop is measured on the other (and the other
 * way round). The reported drop and its 95% interval come only from those
 * held-out reviews. The interval resamples whole sessions, because reviews
 * inside one session are not independent. Observational: tired learners may
 * also choose harder material late in a session.
 */
import { FAT_DEFAULTS, mulberry32, round3, type PlacedReview } from './cues'

export interface Knee {
  /** Position after which accuracy drops (the last position of the "before" group). Null when no boundary qualifies. */
  at: number | null
  /** Mean excess before minus mean excess after, in accuracy points (0 to 1). Positive means worse later. */
  drop: number | null
  dropLow: number | null
  dropHigh: number | null
  before: number
  after: number
  verdict: 'fatigue' | 'steady' | 'inconclusive' | 'insufficient'
}

const BOOTSTRAP = 300
const BOUNDARY_STEP = 5
const MIN_SIDE = 30

interface Agg {
  n: number
  sum: number
}

/** Prefix sums of residuals by position, per session, so every boundary scores in O(1). */
function bySession(rows: PlacedReview[]): Map<number, PlacedReview[]> {
  const m = new Map<number, PlacedReview[]>()
  for (const r of rows) {
    const l = m.get(r.sessionId)
    if (l) l.push(r)
    else m.set(r.sessionId, [r])
  }
  return m
}

function bestBoundary(
  sessions: PlacedReview[][],
  maxPos: number,
): { at: number; drop: number; before: number; after: number } | null {
  const before: Agg[] = Array.from({ length: maxPos + 2 }, () => ({ n: 0, sum: 0 }))
  for (const s of sessions)
    for (const r of s) {
      const a = before[Math.min(r.position, maxPos + 1)]!
      a.n++
      a.sum += r.residual
    }
  let totN = 0
  let totS = 0
  for (const a of before) {
    totN += a.n
    totS += a.sum
  }
  let best: { at: number; drop: number; before: number; after: number } | null = null
  let n = 0
  let sum = 0
  for (let p = 1; p <= maxPos; p++) {
    n += before[p]!.n
    sum += before[p]!.sum
    if (p % BOUNDARY_STEP !== 0) continue
    const an = totN - n
    if (n < MIN_SIDE || an < MIN_SIDE) continue
    const drop = sum / n - (totS - sum) / an
    if (!best || drop > best.drop) best = { at: p, drop, before: n, after: an }
  }
  return best
}

/** Mean residual before and after a boundary, over a set of sessions. */
function dropAt(sessions: PlacedReview[][], at: number): number | null {
  let bn = 0
  let bs = 0
  let an = 0
  let as = 0
  for (const g of sessions)
    for (const r of g) {
      if (r.position <= at) {
        bn++
        bs += r.residual
      } else {
        an++
        as += r.residual
      }
    }
  return bn > 0 && an > 0 ? bs / bn - as / an : null
}

export function findKnee(
  rows: PlacedReview[],
  minSessions: number = FAT_DEFAULTS.minSessions,
): Knee {
  const groups = [...bySession(rows).entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])
  const empty: Knee = {
    at: null,
    drop: null,
    dropLow: null,
    dropHigh: null,
    before: 0,
    after: 0,
    verdict: 'insufficient',
  }
  if (groups.length < Math.max(minSessions, 6)) return empty
  const maxPos = Math.max(...rows.map((r) => r.position))
  const full = bestBoundary(groups, maxPos)
  if (!full) return empty
  const odd = groups.filter((_, i) => i % 2 === 0)
  const even = groups.filter((_, i) => i % 2 === 1)
  const atOdd = bestBoundary(odd, maxPos)
  const atEven = bestBoundary(even, maxPos)
  // Cross-fit: each half is tested at the boundary the other half chose.
  const folds: Array<{ test: PlacedReview[][]; at: number }> = []
  if (atOdd) folds.push({ test: even, at: atOdd.at })
  if (atEven) folds.push({ test: odd, at: atEven.at })
  if (folds.length === 0) return { ...empty, at: full.at, before: full.before, after: full.after }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const est = folds.map((f) => dropAt(f.test, f.at)).filter((d): d is number => d !== null)
  if (est.length === 0) return { ...empty, at: full.at, before: full.before, after: full.after }
  const drop = mean(est)
  const rand = mulberry32(0x7a11 + groups.length * 17 + rows.length)
  const draws: number[] = []
  for (let i = 0; i < BOOTSTRAP; i++) {
    const ds: number[] = []
    for (const f of folds) {
      const pick: PlacedReview[][] = []
      for (let k = 0; k < f.test.length; k++) pick.push(f.test[Math.floor(rand() * f.test.length)]!)
      const d = dropAt(pick, f.at)
      if (d !== null) ds.push(d)
    }
    if (ds.length > 0) draws.push(mean(ds))
  }
  draws.sort((x, y) => x - y)
  const q = (p: number) =>
    draws[Math.min(draws.length - 1, Math.max(0, Math.floor(p * draws.length)))] ?? drop
  const low = Math.min(q(0.025), drop)
  const high = Math.max(q(0.975), drop)
  return {
    at: full.at,
    drop: round3(drop),
    dropLow: round3(low),
    dropHigh: round3(high),
    before: full.before,
    after: full.after,
    verdict:
      low > FAT_DEFAULTS.dropThreshold
        ? 'fatigue'
        : high < FAT_DEFAULTS.dropThreshold
          ? 'steady'
          : 'inconclusive',
  }
}

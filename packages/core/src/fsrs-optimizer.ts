/**
 * Pure, runtime-neutral FSRS-6 parameter evaluation, personalization (MAP +
 * bounded Adam optimization), weight string/array parsing, and `Reschedule`
 * history replay.
 *
 * Works identically in Node (web/server/cli/mcp) and inside the Tauri webview
 * worker — zero I/O, zero Node builtins.
 *
 * Scientific grounding:
 * - Jarrett Ye (2022–2025), FSRS-6 21-parameter DSR memory model; evaluated on
 *   long-term recall transitions (`elapsedDays >= 1`) via binary cross-entropy
 *   (Log-Loss) and 10-bin calibration RMSE (awesome-fsrs benchmark standard).
 * - L2 shrinkage toward `FSRS6_DEFAULT_WEIGHTS` (`lambda / sqrt(N)`) acts as a
 *   Gaussian MAP prior so sparse rating buckets never overfit small decks.
 */
import { DefaultScheduler, type Rating } from 'ts-fsrs'
import {
  FSRS6Algorithm,
  FSRS6_DEFAULT_WEIGHTS,
  FSRS6_MODEL_BOUNDS,
  FSRS6_W17_W18_CEILING,
  checkFSRS6Parameters,
  clipFSRS6Parameters,
  migrateFSRS6Parameters,
} from 'ts-fsrs/models/fsrs-6'
import { Reschedule } from 'ts-fsrs/reschedule'
import { z } from 'zod'
import { fsrsToCardRow, type FsrsRowPatch } from './fsrs'
import type { Grade } from './types'

/** Minimum long-term review transitions (`elapsedDays >= 1`) required to fit personalized weights. */
export const MIN_OPTIMIZER_REVIEWS = 50

/** Default 21-element FSRS-6 parameter vector. */
export const DEFAULT_FSRS6_WEIGHTS: readonly number[] = FSRS6_DEFAULT_WEIGHTS
export { FSRS6_DEFAULT_WEIGHTS }

/** Exact 21-parameter FSRS-6 bounds matching `ts-fsrs` (`enableShortTerm = true`). */
export const FSRS6_WEIGHT_BOUNDS: readonly (readonly [number, number])[] = [
  [FSRS6_MODEL_BOUNDS.sMin, 100],
  [FSRS6_MODEL_BOUNDS.sMin, 100],
  [FSRS6_MODEL_BOUNDS.sMin, 100],
  [FSRS6_MODEL_BOUNDS.sMin, 100],
  [FSRS6_MODEL_BOUNDS.dMin, FSRS6_MODEL_BOUNDS.dMax],
  [0.001, 4],
  [0.001, 4],
  [0.001, 0.75],
  [0, 4.5],
  [0, 0.8],
  [0.001, 3.5],
  [0.001, 5],
  [0.001, 0.25],
  [0.001, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, FSRS6_W17_W18_CEILING],
  [0, FSRS6_W17_W18_CEILING],
  [0.01, 0.8],
  [0.1, 0.8],
]

/** Minimal revlog item required by the FSRS-6 evaluator, optimizer, and history replayer. */
export interface FsrsOptimizerRevlog {
  id?: number
  cardId: number
  rating: Grade | 1 | 2 | 3 | 4
  reviewedAt: string // ISO-8601
  elapsedDays?: number
}

/** Evaluation metrics for a 21-weight vector over a user's review history. */
export interface FsrsEvaluation {
  /** Binary cross-entropy over long-term transitions (`null` when 0 transitions). */
  logLoss: number | null
  /** Count-weighted 10-bin calibration RMSE in [0, 1] (`null` when 0 transitions). */
  rmse: number | null
  /** Alias for `rmse`. */
  rmseBins: number | null
  /** Total reviews passed in. */
  totalReviews: number
  /** Long-term transitions (`elapsedDays >= 1` after first review) scored. */
  sampleCount: number
  /** Alias for `sampleCount`. */
  evaluatedTransitions: number
  /** Distinct cards represented in the history. */
  cardCount: number
  /** Alias for `cardCount`. */
  cardsCount: number
  /** Evaluated 21-parameter vector. */
  weights: number[]
}

/** Result of running `optimizeFsrsWeights`. */
export interface FsrsOptimizationResult {
  status: 'optimized' | 'already_optimal' | 'insufficient_data'
  minRequired: number
  sampleCount: number
  baseline: FsrsEvaluation
  optimized: FsrsEvaluation
  /** Relative Log-Loss reduction in percent (>= 0). */
  improvementPct: number
  /** Resulting canonical 21-element FSRS-6 weight vector (rounded to 4 decimals). */
  weights: number[]
}

const DAY_MS = 86_400_000

/**
 * Parse, migrate (17/19 → 21), clip, and validate an FSRS-6 weight vector.
 * Accepts either a numeric array OR a comma/whitespace-separated string
 * (such as `[0.212, 1.2931, ...]` pasted straight from Anki).
 */
export function parseFsrsWeights(input: unknown): number[] {
  let raw: number[]
  if (typeof input === 'string') {
    const cleaned = input
      .trim()
      .replace(/^\[|\]$/g, '')
      .trim()
    if (!cleaned) throw new Error('FSRS weights string cannot be empty')
    const tokens = cleaned.split(/[\s,]+/).filter(Boolean)
    raw = tokens.map((t) => Number(t))
  } else if (Array.isArray(input)) {
    raw = input.map((v) => (typeof v === 'number' ? v : Number(v)))
  } else {
    throw new Error('FSRS weights must be an array of numbers or a comma-separated string')
  }

  if (![17, 19, 21].includes(raw.length)) {
    throw new Error(`Expected 17, 19, or 21 FSRS parameters, received ${raw.length}`)
  }
  if (raw.some((n) => !Number.isFinite(n))) {
    throw new Error('All FSRS weights must be finite numbers')
  }

  const migrated = migrateFSRS6Parameters(raw)
  const clipped = clipFSRS6Parameters(migrated, 1, true).map((n) => Math.round(n * 10000) / 10000)
  const reclipped = clipFSRS6Parameters(clipped, 1, true)
  checkFSRS6Parameters(reclipped, 1, true)
  return [...reclipped]
}

/** Zod boundary schema for optional custom FSRS-6 weights (array or Anki string). */
export const fsrsWeightsSchema = z
  .union([z.array(z.number()), z.string()])
  .transform((val, ctx) => {
    try {
      return parseFsrsWeights(val)
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Invalid FSRS-6 weights',
      })
      return z.NEVER
    }
  })

interface CardSequenceItem {
  rating: 1 | 2 | 3 | 4
  deltaDays: number
}

/** Pre-group revlog rows into per-card chronological `(rating, deltaDays)` sequences. */
function buildSequences(revlogs: readonly FsrsOptimizerRevlog[]): CardSequenceItem[][] {
  const byCard = new Map<
    number,
    { ts: number; id: number; rating: 1 | 2 | 3 | 4; elapsed?: number }[]
  >()
  for (const r of revlogs) {
    if (![1, 2, 3, 4].includes(r.rating)) continue
    const ts = Date.parse(r.reviewedAt)
    if (Number.isNaN(ts)) continue
    let arr = byCard.get(r.cardId)
    if (!arr) {
      arr = []
      byCard.set(r.cardId, arr)
    }
    arr.push({
      ts,
      id: r.id ?? ts,
      rating: r.rating as 1 | 2 | 3 | 4,
      elapsed: r.elapsedDays,
    })
  }

  const sequences: CardSequenceItem[][] = []
  for (const list of byCard.values()) {
    list.sort((a, b) => a.ts - b.ts || a.id - b.id)
    const seq: CardSequenceItem[] = []
    for (let i = 0; i < list.length; i++) {
      const item = list[i]!
      let deltaDays = 0
      if (i > 0) {
        const prev = list[i - 1]!
        const fromTs = Math.max(0, Math.round((item.ts - prev.ts) / DAY_MS))
        deltaDays =
          typeof item.elapsed === 'number' && Number.isFinite(item.elapsed) && item.elapsed >= 0
            ? Math.max(fromTs, Math.round(item.elapsed))
            : fromTs
      }
      seq.push({ rating: item.rating, deltaDays })
    }
    if (seq.length > 0) sequences.push(seq)
  }
  return sequences
}

/** Internal fast objective evaluator over pre-built card sequences. */
function scoreSequences(
  sequences: readonly CardSequenceItem[][],
  weights: readonly number[],
): { logLoss: number; rmseBins: number; evaluated: number } {
  const clipped = clipFSRS6Parameters([...weights], 1, true)
  const algo = new FSRS6Algorithm(clipped, true, FSRS6_MODEL_BOUNDS)

  let lossSum = 0
  let evaluated = 0
  const binPred = new Float64Array(10)
  const binObs = new Float64Array(10)
  const binCount = new Uint32Array(10)

  for (const seq of sequences) {
    let state: { stability: number; difficulty: number } | null = null
    for (let i = 0; i < seq.length; i++) {
      const step = seq[i]!
      if (i > 0 && state && state.stability > 0 && step.deltaDays >= 1) {
        const rawP = algo.forgetting_curve(step.deltaDays, state.stability)
        const p = Math.min(1 - 1e-6, Math.max(1e-6, Number.isFinite(rawP) ? rawP : 0.5))
        const y = step.rating > 1 ? 1 : 0
        lossSum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p))
        const bin = Math.min(9, Math.max(0, Math.floor(p * 10)))
        binPred[bin]! += p
        binObs[bin]! += y
        binCount[bin]! += 1
        evaluated += 1
      }
      state = algo.next_state(state, step.deltaDays, step.rating as Rating)
    }
  }

  if (evaluated === 0) {
    return { logLoss: 0, rmseBins: 0, evaluated: 0 }
  }

  let weightedSqErr = 0
  for (let b = 0; b < 10; b++) {
    const n = binCount[b]!
    if (n > 0) {
      const diff = binPred[b]! / n - binObs[b]! / n
      weightedSqErr += n * diff * diff
    }
  }

  return {
    logLoss: Math.round((lossSum / evaluated) * 100000) / 100000,
    rmseBins: Math.round(Math.sqrt(weightedSqErr / evaluated) * 100000) / 100000,
    evaluated,
  }
}

/**
 * Evaluate Log-Loss and 10-bin calibration RMSE of a 21-weight FSRS-6 vector
 * against a collection of `revlog` rows.
 */
export function evaluateFsrsWeights(
  revlogs: readonly FsrsOptimizerRevlog[],
  weights: readonly number[] = FSRS6_DEFAULT_WEIGHTS,
): FsrsEvaluation {
  const validWeights = parseFsrsWeights([...weights])
  const sequences = buildSequences(revlogs)
  const { logLoss, rmseBins, evaluated } = scoreSequences(sequences, validWeights)
  return {
    logLoss: evaluated > 0 ? logLoss : null,
    rmse: evaluated > 0 ? rmseBins : null,
    rmseBins: evaluated > 0 ? rmseBins : null,
    totalReviews: revlogs.length,
    sampleCount: evaluated,
    evaluatedTransitions: evaluated,
    cardCount: sequences.length,
    cardsCount: sequences.length,
    weights: validWeights,
  }
}

/**
 * Fit personalized 21-element FSRS-6 weights to a learner's `revlog` history
 * using bounded Adam gradient descent with Gaussian MAP shrinkage toward
 * `FSRS6_DEFAULT_WEIGHTS`.
 *
 * Invariant: never returns weights with worse Log-Loss than the default/initial
 * baseline, and requires at least `MIN_OPTIMIZER_REVIEWS` (50) long-term
 * transitions so small histories never overfit.
 */
export function optimizeFsrsWeights(
  revlogs: readonly FsrsOptimizerRevlog[],
  opts: { initialWeights?: readonly number[]; iterations?: number } = {},
): FsrsOptimizationResult {
  const startWeights = opts.initialWeights
    ? parseFsrsWeights([...opts.initialWeights])
    : [...FSRS6_DEFAULT_WEIGHTS]
  const sequences = buildSequences(revlogs)
  const defaultScore = scoreSequences(sequences, FSRS6_DEFAULT_WEIGHTS)
  const baseline: FsrsEvaluation = {
    logLoss: defaultScore.evaluated > 0 ? defaultScore.logLoss : null,
    rmse: defaultScore.evaluated > 0 ? defaultScore.rmseBins : null,
    rmseBins: defaultScore.evaluated > 0 ? defaultScore.rmseBins : null,
    totalReviews: revlogs.length,
    sampleCount: defaultScore.evaluated,
    evaluatedTransitions: defaultScore.evaluated,
    cardCount: sequences.length,
    cardsCount: sequences.length,
    weights: [...FSRS6_DEFAULT_WEIGHTS],
  }

  if (defaultScore.evaluated < MIN_OPTIMIZER_REVIEWS) {
    return {
      status: 'insufficient_data',
      minRequired: MIN_OPTIMIZER_REVIEWS,
      sampleCount: defaultScore.evaluated,
      baseline,
      optimized: baseline,
      improvementPct: 0,
      weights: [...FSRS6_DEFAULT_WEIGHTS],
    }
  }

  const bounds = FSRS6_WEIGHT_BOUNDS
  const prior = FSRS6_DEFAULT_WEIGHTS
  const priorStrength = 0.025 / Math.sqrt(defaultScore.evaluated)
  const iterations = Math.max(10, Math.min(80, opts.iterations ?? 40))

  // Objective with MAP L2 shrinkage normalized by parameter range
  const objective = (w: readonly number[]): number => {
    const { logLoss } = scoreSequences(sequences, w)
    let reg = 0
    for (let j = 0; j < 21; j++) {
      const span = Math.max(0.1, bounds[j]![1] - bounds[j]![0])
      const z = (w[j]! - prior[j]!) / span
      reg += z * z
    }
    return logLoss + priorStrength * reg
  }

  let current = clipFSRS6Parameters([...startWeights], 1, true)
  let bestWeights = [...FSRS6_DEFAULT_WEIGHTS]
  let bestRawLoss = defaultScore.logLoss

  const startRaw = scoreSequences(sequences, current)
  if (startRaw.logLoss < bestRawLoss) {
    bestRawLoss = startRaw.logLoss
    bestWeights = [...current]
  }

  const m = new Float64Array(21)
  const v = new Float64Array(21)
  const beta1 = 0.9
  const beta2 = 0.999
  const eps = 1e-8
  const baseLr = 0.035

  for (let iter = 1; iter <= iterations; iter++) {
    const grad = new Float64Array(21)
    for (let j = 0; j < 21; j++) {
      const [lo, hi] = bounds[j]!
      const h = Math.max(1e-4, (hi - lo) * 1e-3)
      const plus = [...current]
      const minus = [...current]
      plus[j] = Math.min(hi, current[j]! + h)
      minus[j] = Math.max(lo, current[j]! - h)
      const stepSpan = plus[j]! - minus[j]!
      if (stepSpan > 0) {
        grad[j] = (objective(plus) - objective(minus)) / stepSpan
      }
    }

    const lr = baseLr * (1 - (iter - 1) / (iterations * 1.25))
    const b1Corr = 1 - Math.pow(beta1, iter)
    const b2Corr = 1 - Math.pow(beta2, iter)
    const candidate = [...current]

    for (let j = 0; j < 21; j++) {
      const g = grad[j]!
      m[j] = beta1 * m[j]! + (1 - beta1) * g
      v[j] = beta2 * v[j]! + (1 - beta2) * g * g
      const mHat = m[j]! / b1Corr
      const vHat = v[j]! / b2Corr
      const span = Math.min(5, Math.max(0.1, bounds[j]![1] - bounds[j]![0]))
      candidate[j] = current[j]! - lr * span * (mHat / (Math.sqrt(vHat) + eps))
    }

    current = clipFSRS6Parameters(candidate, 1, true)
    const rawEval = scoreSequences(sequences, current)
    if (rawEval.logLoss < bestRawLoss - 1e-6) {
      bestRawLoss = rawEval.logLoss
      bestWeights = [...current]
    }
  }

  const rounded = parseFsrsWeights(bestWeights)
  const finalScore = scoreSequences(sequences, rounded)

  if (finalScore.logLoss >= defaultScore.logLoss - 1e-5) {
    return {
      status: 'already_optimal',
      minRequired: MIN_OPTIMIZER_REVIEWS,
      sampleCount: defaultScore.evaluated,
      baseline,
      optimized: baseline,
      improvementPct: 0,
      weights: [...FSRS6_DEFAULT_WEIGHTS],
    }
  }

  const optimized: FsrsEvaluation = {
    logLoss: finalScore.logLoss,
    rmse: finalScore.rmseBins,
    rmseBins: finalScore.rmseBins,
    totalReviews: revlogs.length,
    sampleCount: finalScore.evaluated,
    evaluatedTransitions: finalScore.evaluated,
    cardCount: sequences.length,
    cardsCount: sequences.length,
    weights: rounded,
  }
  const improvementPct =
    defaultScore.logLoss > 0
      ? Math.round(((defaultScore.logLoss - finalScore.logLoss) / defaultScore.logLoss) * 10000) /
        100
      : 0

  return {
    status: 'optimized',
    minRequired: MIN_OPTIMIZER_REVIEWS,
    sampleCount: finalScore.evaluated,
    baseline,
    optimized,
    improvementPct: Math.max(0, improvementPct),
    weights: rounded,
  }
}

/**
 * Deterministically replay a single card's chronological `revlog` history
 * through `ts-fsrs`'s `Reschedule` engine to compute its updated FSRS-6 row
 * patch (`due`, `stability`, `difficulty`, `scheduledDays`, `reps`, `lapses`,
 * `state`, `lastReview`, `learningStep`).
 *
 * Used both when rescheduling cards after parameter/retention updates AND
 * during multi-device cloud sync when concurrent offline reviews merge.
 */
export async function rescheduleCardHistory(
  history: readonly FsrsOptimizerRevlog[],
  opts: { desiredRetention?: number; weights?: readonly number[] | null } = {},
): Promise<FsrsRowPatch | null> {
  const valid = history
    .filter((r) => [1, 2, 3, 4].includes(r.rating) && !Number.isNaN(Date.parse(r.reviewedAt)))
    .sort(
      (a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt) || (a.id ?? 0) - (b.id ?? 0),
    )

  if (valid.length === 0) return null

  const desiredRetention = Math.max(0.5, Math.min(0.97, opts.desiredRetention ?? 0.9))
  const weights =
    opts.weights && opts.weights.length > 0 ? parseFsrsWeights(opts.weights) : undefined

  const sched = await DefaultScheduler({
    version: 'FSRS-6',
    desiredRetention,
    weights,
    enableShortTerm: true,
  })

  const rescheduler = new Reschedule(sched)
  const out = rescheduler.reschedule(
    {
      history: valid.map((r) => ({
        rating: r.rating as Rating,
        reviewTime: new Date(r.reviewedAt),
      })),
    },
    { sortHistory: false },
  )

  return fsrsToCardRow(out.card)
}

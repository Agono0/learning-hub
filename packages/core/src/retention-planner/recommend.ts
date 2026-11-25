import type { Calibration, GridPoint, PlannerInput, PlannerOptions, PlannerResult } from './model'
import {
  DEFAULT_GRID,
  DEFAULT_HORIZON_DAYS,
  DEFAULT_SEED,
  DEFAULT_SIMULATED_CARDS,
  MAX_BUDGET_MINUTES,
  MAX_GRID_POINTS,
  MAX_HORIZON_DAYS,
  MAX_RETENTION,
  MAX_SCHEDULER_CALLS,
  MAX_SIMULATED_CARDS,
  MIN_BUDGET_MINUTES,
  MIN_GRID_POINTS,
  MIN_HORIZON_DAYS,
  MIN_RETENTION,
} from './model'
import { preflightCalls, selectCards, simulateRetention, type CallCounter } from './simulate'
import { estimatePassMix, estimateTiming } from './timing'
import { calibrateHeldOut } from './validate'

export class PlannerBoundsError extends Error {}

/** Validate and fill options. Throws PlannerBoundsError; never clamps silently. */
export function resolveOptions(raw: Partial<PlannerOptions>): PlannerOptions {
  const grid = raw.grid ?? DEFAULT_GRID
  if (grid.length < MIN_GRID_POINTS || grid.length > MAX_GRID_POINTS) {
    throw new PlannerBoundsError(`grid needs ${MIN_GRID_POINTS} to ${MAX_GRID_POINTS} values`)
  }
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]!
    if (!Number.isFinite(g) || g < MIN_RETENTION || g > MAX_RETENTION) {
      throw new PlannerBoundsError(`grid values must be ${MIN_RETENTION} to ${MAX_RETENTION}`)
    }
    if (i > 0 && g <= grid[i - 1]!) throw new PlannerBoundsError('grid must be strictly increasing')
  }
  const horizonDays = raw.horizonDays ?? DEFAULT_HORIZON_DAYS
  if (
    !Number.isInteger(horizonDays) ||
    horizonDays < MIN_HORIZON_DAYS ||
    horizonDays > MAX_HORIZON_DAYS
  ) {
    throw new PlannerBoundsError(
      `horizonDays must be an integer ${MIN_HORIZON_DAYS} to ${MAX_HORIZON_DAYS}`,
    )
  }
  const budgetMinutes = raw.budgetMinutes ?? 30
  if (
    !Number.isFinite(budgetMinutes) ||
    budgetMinutes < MIN_BUDGET_MINUTES ||
    budgetMinutes > MAX_BUDGET_MINUTES
  ) {
    throw new PlannerBoundsError(
      `budgetMinutes must be ${MIN_BUDGET_MINUTES} to ${MAX_BUDGET_MINUTES}`,
    )
  }
  const maxCards = raw.maxCards ?? DEFAULT_SIMULATED_CARDS
  if (!Number.isInteger(maxCards) || maxCards < 1 || maxCards > MAX_SIMULATED_CARDS) {
    throw new PlannerBoundsError(`maxCards must be an integer 1 to ${MAX_SIMULATED_CARDS}`)
  }
  const seed = raw.seed ?? DEFAULT_SEED
  if (!Number.isInteger(seed) || Math.abs(seed) > 2_147_483_647) {
    throw new PlannerBoundsError('seed must be a 32-bit integer')
  }
  const maxCalls = raw.maxCalls ?? MAX_SCHEDULER_CALLS
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > MAX_SCHEDULER_CALLS) {
    throw new PlannerBoundsError(`maxCalls must be an integer 1 to ${MAX_SCHEDULER_CALLS}`)
  }
  return { grid, horizonDays, budgetMinutes, maxCards, seed, maxCalls }
}

const EMPTY_CAL: Calibration = {
  heldOutReviews: 0,
  scored: 0,
  activeLogLoss: null,
  activeRmse: null,
  defaultLogLoss: null,
  defaultRmse: null,
  usingCustomWeights: false,
  note: 'Not validated.',
}

/** Highest tested retention whose mean daily minutes fit the budget. Needs a finished grid. */
export function recommend(points: readonly GridPoint[], budget: number) {
  const fits = points.filter((p) => p.meanDailyMinutes <= budget)
  if (fits.length === 0) return null
  const best = fits[fits.length - 1]!
  return {
    retention: best.retention,
    basis: `Modeled mean daily time at that retention is ${best.meanDailyMinutes.toFixed(1)} min. This is not a learning-optimal value.`,
  }
}

export async function runRetentionPlanner(
  input: PlannerInput,
  rawOptions: Partial<PlannerOptions> = {},
): Promise<PlannerResult> {
  const options = resolveOptions(rawOptions)
  const timing = estimateTiming(input.reviews)
  const passMix = estimatePassMix(input.reviews)
  const { picked, coverage } = selectCards(input.cards, options.maxCards)
  const calibration = input.reviews.length
    ? calibrateHeldOut(input.reviews, input.weights)
    : EMPTY_CAL
  const base = {
    asOf: input.now.toISOString(),
    currentRetention: input.currentRetention,
    currentSource: input.currentSource,
    weights: input.weights && input.weights.length > 0 ? ('custom' as const) : ('default' as const),
    horizonDays: options.horizonDays,
    budgetMinutes: options.budgetMinutes,
    seed: options.seed,
    coverage,
    timing,
    passMix,
    maxCalls: options.maxCalls,
    calibration,
  }
  if (picked.length === 0) {
    return {
      ...base,
      status: 'no-eligible-cards',
      message: 'No Review-state, non-suspended cards to simulate.',
      grid: [],
      schedulerCalls: 0,
      recommendation: null,
    }
  }
  const planned = preflightCalls(picked.length, options.grid.length, options.horizonDays)
  if (planned > options.maxCalls) {
    return {
      ...base,
      status: 'rejected',
      message: `Rejected before running: the conservative bound is ${planned.toLocaleString('en-US')} scheduler calls, above the ${options.maxCalls.toLocaleString('en-US')} limit. Lower cards, grid points or horizon.`,
      grid: [],
      schedulerCalls: 0,
      recommendation: null,
    }
  }
  const counter: CallCounter = { used: 0, max: options.maxCalls }
  const points: GridPoint[] = []
  let complete = true
  for (const retention of options.grid) {
    const out = await simulateRetention({
      cards: picked,
      retention,
      weights: input.weights,
      options,
      mix: passMix,
      timing,
      now: input.now,
      counter,
    })
    if (!out.complete) {
      complete = false
      break
    }
    const scale = coverage.scaleUp
    const minutes = out.days.map((d) => d.minutes * scale)
    const total = minutes.reduce((a, b) => a + b, 0)
    const meanDailyMinutes = total / options.horizonDays
    points.push({
      retention,
      reviews: Math.round(out.reviews * scale),
      meanDailyReviews: (out.reviews * scale) / options.horizonDays,
      meanDailyMinutes,
      peakDailyMinutes: Math.max(...minutes),
      lapseShare: out.reviews === 0 ? 0 : out.lapses / out.reviews,
      fitsBudget: meanDailyMinutes <= options.budgetMinutes,
    })
  }
  if (!complete) {
    return {
      ...base,
      status: 'incomplete',
      message: `Stopped at the ${options.maxCalls.toLocaleString('en-US')} scheduler-call limit after ${counter.used.toLocaleString('en-US')} calls. The grid is incomplete, so no budget recommendation is given.`,
      grid: points,
      schedulerCalls: counter.used,
      recommendation: null,
    }
  }
  return {
    ...base,
    status: 'ok',
    message: 'Modeled over your current Review-state cards under the assumptions shown.',
    grid: points,
    schedulerCalls: counter.used,
    recommendation: recommend(points, options.budgetMinutes),
  }
}

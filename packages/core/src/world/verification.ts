/**
 * Anti-cheat and study verification engine for Study Coins.
 *
 * Rules:
 * 1. Card reviews must be executed through executeReview with authentic retrieval duration (>= 1.5s).
 * 2. Rapid review burst limits prevent automated macro farming.
 * 3. Focus blocks require genuine heartbeats and full planned duration completion without early gate breaks.
 */

export const MIN_REVIEW_DURATION_MS = 1500
export const MAX_REVIEW_COINS_PER_5M = 35

export interface ReviewCoinCheckInput {
  cardId: number
  elapsedMs: number
  rating: number // 1..4 (FSRS rating)
  recentReviewCoins5m?: number
}

export interface ReviewCoinCheckResult {
  valid: boolean
  coinsAwarded: number
  reason: string
}

/**
 * Validates a completed FSRS review to determine if study coins should be minted.
 */
export function verifyReviewForCoins(input: ReviewCoinCheckInput): ReviewCoinCheckResult {
  if (input.elapsedMs < MIN_REVIEW_DURATION_MS) {
    return {
      valid: false,
      coinsAwarded: 0,
      reason: `Review duration too fast (${input.elapsedMs}ms < ${MIN_REVIEW_DURATION_MS}ms threshold)`,
    }
  }

  if (input.rating < 1 || input.rating > 4) {
    return {
      valid: false,
      coinsAwarded: 0,
      reason: `Invalid review rating ${input.rating}`,
    }
  }

  const current5mTotal = input.recentReviewCoins5m ?? 0
  if (current5mTotal >= MAX_REVIEW_COINS_PER_5M) {
    return {
      valid: false,
      coinsAwarded: 0,
      reason: `Rate limit reached: maximum ${MAX_REVIEW_COINS_PER_5M} coins per 5-minute study window`,
    }
  }

  // Base coin awards
  let coins = 1
  if (input.rating === 3)
    coins = 2 // Good
  else if (input.rating === 4) coins = 3 // Easy

  // Cap at remaining rate limit
  const coinsAllowed = Math.min(coins, MAX_REVIEW_COINS_PER_5M - current5mTotal)

  return {
    valid: true,
    coinsAwarded: coinsAllowed,
    reason: 'Verified active recall review',
  }
}

export interface FocusSessionCoinCheckInput {
  plannedMinutes: number
  actualSeconds: number
  heartbeatsCount: number
  completedWithoutExit: boolean
}

export interface FocusSessionCoinCheckResult {
  valid: boolean
  coinsAwarded: number
  reason: string
}

/**
 * Validates a focus timer block to award study coins upon verified completion.
 */
export function verifyFocusSessionForCoins(
  input: FocusSessionCoinCheckInput,
): FocusSessionCoinCheckResult {
  if (!input.completedWithoutExit) {
    return {
      valid: false,
      coinsAwarded: 0,
      reason: 'Session exited or interrupted early',
    }
  }

  const requiredSeconds = input.plannedMinutes * 60 * 0.9 // at least 90% of planned time
  if (input.actualSeconds < requiredSeconds) {
    return {
      valid: false,
      coinsAwarded: 0,
      reason: `Actual focus time (${input.actualSeconds}s) did not reach planned target (${requiredSeconds}s)`,
    }
  }

  // Verify heartbeats (at least 1 per 75s of elapsed time)
  const expectedHeartbeats = Math.floor(input.actualSeconds / 75)
  if (input.actualSeconds >= 120 && input.heartbeatsCount < expectedHeartbeats) {
    return {
      valid: false,
      coinsAwarded: 0,
      reason: `Insufficient active focus heartbeats (${input.heartbeatsCount} < ${expectedHeartbeats})`,
    }
  }

  // Calculate coins: 1 per minute + bonuses
  const minutes = Math.floor(input.actualSeconds / 60)
  let coins = minutes
  if (input.plannedMinutes >= 50) {
    coins += 15 // Deep work bonus
  } else if (input.plannedMinutes >= 25) {
    coins += 5 // Standard Pomodoro bonus
  }

  return {
    valid: true,
    coinsAwarded: coins,
    reason: `Verified ${minutes}m focus session`,
  }
}

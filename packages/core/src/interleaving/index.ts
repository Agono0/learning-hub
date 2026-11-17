import { z } from 'zod'

/**
 * @file Interleaving Practice Scheduler & Discrimination Engine
 * @description Implements Doug Rohrer & Kelli Taylor's (2007) interleaving practice algorithm
 * and Carvalho & Goldstone's (2014) category discrimination theory.
 *
 * Rather than 'blocked' practice (e.g. AAA-BBB-CCC), interleaving (e.g. ABC-CAB-BCA)
 * prevents cue-overfitting and forces continuous category discrimination,
 * producing up to a 43% boost in delayed retention.
 */

export const interleavingItemSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  difficulty: z.number().min(0).max(1).default(0.5),
  urgency: z.number().min(0).max(1).default(0.5),
  title: z.string().default(''),
})

export type InterleavingItem = z.infer<typeof interleavingItemSchema>

export const interleavingScheduleOptionsSchema = z.object({
  /** Maximum consecutive items belonging to the exact same category (default 1) */
  maxConsecutiveCategory: z.number().int().min(1).default(1),
  /** Target count of items to include in the drill session */
  targetCount: z.number().int().min(1).optional(),
  /** Weight given to urgency vs category round-robin (0 to 1, default 0.6) */
  urgencyWeight: z.number().min(0).max(1).default(0.6),
})

export type InterleavingScheduleOptions = z.infer<typeof interleavingScheduleOptionsSchema>

export const discriminationPromptSchema = z.object({
  sourceCategory: z.string(),
  targetCategory: z.string(),
  reflectionPrompt: z.string(),
  discriminationQuestion: z.string(),
})

export type DiscriminationPrompt = z.infer<typeof discriminationPromptSchema>

export const interleavingResultSchema = z.object({
  schedule: z.array(interleavingItemSchema),
  /** Normalized entropy score (0 to 1) representing category distribution spread */
  categoryEntropy: z.number().min(0).max(1),
  /** Consecutive repetition rate (0 = perfectly interleaved, 1 = purely blocked) */
  blockingFactor: z.number().min(0).max(1),
  /** Total number of category switches */
  transitionCount: z.number().int().min(0),
  /** Metacognitive discrimination prompts for key category transitions */
  discriminationPrompts: z.array(discriminationPromptSchema),
})

export type InterleavingResult = z.infer<typeof interleavingResultSchema>

/**
 * Calculates Shannon entropy of category occurrences normalized to [0, 1].
 * @param categories Array of category identifiers
 */
export function calculateCategoryEntropy(categories: string[]): number {
  if (categories.length <= 1) return 0

  const counts = new Map<string, number>()
  for (const cat of categories) {
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }

  const distinctCount = counts.size
  if (distinctCount <= 1) return 0

  let entropy = 0
  const n = categories.length
  for (const count of counts.values()) {
    const p = count / n
    entropy -= p * Math.log2(p)
  }

  // Normalize by theoretical maximum log2(distinctCount)
  const maxEntropy = Math.log2(distinctCount)
  return maxEntropy > 0 ? Math.min(1, Math.max(0, entropy / maxEntropy)) : 0
}

/**
 * Computes blocking factor: the fraction of adjacent items sharing the same category.
 * A score of 0.0 indicates complete interleaving (no immediate consecutive repeats).
 */
export function calculateBlockingFactor(categories: string[]): number {
  if (categories.length <= 1) return 0

  let repeats = 0
  for (let i = 1; i < categories.length; i++) {
    if (categories[i] === categories[i - 1]) {
      repeats++
    }
  }

  return repeats / (categories.length - 1)
}

/**
 * Generates contrastive metacognitive discrimination prompts when transitioning
 * between different categories (Carvalho & Goldstone, 2014).
 */
export function generateDiscriminationPrompt(
  prevItem: InterleavingItem,
  currItem: InterleavingItem,
): DiscriminationPrompt {
  return {
    sourceCategory: prevItem.categoryId,
    targetCategory: currItem.categoryId,
    reflectionPrompt: `Notice the shift from "${prevItem.categoryId}" to "${currItem.categoryId}".`,
    discriminationQuestion: `What key discriminating feature distinguishes "${currItem.title || currItem.id}" from the principles used in "${prevItem.categoryId}"?`,
  }
}

/**
 * Computes an optimal interleaved schedule from a candidate pool of items.
 * Balances FSRS urgency/retention risk with maximal category separation
 * to prevent blocked learning biases (Rohrer & Taylor, 2007).
 */
export function computeInterleavingSchedule(
  items: InterleavingItem[],
  options: Partial<InterleavingScheduleOptions> = {},
): InterleavingResult {
  const parsedOpts = interleavingScheduleOptionsSchema.parse(options)
  if (items.length === 0) {
    return {
      schedule: [],
      categoryEntropy: 0,
      blockingFactor: 0,
      transitionCount: 0,
      discriminationPrompts: [],
    }
  }

  // Clone pool
  const pool = [...items]
  const targetCount = parsedOpts.targetCount ?? pool.length
  const schedule: InterleavingItem[] = []
  const prompts: DiscriminationPrompt[] = []

  let consecutiveCount = 0
  let lastCategory: string | null = null

  while (schedule.length < targetCount && pool.length > 0) {
    // Score pool candidates
    let bestIndex = -1
    let bestScore = -Infinity

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i]
      const isSameCategory = candidate.categoryId === lastCategory

      // Check max consecutive violation
      if (isSameCategory && consecutiveCount >= parsedOpts.maxConsecutiveCategory) {
        // Heavy penalty to avoid violating hard constraint if alternatives exist
        continue
      }

      // Base score derived from urgency and difficulty
      let score = candidate.urgency * parsedOpts.urgencyWeight + candidate.difficulty * 0.2

      // Bonus for category diversification
      if (!isSameCategory) {
        score += 1.0 // Strong interleaving bonus
      } else {
        score -= 0.5 * consecutiveCount // Progressive penalty for repetition
      }

      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }

    // If all remaining candidates violate maxConsecutiveCategory, pick the highest urgency
    if (bestIndex === -1) {
      bestIndex = 0
      for (let i = 1; i < pool.length; i++) {
        if (pool[i].urgency > pool[bestIndex].urgency) {
          bestIndex = i
        }
      }
    }

    const [selected] = pool.splice(bestIndex, 1)

    if (schedule.length > 0) {
      const prev = schedule[schedule.length - 1]
      if (prev.categoryId !== selected.categoryId) {
        // Generate discrimination reflection on switch
        prompts.push(generateDiscriminationPrompt(prev, selected))
      }
    }

    if (selected.categoryId === lastCategory) {
      consecutiveCount++
    } else {
      consecutiveCount = 1
      lastCategory = selected.categoryId
    }

    schedule.push(selected)
  }

  const categorySeq = schedule.map((item) => item.categoryId)
  const categoryEntropy = calculateCategoryEntropy(categorySeq)
  const blockingFactor = calculateBlockingFactor(categorySeq)

  let transitions = 0
  for (let i = 1; i < categorySeq.length; i++) {
    if (categorySeq[i] !== categorySeq[i - 1]) transitions++
  }

  return {
    schedule,
    categoryEntropy,
    blockingFactor,
    transitionCount: transitions,
    discriminationPrompts: prompts,
  }
}

export * from './structural-invariance-engine'

/**
 * @fileoverview Slamecka & Graf (1978) Generation Effect Engine.
 * Grounded in:
 * - Slamecka, N. J., & Graf, P. (1978). The generation effect: Delineation of a phenomenon.
 *   Journal of Experimental Psychology: Human Learning and Memory, 4(6), 592–604.
 * - Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in a good way:
 *   Creating desirable difficulties to enhance learning.
 * - McDaniel, M. A., et al. (2009). The testing effect in the classroom: Quizzing induces long-term retention.
 */

import { z } from 'zod'
import { computeSimilarity, generationTierEnum, type GenerationTier } from './shared'

// Re-exported so the barrel surface is unchanged (they are defined in
// ./shared to keep the desirable-difficulty engine's import acyclic).
export { computeSimilarity, generationTierEnum, type GenerationTier } from './shared'

export const generationLadderSchema = z.object({
  concept: z.string(),
  tier: generationTierEnum,
  tierLevel: z.number().min(1).max(4),
  challengeText: z.string(),
  maskedTarget: z.string().optional(),
  scrambledTokens: z.array(z.string()).optional(),
  expectedAnswer: z.string(),
  hint: z.string(),
  generationMultiplier: z.number(), // e.g. 1.45x
})

export type GenerationLadder = z.infer<typeof generationLadderSchema>

export const generationTrialInputSchema = z.object({
  concept: z.string(),
  tier: generationTierEnum,
  expectedAnswer: z.string(),
  userAttempt: z.string(),
  latencyMs: z.number().min(0),
})

export type GenerationTrialInput = z.infer<typeof generationTrialInputSchema>

export const generationEvaluationResultSchema = z.object({
  concept: z.string(),
  tier: generationTierEnum,
  similarityScore: z.number().min(0).max(1), // 0 to 1.0
  isCorrect: z.boolean(),
  retentionMultiplier: z.number(), // 1.0 to 2.2x
  recommendedNextTier: generationTierEnum,
  feedback: z.string(),
})

export type GenerationEvaluationResult = z.infer<typeof generationEvaluationResultSchema>

/**
 * Mask vowels in a word, preserving first and last characters as anchors.
 * e.g. "Bayesian" -> "B_y_s__n"
 */
export function maskVowelsInWord(word: string): string {
  if (word.length <= 2) return word
  const first = word[0]!
  const last = word[word.length - 1]!
  const middle = word.slice(1, -1)

  const maskedMiddle = middle.replace(/[aeiouAEIOU]/g, '_')
  return `${first}${maskedMiddle}${last}`
}

/**
 * Mask text for Tier 1: Stem Completion.
 */
export function generateStemMask(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((w) => (w.length >= 3 ? maskVowelsInWord(w) : w))
    .join(' ')
}

/**
 * Deterministically scramble tokens for Tier 2: Semantic Anagram.
 */
export function scrambleTokens(phrase: string): string[] {
  const tokens = phrase.trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) return tokens

  // Simple deterministic shuffle using pseudo-rotation
  const shuffled = [...tokens]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (i * 3 + 1) % (i + 1)
    const temp = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = temp
  }

  // Ensure scrambled array does not match original exactly if length > 1
  if (shuffled.join(' ') === tokens.join(' ')) {
    shuffled.reverse()
  }

  return shuffled
}

/**
 * Generate a complete 4-tier generation ladder for a concept and explanation.
 */
export function createGenerationLadder(
  concept: string,
  explanation: string,
  targetTier: GenerationTier = 'stem_completion',
): GenerationLadder {
  const tierMap: Record<GenerationTier, { level: number; multiplier: number; hint: string }> = {
    stem_completion: {
      level: 1,
      multiplier: 1.35,
      hint: 'Reconstruct the masked words from phonemic stem anchors.',
    },
    semantic_anagram: {
      level: 2,
      multiplier: 1.55,
      hint: 'Arrange the scrambled concept fragments into coherent syntactic order.',
    },
    reverse_query: {
      level: 3,
      multiplier: 1.8,
      hint: 'Formulate the exact question or prompt that produces this mechanistic explanation.',
    },
    analogy_synthesis: {
      level: 4,
      multiplier: 2.1,
      hint: 'Generate an everyday physical analogy and an edge condition where the rule breaks.',
    },
  }

  const info = tierMap[targetTier]
  let challengeText = ''
  let maskedTarget: string | undefined
  let scrambledTokens: string[] | undefined

  switch (targetTier) {
    case 'stem_completion':
      maskedTarget = generateStemMask(explanation)
      challengeText = `Fill in the missing consonants and vowels to complete the definition of ${concept}:`
      break
    case 'semantic_anagram':
      scrambledTokens = scrambleTokens(explanation)
      challengeText = `Reconstruct the scrambled explanation for ${concept} in correct semantic order:`
      break
    case 'reverse_query':
      challengeText = `You are given the mechanistic explanation: "${explanation}". What precise core question does this statement answer?`
      break
    case 'analogy_synthesis':
      challengeText = `Synthesize a concrete physical analogy for ${concept}. What real-world system behaves just like it?`
      break
  }

  return {
    concept,
    tier: targetTier,
    tierLevel: info.level,
    challengeText,
    maskedTarget,
    scrambledTokens,
    expectedAnswer: explanation,
    hint: info.hint,
    generationMultiplier: info.multiplier,
  }
}

/**
 * Evaluate a user's generation attempt against the active tier challenge.
 */
export function evaluateGenerationTrial(input: GenerationTrialInput): GenerationEvaluationResult {
  const { concept, tier, expectedAnswer, userAttempt, latencyMs } =
    generationTrialInputSchema.parse(input)

  const similarity = computeSimilarity(expectedAnswer, userAttempt)
  const isCorrect = similarity >= 0.75

  // Base tier multipliers from Slamecka & Graf (1978)
  const baseMultipliers: Record<GenerationTier, number> = {
    stem_completion: 1.35,
    semantic_anagram: 1.55,
    reverse_query: 1.8,
    analogy_synthesis: 2.1,
  }

  // Calculate empirical retention multiplier
  let retentionMultiplier = 1.0
  if (isCorrect) {
    // Latency discount: brisk accurate generation (<8s) achieves peak potentiation
    const speedBonus = latencyMs > 0 && latencyMs < 8000 ? 0.1 : 0.0
    retentionMultiplier = Math.round((baseMultipliers[tier] * similarity + speedBonus) * 100) / 100
  } else {
    // Generation attempt prior to error correction still provides modest potentiation (Bjork & Bjork 2011)
    retentionMultiplier = Math.round((1.0 + 0.15 * similarity) * 100) / 100
  }

  // Determine recommended next tier based on mastery
  let recommendedNextTier: GenerationTier = tier
  if (isCorrect) {
    if (tier === 'stem_completion') recommendedNextTier = 'semantic_anagram'
    else if (tier === 'semantic_anagram') recommendedNextTier = 'reverse_query'
    else if (tier === 'reverse_query') recommendedNextTier = 'analogy_synthesis'
    else recommendedNextTier = 'analogy_synthesis'
  } else {
    if (tier === 'analogy_synthesis') recommendedNextTier = 'reverse_query'
    else if (tier === 'reverse_query') recommendedNextTier = 'semantic_anagram'
    else recommendedNextTier = 'stem_completion'
  }

  let feedback = ''
  if (isCorrect) {
    feedback = `Generation successful! +${Math.round((retentionMultiplier - 1.0) * 100)}% projected retention gain.`
  } else {
    feedback = `Generation incomplete (${Math.round(similarity * 100)}% match). Reviewing correct answer solidifies encoding.`
  }

  return {
    concept,
    tier,
    similarityScore: similarity,
    isCorrect,
    retentionMultiplier,
    recommendedNextTier,
    feedback,
  }
}

export * from './desirable-difficulty-engine'

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const generationChallengeInputSchema = z.object({
  concept: z.string().min(1),
  explanation: z.string().optional(),
  text: z.string().optional(),
  tier: generationTierEnum,
})
export type GenerationChallengeInput = z.infer<typeof generationChallengeInputSchema>

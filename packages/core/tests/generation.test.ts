import { describe, expect, it } from 'vitest'
import {
  computeSimilarity,
  createGenerationLadder,
  evaluateGenerationTrial,
  generateStemMask,
  generationEvaluationResultSchema,
  generationLadderSchema,
  maskVowelsInWord,
  scrambleTokens,
} from '../src/generation'

describe('Slamecka & Graf (1978) Generation Effect Engine', () => {
  it('masks vowels preserving word boundary anchors', () => {
    expect(maskVowelsInWord('cat')).toBe('c_t')
    expect(maskVowelsInWord('Bayesian')).toBe('B_y_s__n')
    expect(generateStemMask('Spaced Repetition')).toBe('Sp_c_d R_p_t_t__n')
  })

  it('scrambles tokens deterministically for semantic anagrams', () => {
    const tokens = scrambleTokens('Active recall strengthens neural pathways')
    expect(tokens.length).toBe(5)
    expect(tokens.join(' ')).not.toBe('Active recall strengthens neural pathways')
  })

  it('computes normalized Levenshtein similarity', () => {
    expect(computeSimilarity('bayesian', 'bayesian')).toBe(1.0)
    expect(computeSimilarity('bayesian', 'bayesian updating')).toBeGreaterThan(0.4)
    expect(computeSimilarity('apple', 'banana')).toBeLessThan(0.4)
  })

  it('creates generation ladders across all 4 difficulty tiers', () => {
    const ladderTier1 = createGenerationLadder(
      'Bayes Theorem',
      'Updates prior probability with new likelihood evidence',
      'stem_completion',
    )
    expect(generationLadderSchema.safeParse(ladderTier1).success).toBe(true)
    expect(ladderTier1.tierLevel).toBe(1)
    expect(ladderTier1.maskedTarget).toBeDefined()
    expect(ladderTier1.generationMultiplier).toBe(1.35)

    const ladderTier2 = createGenerationLadder(
      'Bayes Theorem',
      'Updates prior probability with new likelihood evidence',
      'semantic_anagram',
    )
    expect(ladderTier2.tierLevel).toBe(2)
    expect(ladderTier2.scrambledTokens?.length).toBeGreaterThan(0)
    expect(ladderTier2.generationMultiplier).toBe(1.55)
  })

  it('evaluates generation trials and calculates retention multipliers', () => {
    const successResult = evaluateGenerationTrial({
      concept: 'Spaced Repetition',
      tier: 'semantic_anagram',
      expectedAnswer: 'Expanding intervals optimize memory consolidation',
      userAttempt: 'Expanding intervals optimize memory consolidation',
      latencyMs: 3400,
    })

    expect(generationEvaluationResultSchema.safeParse(successResult).success).toBe(true)
    expect(successResult.isCorrect).toBe(true)
    expect(successResult.retentionMultiplier).toBeGreaterThanOrEqual(1.55)
    expect(successResult.recommendedNextTier).toBe('reverse_query')

    const failedResult = evaluateGenerationTrial({
      concept: 'Spaced Repetition',
      tier: 'semantic_anagram',
      expectedAnswer: 'Expanding intervals optimize memory consolidation',
      userAttempt: 'Something completely wrong',
      latencyMs: 9000,
    })

    expect(failedResult.isCorrect).toBe(false)
    expect(failedResult.recommendedNextTier).toBe('stem_completion')
  })
})

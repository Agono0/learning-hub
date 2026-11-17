import { describe, expect, it } from 'vitest'
import {
  computeSimilarity,
  createGenerationLadder,
  evaluateGenerationTrial,
  generateStemMask,
  generationLadderSchema,
  maskVowelsInWord,
  scrambleTokens,
} from '../src/generation/index.js'

describe('Slamecka-Graf Generation Effect Comprehensive Suite', () => {
  describe('Vowel & Stem Masking Heuristics', () => {
    it('masks vowels in words while preserving first and last letter anchors', () => {
      expect(maskVowelsInWord('Bayesian')).toBe('B_y_s__n')
      expect(maskVowelsInWord('memory')).toBe('m_m_ry')
      expect(maskVowelsInWord('cognition')).toBe('c_gn_t__n')
      expect(maskVowelsInWord('retrieval')).toBe('r_tr__v_l')
    })

    it('preserves short words with length <= 2 unchanged', () => {
      expect(maskVowelsInWord('is')).toBe('is')
      expect(maskVowelsInWord('at')).toBe('at')
      expect(maskVowelsInWord('a')).toBe('a')
      expect(maskVowelsInWord('')).toBe('')
    })

    it('generates stem mask across multi-word sentences', () => {
      const sentence = 'Active recall produces durable consolidation'
      const masked = generateStemMask(sentence)
      expect(masked).toContain('Act_ve')
      expect(masked).toContain('r_c_ll')
      expect(masked).toContain('pr_d_c_s')
      expect(masked).toContain('d_r_ble')
    })

    it('handles uppercase and lowercase vowels consistently', () => {
      expect(maskVowelsInWord('OPTIMIZE')).toBe('OPT_M_ZE')
      expect(maskVowelsInWord('EVALUATION')).toBe('EV_L__T__N')
    })
  })

  describe('Semantic Anagram Token Scrambling', () => {
    it('scrambles tokens deterministically and avoids identical order', () => {
      const phrase = 'neurons that fire together wire together'
      const scrambled = scrambleTokens(phrase)

      expect(scrambled).toHaveLength(6)
      expect(scrambled.join(' ')).not.toBe(phrase)
      expect(scrambled.sort()).toEqual(phrase.split(' ').sort())
    })

    it('handles single token phrases gracefully', () => {
      expect(scrambleTokens('neuroplasticity')).toEqual(['neuroplasticity'])
      expect(scrambleTokens('')).toEqual([])
    })

    it('reverses tokens when pseudo-rotation would match original', () => {
      const twoTokens = 'deep learning'
      const scrambled = scrambleTokens(twoTokens)
      expect(scrambled).toHaveLength(2)
      expect(scrambled).toEqual(['learning', 'deep'])
    })
  })

  describe('Similarity Calculation & Levenshtein Normalization', () => {
    it('returns 1.0 for identical strings after normalization', () => {
      expect(computeSimilarity('Hebbian Plasticity', 'hebbian plasticity')).toBe(1.0)
      expect(computeSimilarity('spacing-effect!', 'Spacing Effect')).toBe(1.0)
    })

    it('returns 0.0 for completely disjoint strings', () => {
      expect(computeSimilarity('abcdef', 'uvwxyz')).toBe(0.0)
      expect(computeSimilarity('apple', '')).toBe(0.0)
    })

    it('computes accurate graded similarity for typos and minor slips', () => {
      // 1 deletion in 7 chars
      const sim = computeSimilarity('retrieval', 'retrival')
      expect(sim).toBeGreaterThanOrEqual(0.85)
      expect(sim).toBeLessThan(1.0)
    })

    it('handles whitespace and punctuation variations robustly', () => {
      expect(computeSimilarity('A -> B -> C', 'A B C')).toBe(1.0)
      expect(computeSimilarity('(FSRS-6)', 'fsrs 6')).toBe(1.0)
    })
  })

  describe('Ladder Generation Engine', () => {
    const concept = 'Bayesian Knowledge Tracing'
    const explanation = 'BKT tracks latent mastery using four cognitive parameters.'

    it('constructs valid Tier 1 Stem Completion ladder conforming to schema', () => {
      const ladder = createGenerationLadder(concept, explanation, 'stem_completion')
      expect(generationLadderSchema.safeParse(ladder).success).toBe(true)
      expect(ladder.tier).toBe('stem_completion')
      expect(ladder.tierLevel).toBe(1)
      expect(ladder.generationMultiplier).toBe(1.35)
      expect(ladder.maskedTarget).toBeDefined()
    })

    it('constructs valid Tier 2 Semantic Anagram ladder', () => {
      const ladder = createGenerationLadder(concept, explanation, 'semantic_anagram')
      expect(ladder.tier).toBe('semantic_anagram')
      expect(ladder.tierLevel).toBe(2)
      expect(ladder.generationMultiplier).toBe(1.55)
      expect(ladder.scrambledTokens).toBeDefined()
      expect(ladder.scrambledTokens!.length).toBeGreaterThan(0)
    })

    it('constructs valid Tier 3 Reverse Query ladder', () => {
      const ladder = createGenerationLadder(concept, explanation, 'reverse_query')
      expect(ladder.tier).toBe('reverse_query')
      expect(ladder.tierLevel).toBe(3)
      expect(ladder.generationMultiplier).toBe(1.8)
      expect(ladder.challengeText).toContain('What precise core question')
    })

    it('constructs valid Tier 4 Analogy Synthesis ladder', () => {
      const ladder = createGenerationLadder(concept, explanation, 'analogy_synthesis')
      expect(ladder.tier).toBe('analogy_synthesis')
      expect(ladder.tierLevel).toBe(4)
      expect(ladder.generationMultiplier).toBe(2.1)
      expect(ladder.challengeText).toContain('physical analogy')
    })
  })

  describe('Generation Trial Evaluation & Retention Multipliers', () => {
    it('awards high retention multiplier and speed bonus for rapid correct attempt', () => {
      const evalResult = evaluateGenerationTrial({
        concept: 'FSRS Stability',
        tier: 'reverse_query',
        expectedAnswer: 'Interval duration required for retrievability to decay to 90%',
        userAttempt: 'Interval duration required for retrievability to decay to 90%',
        latencyMs: 3200, // < 8s speed bonus
      })

      expect(evalResult.isCorrect).toBe(true)
      expect(evalResult.similarityScore).toBe(1.0)
      expect(evalResult.retentionMultiplier).toBeGreaterThanOrEqual(1.8)
      expect(evalResult.recommendedNextTier).toBe('analogy_synthesis')
      expect(evalResult.feedback).toContain('Generation successful')
    })

    it('awards base multiplier without speed bonus when latency exceeds 8 seconds', () => {
      const fastResult = evaluateGenerationTrial({
        concept: 'Testing Effect',
        tier: 'semantic_anagram',
        expectedAnswer: 'Active testing produces durable neural consolidation',
        userAttempt: 'Active testing produces durable neural consolidation',
        latencyMs: 4000,
      })

      const slowResult = evaluateGenerationTrial({
        concept: 'Testing Effect',
        tier: 'semantic_anagram',
        expectedAnswer: 'Active testing produces durable neural consolidation',
        userAttempt: 'Active testing produces durable neural consolidation',
        latencyMs: 12000,
      })

      expect(fastResult.isCorrect).toBe(true)
      expect(slowResult.isCorrect).toBe(true)
      expect(fastResult.retentionMultiplier).toBeGreaterThan(slowResult.retentionMultiplier)
    })

    it('provides formative feedback and steps down tier on failed generation', () => {
      const failResult = evaluateGenerationTrial({
        concept: 'Bayesian Updating',
        tier: 'analogy_synthesis',
        expectedAnswer: 'A balance scale that shifts weights as new evidence arrives',
        userAttempt: 'I do not know what this is',
        latencyMs: 5000,
      })

      expect(failResult.isCorrect).toBe(false)
      expect(failResult.similarityScore).toBeLessThan(0.75)
      expect(failResult.recommendedNextTier).toBe('reverse_query')
      expect(failResult.feedback).toContain('Generation incomplete')
    })

    it('supports pre-testing potentiation even on partial attempts', () => {
      const partialResult = evaluateGenerationTrial({
        concept: 'Memory Reconsolidation',
        tier: 'stem_completion',
        expectedAnswer: 'Reactivation renders memories temporarily labile before reconsolidating',
        userAttempt: 'Reactivation renders memories labile',
        latencyMs: 6000,
      })

      // Even when below 0.75 threshold, multiplier exceeds 1.0 baseline
      expect(partialResult.retentionMultiplier).toBeGreaterThan(1.0)
    })
  })
})

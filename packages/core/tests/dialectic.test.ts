import { describe, expect, it } from 'vitest'
import { evaluateFallacyFlag, FALLACY_DEFINITIONS, generateProtegeInquiry } from '../src/dialectic'

describe('Dialectic Debate & Protégé Peer Domain', () => {
  describe('evaluateFallacyFlag', () => {
    it('rewards high XP and explains correctly identified fallacy', () => {
      const result = evaluateFallacyFlag(
        'Anyone who disagrees with this policy simply hates progress!',
        'ad_hominem',
        ['ad_hominem'],
      )
      expect(result.correct).toBe(true)
      expect(result.awardedXp).toBe(35)
      expect(result.explanation).toContain('Ad Hominem')
    })

    it('handles misidentifications educatively with minimal XP', () => {
      const result = evaluateFallacyFlag(
        'Either we adopt microservices today or the entire company fails tomorrow!',
        'straw_man',
        ['false_dichotomy'],
      )
      expect(result.correct).toBe(false)
      expect(result.awardedXp).toBe(5)
      expect(result.explanation).toContain('Straw Man involves')
    })

    it('contains comprehensive fallacy definitions', () => {
      expect(FALLACY_DEFINITIONS.false_dichotomy.label).toContain('Dilemma')
      expect(FALLACY_DEFINITIONS.circular_reasoning.label).toContain('Circular')
    })
  })

  describe('generateProtegeInquiry', () => {
    it('generates inquiry strings prompting teach-back explanation', () => {
      const inquiry = generateProtegeInquiry('Backpropagation', 0)
      expect(inquiry).toContain('Backpropagation')
      expect(inquiry).toContain('plain English')
    })
  })
})

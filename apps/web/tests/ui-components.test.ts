import { describe, expect, it } from 'vitest'
import { createGenerationLadder, evaluateGenerationTrial } from '@learning-hub/core/generation'
import {
  calculateBrierScore,
  calculateMetacognitiveBias,
  calculateMetacognitiveReport,
} from '@learning-hub/core/metacognition'
import { computeReadability, evaluateFeynmanExplanation } from '@learning-hub/core/feynman'
import { computeInterleavingSchedule } from '@learning-hub/core/interleaving'
import {
  calculateDualCodingRetention,
  recommendDualCodingPrompt,
} from '@learning-hub/core/dualcoding'

describe('Web UI Components Domain & State Logic Suite', () => {
  describe('GenerationPracticeModal Component Model', () => {
    it('constructs multi-tier progression ladder from prompt parameters', () => {
      const concept = 'Bayesian Updating'
      const explanation =
        'Prior beliefs are mathematically updated as new empirical likelihood evidence arrives.'

      const tier1 = createGenerationLadder(concept, explanation, 'stem_completion')
      expect(tier1.tier).toBe('stem_completion')
      expect(tier1.generationMultiplier).toBe(1.35)
      expect(tier1.maskedTarget).toBeDefined()

      const tier2 = createGenerationLadder(concept, explanation, 'semantic_anagram')
      expect(tier2.tier).toBe('semantic_anagram')
      expect(tier2.generationMultiplier).toBe(1.55)
      expect(tier2.scrambledTokens?.length).toBeGreaterThan(0)

      const tier3 = createGenerationLadder(concept, explanation, 'reverse_query')
      expect(tier3.tier).toBe('reverse_query')
      expect(tier3.generationMultiplier).toBe(1.8)

      const tier4 = createGenerationLadder(concept, explanation, 'analogy_synthesis')
      expect(tier4.tier).toBe('analogy_synthesis')
      expect(tier4.generationMultiplier).toBe(2.1)
    })

    it('evaluates trial submission correctly and awards latency potentiation', () => {
      const trial = evaluateGenerationTrial({
        concept: 'Working Memory',
        tier: 'semantic_anagram',
        expectedAnswer:
          'Working memory maintains immediate representations during cognitive operations',
        userAttempt:
          'Working memory maintains immediate representations during cognitive operations',
        latencyMs: 3500, // fast <8s
      })

      expect(trial.isCorrect).toBe(true)
      expect(trial.similarityScore).toBe(1.0)
      expect(trial.retentionMultiplier).toBeGreaterThan(1.55)
      expect(trial.recommendedNextTier).toBe('reverse_query')
    })
  })

  describe('MetacognitiveCalibrationCard Component Model', () => {
    it('calculates 5-bin calibration distributions and Brier score', () => {
      const judgments = [
        { confidence: 0.1, outcome: 0, latencyMs: 2000 },
        { confidence: 0.3, outcome: 0, latencyMs: 2500 },
        { confidence: 0.5, outcome: 1, latencyMs: 1800 },
        { confidence: 0.7, outcome: 1, latencyMs: 1500 },
        { confidence: 0.9, outcome: 1, latencyMs: 1200 },
      ]

      const brier = calculateBrierScore(judgments)
      const bias = calculateMetacognitiveBias(judgments)
      const report = calculateMetacognitiveReport(judgments)

      expect(brier).toBeLessThanOrEqual(0.15)
      expect(bias).toBeDefined()
      expect(report.sampleSize).toBe(5)
      expect(report.accuracy).toBe(0.6)
      expect(report.status).toBe('expertly_calibrated')
      expect(report.difficultyAdjustment).toBe('maintain_standard_spacing')
    })

    it('detects fluency illusion and recommends escalation to free generation', () => {
      const judgments = [
        { confidence: 0.95, outcome: 0, latencyMs: 900 },
        { confidence: 0.9, outcome: 0, latencyMs: 1100 },
        { confidence: 0.85, outcome: 0, latencyMs: 1200 },
      ]

      const report = calculateMetacognitiveReport(judgments)
      expect(report.status).toBe('fluency_illusion')
      expect(report.difficultyAdjustment).toBe('escalate_to_free_production')
      expect(report.bias).toBeGreaterThan(0.5)
    })
  })

  describe('FeynmanSocraticStudio Component Model', () => {
    it('verifies 10-year-old child readability constraints', () => {
      const childExplanation =
        'Your brain is like a muscle with paths. When you use a path a lot, it turns into a paved road so you can run fast.'
      const readability = computeReadability(childExplanation)

      expect(readability.readingEase).toBeGreaterThan(70)
      expect(readability.gradeLevel).toBeLessThan(6.0)

      const report = evaluateFeynmanExplanation({
        concept: 'Neural Plasticity',
        explanation: childExplanation,
        initialConfidence: 4,
      })

      expect(report.isTwelveYearOldAccessible).toBe(true)
      expect(report.jargonDensity).toBe(0)
      expect(report.socraticProbes.length).toBeGreaterThan(0)
    })

    it('flags jargon-heavy text and extracts automatic gap cards', () => {
      const jargonExplanation =
        'Metacognitive monitoring utilizes probabilistic heuristics to operationalize epistemic judgments.'
      const report = evaluateFeynmanExplanation({
        concept: 'Metacognition',
        explanation: jargonExplanation,
        initialConfidence: 5,
      })

      expect(report.isTwelveYearOldAccessible).toBe(false)
      expect(report.jargonTerms).toContain('metacognitive')
      expect(report.jargonTerms).toContain('operationalize')
      expect(report.suggestedGapCards.length).toBeGreaterThan(0)
    })
  })

  describe('InterleavingSchedulerModal Component Model', () => {
    it('schedules multi-domain candidates with maximum category separation', () => {
      const items = [
        {
          id: '1',
          categoryId: 'Chemistry',
          difficulty: 0.5,
          urgency: 0.8,
          title: 'Acid-Base Equilibria',
        },
        {
          id: '2',
          categoryId: 'Chemistry',
          difficulty: 0.6,
          urgency: 0.7,
          title: 'Reaction Kinetics',
        },
        { id: '3', categoryId: 'Physics', difficulty: 0.7, urgency: 0.9, title: 'Gauss Law' },
        {
          id: '4',
          categoryId: 'Physics',
          difficulty: 0.5,
          urgency: 0.75,
          title: 'Harmonic Oscillators',
        },
        { id: '5', categoryId: 'Biology', difficulty: 0.4, urgency: 0.85, title: 'Krebs Cycle' },
        {
          id: '6',
          categoryId: 'Biology',
          difficulty: 0.6,
          urgency: 0.8,
          title: 'Action Potentials',
        },
      ]

      const result = computeInterleavingSchedule(items, {
        maxConsecutiveCategory: 1,
        targetCount: 6,
      })

      expect(result.schedule).toHaveLength(6)
      expect(result.blockingFactor).toBe(0.0)
      expect(result.categoryEntropy).toBeGreaterThan(0.9)
      expect(result.discriminationPrompts.length).toBeGreaterThan(0)
    })
  })

  describe('DualCodingCanvasStudio Component Model', () => {
    it('computes 2.3x forgetting reduction factor for dual-coded representations', () => {
      const stats = calculateDualCodingRetention(0.7, 0.75)
      expect(stats.compositeRetention).toBe(0.925)
      expect(stats.reductionFactor).toBeGreaterThanOrEqual(2.3)
    })

    it('recommends appropriate visual modalities based on linguistic structure', () => {
      expect(recommendDualCodingPrompt('The three-stage cycle consists of...').modality).toBe(
        'sketch_diagram',
      )
      expect(
        recommendDualCodingPrompt('Categorical differences versus supervised models...').modality,
      ).toBe('spatial_map')
      expect(
        recommendDualCodingPrompt('The fundamental theorem axiom states that...').modality,
      ).toBe('sensory_metaphor')
    })
  })
})

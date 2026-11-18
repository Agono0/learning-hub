/**
 * @file conceptest-engine.test.ts
 * @description Comprehensive Unit Tests for Peer Instruction & ConcepTest Engine
 */

import { describe, it, expect } from 'vitest'
import {
  getCanonicalConcepTestSuites,
  getConcepTestSuiteById,
  calculatePIMetrics,
  generatePIFSRSCards,
  ConcepTestSuiteSchema,
  PIPhaseEnum,
  MazurWindowActionEnum,
  PIEngagementBandEnum,
} from '../src/peer-instruction'

describe('Peer Instruction & ConcepTest Engine (Eric Mazur & Michelle Smith)', () => {
  describe('Canonical ConcepTest Suites Validation', () => {
    it('validates all canonical ConcepTest suites against ConcepTestSuiteSchema', () => {
      const suites = getCanonicalConcepTestSuites()
      expect(suites.length).toBeGreaterThanOrEqual(5)

      for (const suite of suites) {
        const parsed = ConcepTestSuiteSchema.safeParse(suite)
        expect(parsed.success).toBe(true)
        if (!parsed.success) {
          console.error('Validation failure:', parsed.error)
        }
        expect(suite.id).toBeTruthy()
        expect(suite.title).toBeTruthy()
        expect(suite.q1Options.length).toBeGreaterThanOrEqual(3)
        expect(suite.q1Options.filter((o) => o.isCorrect).length).toBe(1)
        expect(suite.q2Options.length).toBeGreaterThanOrEqual(3)
        expect(suite.q2Options.filter((o) => o.isCorrect).length).toBe(1)
        expect(suite.simulatedPeers.length).toBeGreaterThanOrEqual(2)
        expect(suite.seedCards.length).toBeGreaterThanOrEqual(3)
      }
    })

    it('retrieves suites by ID or returns undefined for non-existent IDs', () => {
      const suite = getConcepTestSuiteById('ct-thermal-expansion-plate')
      expect(suite).toBeDefined()
      expect(suite?.domain).toBe('Classical Mechanics & Thermodynamics')

      const missing = getConcepTestSuiteById('non-existent-suite')
      expect(missing).toBeUndefined()
    })
  })

  describe('Quantitative Peer Instruction & Hake Gain Calculations', () => {
    it('computes Exceptional Interactive Engagement for high Hake gain with isomorphic transfer', () => {
      const suite = getCanonicalConcepTestSuites()[0]
      const q1Correct = suite.q1Options.find((o) => o.isCorrect)!.id
      const q1Incorrect = suite.q1Options.find((o) => !o.isCorrect)!.id
      const q2Correct = suite.q2Options.find((o) => o.isCorrect)!.id

      const metrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: q1Incorrect,
        q1InitialConfidence: 4,
        q1RevoteOptionId: q1Correct,
        q1RevoteConfidence: 5,
        q2TransferOptionId: q2Correct,
        peerDiscussionOccurred: true,
        simulatedClassroomAccuracyVote1: 35,
        simulatedClassroomAccuracyVote2: 85,
      })

      // Hake Gain: (85 - 35) / (100 - 35) = 50 / 65 = 0.77
      expect(metrics.hakeNormalizedGain).toBeGreaterThanOrEqual(0.7)
      expect(metrics.engagementBand).toBe('Exceptional Interactive Engagement')
      expect(metrics.smithLearningVerification).toBe(true)
      expect(metrics.isomorphicTransferScore).toBe(100)
      expect(metrics.confidenceCalibrationDelta).toBeGreaterThan(0)
      expect(metrics.qualitativeSummary).toContain('Authentic conceptual restructuring demonstrated')
    })

    it('computes Robust Conceptual Gain for moderate progress', () => {
      const suite = getCanonicalConcepTestSuites()[1]
      const q1Correct = suite.q1Options.find((o) => o.isCorrect)!.id
      const q1Incorrect = suite.q1Options.find((o) => !o.isCorrect)!.id
      const q2Correct = suite.q2Options.find((o) => o.isCorrect)!.id

      const metrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: q1Incorrect,
        q1InitialConfidence: 3,
        q1RevoteOptionId: q1Correct,
        q1RevoteConfidence: 4,
        q2TransferOptionId: q2Correct,
        peerDiscussionOccurred: true,
        simulatedClassroomAccuracyVote1: 40,
        simulatedClassroomAccuracyVote2: 70,
      })

      // (70 - 40) / (100 - 40) = 30 / 60 = 0.50
      expect(metrics.hakeNormalizedGain).toBe(0.5)
      expect(metrics.engagementBand).toBe('Robust Conceptual Gain')
      expect(metrics.smithLearningVerification).toBe(true)
    })

    it('handles persistent misconception when peer discussion fails to convince', () => {
      const suite = getCanonicalConcepTestSuites()[0]
      const q1Incorrect = suite.q1Options.find((o) => !o.isCorrect)!.id
      const q2Incorrect = suite.q2Options.find((o) => !o.isCorrect)!.id

      const metrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: q1Incorrect,
        q1InitialConfidence: 4,
        q1RevoteOptionId: q1Incorrect,
        q1RevoteConfidence: 4,
        q2TransferOptionId: q2Incorrect,
        peerDiscussionOccurred: true,
        simulatedClassroomAccuracyVote1: 30,
        simulatedClassroomAccuracyVote2: 40,
      })

      // (40 - 30) / (100 - 30) = 10 / 70 = 0.14
      expect(metrics.hakeNormalizedGain).toBeLessThan(0.25)
      expect(metrics.engagementBand).toBe('Transmissionist Baseline')
      expect(metrics.smithLearningVerification).toBe(false)
      expect(metrics.qualitativeSummary).toContain('misconception persisted')
    })

    it('recommends correct Mazur window action depending on initial classroom accuracy', () => {
      const suite = getCanonicalConcepTestSuites()[0]
      const q1Correct = suite.q1Options.find((o) => o.isCorrect)!.id
      const q2Correct = suite.q2Options.find((o) => o.isCorrect)!.id

      // 1. Below 30%: re_explain
      const lowMetrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: q1Correct,
        q1InitialConfidence: 3,
        q1RevoteOptionId: q1Correct,
        q1RevoteConfidence: 3,
        q2TransferOptionId: q2Correct,
        peerDiscussionOccurred: false,
        simulatedClassroomAccuracyVote1: 20,
      })
      expect(lowMetrics.mazurWindowRecommendedAction).toBe('re_explain')

      // 2. 30% - 70%: peer_discussion
      const midMetrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: q1Correct,
        q1InitialConfidence: 3,
        q1RevoteOptionId: q1Correct,
        q1RevoteConfidence: 3,
        q2TransferOptionId: q2Correct,
        peerDiscussionOccurred: true,
        simulatedClassroomAccuracyVote1: 50,
      })
      expect(midMetrics.mazurWindowRecommendedAction).toBe('peer_discussion')

      // 3. Above 70%: proceed
      const highMetrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: q1Correct,
        q1InitialConfidence: 4,
        q1RevoteOptionId: q1Correct,
        q1RevoteConfidence: 4,
        q2TransferOptionId: q2Correct,
        peerDiscussionOccurred: false,
        simulatedClassroomAccuracyVote1: 85,
      })
      expect(highMetrics.mazurWindowRecommendedAction).toBe('proceed')
    })

    it('calculates Mazur Polarization Index (Shannon entropy of vote spread)', () => {
      const suite = getCanonicalConcepTestSuites()[0]
      const metrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: suite.q1Options[0].id,
        q1InitialConfidence: 3,
        q1RevoteOptionId: suite.q1Options[1].id,
        q1RevoteConfidence: 4,
        q2TransferOptionId: suite.q2Options[0].id,
        peerDiscussionOccurred: true,
      })

      // Polarization index should be between 0.5 and 1.0 for diverse distributions
      expect(metrics.mazurPolarizationIndex).toBeGreaterThan(0.5)
      expect(metrics.mazurPolarizationIndex).toBeLessThanOrEqual(1.0)
    })
  })

  describe('FSRS-6 ConcepTest Flashcard Calibration', () => {
    it('calibrates initial stability and difficulty based on Hake gain and Smith verification', () => {
      const suite = getCanonicalConcepTestSuites()[0]
      const highMetrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: suite.q1Options[0].id,
        q1InitialConfidence: 3,
        q1RevoteOptionId: suite.q1Options.find((o) => o.isCorrect)!.id,
        q1RevoteConfidence: 5,
        q2TransferOptionId: suite.q2Options.find((o) => o.isCorrect)!.id,
        peerDiscussionOccurred: true,
        simulatedClassroomAccuracyVote1: 35,
        simulatedClassroomAccuracyVote2: 85,
      })

      const cards = generatePIFSRSCards(suite, highMetrics)
      expect(cards.length).toBe(suite.seedCards.length)

      for (const card of cards) {
        expect(card.initialStabilityDays).toBeGreaterThanOrEqual(3.0)
        expect(card.initialDifficulty).toBeLessThanOrEqual(4.0)
      }
    })
  })

  describe('Zod Schema Enum Integrity', () => {
    it('verifies all PIPhaseEnum values', () => {
      expect(PIPhaseEnum.options).toEqual([
        'initial_vote',
        'peer_discussion',
        'revote',
        'canonical_synthesis',
        'isomorphic_transfer',
      ])
    })

    it('verifies all MazurWindowActionEnum values', () => {
      expect(MazurWindowActionEnum.options).toEqual([
        're_explain',
        'peer_discussion',
        'proceed',
      ])
    })

    it('verifies all PIEngagementBandEnum values', () => {
      expect(PIEngagementBandEnum.options).toEqual([
        'Exceptional Interactive Engagement',
        'Robust Conceptual Gain',
        'Moderate Discussion Convergence',
        'Transmissionist Baseline',
      ])
    })
  })
})

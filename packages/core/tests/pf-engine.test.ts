/**
 * @file pf-engine.test.ts
 * @description Comprehensive Unit Tests for Productive Failure & Canonical Consolidation Engine
 */

import { describe, it, expect } from 'vitest'
import {
  getCanonicalPFScenarios,
  getPFScenarioById,
  calculatePFMetrics,
  evaluateStudentRepresentation,
  generatePFFSRSCards,
  PFScenarioSchema,
  PFPhaseEnum,
  PFTransferDistanceEnum,
  ConceptualDepthEnum,
  AlignmentStatusEnum,
  PFMasteryBandEnum,
  type StudentGeneratedRepresentation,
  type ImpasseAnalysis,
} from '../src/productive-failure'

describe('Productive Failure & Canonical Consolidation Engine', () => {
  describe('Canonical Scenarios Validation', () => {
    it('validates all canonical scenarios against PFScenarioSchema', () => {
      const scenarios = getCanonicalPFScenarios()
      expect(scenarios.length).toBeGreaterThanOrEqual(5)

      for (const scenario of scenarios) {
        const parsed = PFScenarioSchema.safeParse(scenario)
        expect(parsed.success).toBe(true)
        if (!parsed.success) {
          console.error('Validation failure:', parsed.error)
        }
        expect(scenario.id).toBeTruthy()
        expect(scenario.title).toBeTruthy()
        expect(scenario.domain).toBeTruthy()
        expect(scenario.exemplarStudentRepresentations.length).toBeGreaterThanOrEqual(2)
        expect(scenario.canonicalConsolidation.formalParameters.length).toBeGreaterThanOrEqual(3)
        expect(scenario.canonicalConsolidation.juxtapositionMappings.length).toBeGreaterThanOrEqual(
          2,
        )
        expect(scenario.transferProbes.length).toBeGreaterThanOrEqual(3)
        expect(scenario.seedCards.length).toBeGreaterThanOrEqual(3)
      }
    })

    it('retrieves scenarios by ID or returns undefined for non-existent IDs', () => {
      const scenario = getPFScenarioById('pf-variance-dispersion')
      expect(scenario).toBeDefined()
      expect(scenario?.domain).toBe('Statistics & Data Science')

      const missing = getPFScenarioById('non-existent-scenario')
      expect(missing).toBeUndefined()
    })
  })

  describe('Quantitative PF Metrics Calculations', () => {
    it('computes Master Adaptive Transferer metrics with synergy bonus', () => {
      const representations: StudentGeneratedRepresentation[] = [
        {
          id: 'rep-1',
          title: 'Range Metric',
          description: 'Span of min to max',
          mechanism: 'Max - Min',
          structuralFeaturesIdentified: ['boundary extremes', 'simplicity'],
          assumptions: ['Extremes dictate spread'],
          limitationsEncountered: ['Outlier distortion'],
          intuitivePlausibilityScore: 70,
          formalValidityScore: 40,
        },
        {
          id: 'rep-2',
          title: 'Raw Differences',
          description: 'Sum of differences from mean',
          mechanism: 'Sum of (x - mu)',
          structuralFeaturesIdentified: ['deviation from center', 'mean balance'],
          assumptions: ['Differences sum up'],
          limitationsEncountered: ['Zero balance cancellation'],
          intuitivePlausibilityScore: 80,
          formalValidityScore: 20,
        },
        {
          id: 'rep-3',
          title: 'Mean Absolute Deviation',
          description: 'Average absolute distance',
          mechanism: 'Mean of |x - mu|',
          structuralFeaturesIdentified: ['absolute magnitude', 'symmetric distance'],
          assumptions: ['Distance without direction'],
          limitationsEncountered: ['Non-differentiable at zero'],
          intuitivePlausibilityScore: 90,
          formalValidityScore: 80,
        },
      ]

      const impasse: ImpasseAnalysis = {
        impasseEncountered: true,
        failureModeIdentified: 'Summing raw deviations cancels to exactly zero',
        boundaryConditionsTested: ['Outliers at infinity', 'Zero difference', 'Negative values'],
        knowledgeGapArticulated:
          'Need a way to eliminate negative signs that is smooth and differentiable in calculus',
        affectiveImpasseRating: 5,
        impasseDepthScore: 90,
      }

      const metrics = calculatePFMetrics({
        representations,
        impasse,
        consolidationRatings: {
          featureAlignment: 95,
          parameterMapping: 90,
          invariantGrasp: 90,
        },
        transferResults: [
          { probeId: 'tp-1', isCorrect: true, confidence: 5 },
          { probeId: 'tp-2', isCorrect: true, confidence: 5 },
          { probeId: 'tp-3', isCorrect: true, confidence: 5 },
        ],
      })

      expect(metrics.generationDiversityIndex).toBeGreaterThanOrEqual(0.6)
      expect(metrics.impasseSensitivityScore).toBeGreaterThanOrEqual(60)
      expect(metrics.consolidationIntegrationGain).toBeGreaterThanOrEqual(85)
      expect(metrics.adaptiveTransferScore).toBe(100)
      expect(metrics.productiveFailureIndex).toBeGreaterThanOrEqual(85)
      expect(metrics.masteryBand).toBe('Master Adaptive Transferer')
      expect(metrics.failureToMasteryRatio).toBeGreaterThan(1.0)
      expect(metrics.qualitativeFeedback).toContain('Outstanding Productive Failure trajectory')
    })

    it('computes Consolidated Thinker metrics for solid understanding with moderate transfer', () => {
      const representations: StudentGeneratedRepresentation[] = [
        {
          id: 'rep-1',
          title: 'Range Metric',
          description: 'Span of min to max',
          mechanism: 'Max - Min',
          structuralFeaturesIdentified: ['boundary extremes'],
          assumptions: ['Extremes dictate spread'],
          limitationsEncountered: ['Outlier distortion'],
          intuitivePlausibilityScore: 70,
          formalValidityScore: 40,
        },
        {
          id: 'rep-2',
          title: 'Mean Absolute Deviation',
          description: 'Average absolute distance',
          mechanism: 'Mean of |x - mu|',
          structuralFeaturesIdentified: ['absolute magnitude'],
          assumptions: ['Distance without direction'],
          limitationsEncountered: ['Non-differentiable at zero'],
          intuitivePlausibilityScore: 80,
          formalValidityScore: 70,
        },
      ]

      const impasse: ImpasseAnalysis = {
        impasseEncountered: true,
        failureModeIdentified: 'Range ignores internal distribution',
        boundaryConditionsTested: ['Outliers'],
        knowledgeGapArticulated: 'Need a metric incorporating all points',
        affectiveImpasseRating: 3,
        impasseDepthScore: 70,
      }

      const metrics = calculatePFMetrics({
        representations,
        impasse,
        consolidationRatings: {
          featureAlignment: 75,
          parameterMapping: 70,
          invariantGrasp: 70,
        },
        transferResults: [
          { probeId: 'tp-1', isCorrect: true, confidence: 4 },
          { probeId: 'tp-2', isCorrect: true, confidence: 3 },
          { probeId: 'tp-3', isCorrect: false, confidence: 2 },
        ],
      })

      expect(metrics.masteryBand).toBe('Consolidated Thinker')
      expect(metrics.productiveFailureIndex).toBeGreaterThanOrEqual(60)
      expect(metrics.productiveFailureIndex).toBeLessThan(85)
    })

    it('computes Developing Explorer metrics when transfer is low', () => {
      const representations: StudentGeneratedRepresentation[] = [
        {
          id: 'rep-1',
          title: 'Single Master',
          description: 'Master server',
          mechanism: 'Central coordinator',
          structuralFeaturesIdentified: ['central coordination'],
          assumptions: ['Master does not fail'],
          limitationsEncountered: ['Single point of failure'],
          intuitivePlausibilityScore: 60,
          formalValidityScore: 30,
        },
      ]

      const impasse: ImpasseAnalysis = {
        impasseEncountered: true,
        failureModeIdentified: 'Master crash causes outage',
        boundaryConditionsTested: ['Crash'],
        knowledgeGapArticulated: 'Need failover',
        affectiveImpasseRating: 2,
        impasseDepthScore: 50,
      }

      const metrics = calculatePFMetrics({
        representations,
        impasse,
        consolidationRatings: {
          featureAlignment: 50,
          parameterMapping: 50,
          invariantGrasp: 50,
        },
        transferResults: [
          { probeId: 'tp-1', isCorrect: true, confidence: 3 },
          { probeId: 'tp-2', isCorrect: false, confidence: 1 },
          { probeId: 'tp-3', isCorrect: false, confidence: 1 },
        ],
      })

      expect(metrics.masteryBand).toBe('Developing Explorer')
      expect(metrics.productiveFailureIndex).toBeGreaterThanOrEqual(35)
    })

    it('handles Novice Intuition / boundary conditions (0 representations, no impasse)', () => {
      const impasse: ImpasseAnalysis = {
        impasseEncountered: false,
        failureModeIdentified: 'None',
        boundaryConditionsTested: [],
        knowledgeGapArticulated: '',
        affectiveImpasseRating: 1,
        impasseDepthScore: 0,
      }

      const metrics = calculatePFMetrics({
        representations: [],
        impasse,
        consolidationRatings: {
          featureAlignment: 20,
          parameterMapping: 20,
          invariantGrasp: 20,
        },
        transferResults: [],
      })

      expect(metrics.generationDiversityIndex).toBe(0)
      expect(metrics.impasseSensitivityScore).toBe(0)
      expect(metrics.adaptiveTransferScore).toBe(0)
      expect(metrics.masteryBand).toBe('Novice Intuition')
      expect(metrics.qualitativeFeedback).toContain('Premature closure observed')
    })
  })

  describe('Representation Authoring & Evaluation', () => {
    it('evaluates student representation against canonical scenario features', () => {
      const evaluated = evaluateStudentRepresentation('pf-variance-dispersion', {
        title: 'Outlier Squared Distance',
        description: 'Squaring the distance from the average so outliers are magnified',
        mechanism: 'Squared Euclidean distance from center of mass',
        structuralFeatures: ['outlier sensitivity', 'deviation from center'],
      })

      expect(evaluated.id).toBeTruthy()
      expect(evaluated.title).toBe('Outlier Squared Distance')
      expect(evaluated.structuralFeaturesIdentified.length).toBeGreaterThanOrEqual(2)
      expect(evaluated.intuitivePlausibilityScore).toBeGreaterThanOrEqual(70)
      expect(evaluated.formalValidityScore).toBeGreaterThanOrEqual(50)
    })
  })

  describe('FSRS-6 Dynamic Deck Calibration', () => {
    it('calibrates initial stability and difficulty based on PFI and CIG', () => {
      const scenario = getCanonicalPFScenarios()[0]
      const highMetrics = calculatePFMetrics({
        representations: scenario.exemplarStudentRepresentations,
        impasse: {
          impasseEncountered: true,
          failureModeIdentified: 'Zero cancellation',
          boundaryConditionsTested: ['Outliers', 'Zeros'],
          knowledgeGapArticulated: 'Need smooth magnitude metric',
          affectiveImpasseRating: 5,
          impasseDepthScore: 90,
        },
        consolidationRatings: {
          featureAlignment: 90,
          parameterMapping: 90,
          invariantGrasp: 90,
        },
        transferResults: [
          { probeId: 'tp-1', isCorrect: true, confidence: 5 },
          { probeId: 'tp-2', isCorrect: true, confidence: 5 },
          { probeId: 'tp-3', isCorrect: true, confidence: 5 },
        ],
      })

      const cards = generatePFFSRSCards(scenario, highMetrics)
      expect(cards.length).toBe(scenario.seedCards.length)

      for (const card of cards) {
        // High PFI (> 85) leads to higher initial stability (> 3.5 days)
        expect(card.initialStabilityDays).toBeGreaterThanOrEqual(3.0)
        // High CIG (90) leads to lower difficulty (< 5.0)
        expect(card.initialDifficulty).toBeLessThanOrEqual(5.0)
      }
    })
  })

  describe('Zod Schema Enum Integrity', () => {
    it('verifies all PFPhaseEnum values', () => {
      expect(PFPhaseEnum.options).toEqual([
        'exploration',
        'impasse',
        'consolidation',
        'transfer',
        'reflection',
      ])
    })

    it('verifies all PFTransferDistanceEnum values', () => {
      expect(PFTransferDistanceEnum.options).toEqual(['near', 'medium', 'far'])
    })

    it('verifies all ConceptualDepthEnum values', () => {
      expect(ConceptualDepthEnum.options).toEqual(['intuitive', 'impasse', 'canonical', 'transfer'])
    })

    it('verifies all AlignmentStatusEnum values', () => {
      expect(AlignmentStatusEnum.options).toEqual(['convergent', 'divergent', 'incomplete'])
    })

    it('verifies all PFMasteryBandEnum values', () => {
      expect(PFMasteryBandEnum.options).toEqual([
        'Novice Intuition',
        'Developing Explorer',
        'Consolidated Thinker',
        'Master Adaptive Transferer',
      ])
    })
  })
})

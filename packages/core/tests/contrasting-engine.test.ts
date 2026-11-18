/**
 * @file packages/core/tests/contrasting-engine.test.ts
 * @description Unit tests for Contrasting Cases & Inventing with Examples Engine.
 */

import { describe, expect, it } from 'vitest'
import {
  CANONICAL_CONTRASTING_SETS,
  evaluateContrastingAttempt,
  generateContrastingFSRSDeck,
  type InventedMetricSubmission,
} from '../src/contrasting/contrasting-engine'

describe('Contrasting Cases & Inventing with Examples Engine', () => {
  it('loads all 5 canonical contrasting case sets with complete schemas', () => {
    expect(CANONICAL_CONTRASTING_SETS).toHaveLength(5)
    for (const set of CANONICAL_CONTRASTING_SETS) {
      expect(set.id).toBeDefined()
      expect(set.title).toBeDefined()
      expect(set.variants.length).toBeGreaterThanOrEqual(4)
      expect(set.dimensions.length).toBeGreaterThanOrEqual(4)
      expect(set.canonicalTelling.formalEquation).toBeDefined()
      expect(set.transferChallenge.options).toHaveLength(4)
    }
  })

  it('evaluates expert invention with high FDRS, IMI, PFRI, and canonical synthesizer band', () => {
    const set = CANONICAL_CONTRASTING_SETS[0]! // set-density-buoyancy
    const submission: InventedMetricSubmission = {
      setId: set.id,
      inventedMetricName: 'Packing Ratio (Mass divided by Space)',
      formulaDescription:
        'We divide total mass by total volume (m / V). If the resulting number is greater than 1.0 g/cm³, the cylinder sinks; if less than 1.0, it floats.',
      selectedDimensionIds: ['dim-mass-vol-ratio', 'dim-displacement-equilibrium'],
      // Canonical order: D (0.16) < F (0.40) < A (0.75) < E (1.00) < C (2.70) < B (11.30)
      variantRankings: [
        'cyl-balsa-disc',
        'cyl-hollow-steel',
        'cyl-oak-block',
        'cyl-neutral-gel',
        'cyl-aluminum-rod',
        'cyl-lead-bullet',
      ],
      impasseEncountered: true,
      reflectionNotes:
        'Initially, Cylinder B seemed lightest at 113g compared to 600g Oak, but Lead sank instantly because its volume is so tiny. Only the intensive ratio mass/volume preserves consistent floatation ordering.',
    }

    const evaluation = evaluateContrastingAttempt(set, submission)

    expect(evaluation.fdrs).toBe(100)
    expect(evaluation.rankingAccuracy).toBe(100)
    expect(evaluation.imi).toBe(100)
    expect(evaluation.pfri).toBe(100)
    expect(evaluation.cdts).toBe(100)
    expect(evaluation.maturityBand).toBe('canonical_synthesizer')
    expect(evaluation.superficialDistractorsChosen).toHaveLength(0)
    expect(evaluation.strengths.length).toBeGreaterThanOrEqual(2)
  })

  it('penalizes superficial feature distractors and ranking errors', () => {
    const set = CANONICAL_CONTRASTING_SETS[0]!
    const naiveSubmission: InventedMetricSubmission = {
      setId: set.id,
      inventedMetricName: 'Heaviness Rule',
      formulaDescription: 'Heavy things sink and light things float.',
      selectedDimensionIds: ['dim-absolute-weight', 'dim-geometric-shape'],
      variantRankings: [
        'cyl-balsa-disc',
        'cyl-lead-bullet', // misplaced: thinks 113g floats because it is light
        'cyl-neutral-gel',
        'cyl-hollow-steel',
        'cyl-aluminum-rod',
        'cyl-oak-block',
      ],
      impasseEncountered: false,
      reflectionNotes: 'Short note.',
    }

    const evaluation = evaluateContrastingAttempt(set, naiveSubmission)

    expect(evaluation.fdrs).toBe(0)
    expect(evaluation.superficialDistractorsChosen.length).toBe(2)
    expect(evaluation.cdts).toBeLessThan(50)
    expect(evaluation.maturityBand).toBe('superficial_observer')
    expect(evaluation.vulnerabilities.length).toBeGreaterThanOrEqual(1)
  })

  it('generates calibrated FSRS-6 review deck scaled by CDTS', () => {
    const set = CANONICAL_CONTRASTING_SETS[1]! // set-variability-dispersion
    const submission: InventedMetricSubmission = {
      setId: set.id,
      inventedMetricName: 'Squared Scatter Metric',
      formulaDescription:
        'Square every distance from zero, average them across all 10 pitches, and take the square root.',
      selectedDimensionIds: ['dim-squared-distance-penalty', 'dim-sample-dispersion-normalization'],
      variantRankings: [
        'pitcher-delta-precision',
        'pitcher-beta-uniform',
        'pitcher-alpha-cluster',
        'pitcher-gamma-bimodal',
      ],
      impasseEncountered: true,
      reflectionNotes:
        'A single wild 20-inch pitch causes extreme risk, so squaring distances penalizes wild unpredictability appropriately.',
    }

    const evaluation = evaluateContrastingAttempt(set, submission)
    const deck = generateContrastingFSRSDeck(set, evaluation)

    expect(deck.setId).toBe('set-variability-dispersion')
    expect(deck.cdtsBaseline).toBe(evaluation.cdts)
    expect(deck.cards).toHaveLength(4)

    const cardTypes = deck.cards.map((c) => c.cardType)
    expect(cardTypes).toContain('perceptual_differentiation')
    expect(cardTypes).toContain('invariant_ratio')
    expect(cardTypes).toContain('canonical_telling')
    expect(cardTypes).toContain('transfer_application')

    // High CDTS yields high stability and low difficulty
    expect(deck.cards[0]!.fsrsParameters.stability).toBeGreaterThanOrEqual(5.0)
    expect(deck.cards[0]!.fsrsParameters.difficulty).toBeLessThanOrEqual(5.5)
  })
})

/**
 * Unit Tests for the Prototype & Exemplar Categorization Engine
 *
 * Verifies:
 * 1. Canonical category sets integrity and schema compliance
 * 2. Distance/similarity math (Minkowski r=1 vs r=2, exponential gradient)
 * 3. Prototype, GCM and explicit-rule classification probabilities
 * 4. Family resemblance & predicted typicality gradients (Rosch & Mervis 1975)
 * 5. Deterministic model fitting (GCM grid search, prototype fit, AIC/BIC)
 * 6. Session evaluation: TSC/CTS/MCD/CRI, maturity bands, divergent items
 * 7. Discriminating trial planner determinism and diagnostic ordering
 * 8. FSRS deck synthesis scaled by CRI
 * 9. Schema rejections at the submission boundary
 */

import { describe, expect, it } from 'vitest'
import {
  BIRD_TYPICALITY_SET,
  CANONICAL_CATEGORIZATION_SETS,
  FIVE_FOUR_STRUCTURE_SET,
  NOSOFSKY_ATTENTION_SET,
  PROTOTYPE_DISTORTION_SET,
  RULE_BOUNDARY_SET,
  categorySetSchema,
  computePrototypeVector,
  evaluateCategorizationSession,
  exponentialSimilarity,
  familyResemblance,
  findCategorySet,
  fitGcmParameters,
  fitPrototypeParameters,
  generateCategorizationDeck,
  gcmProbabilityA,
  minkowskiDistance,
  pearsonCorrelation,
  planDiscriminatingBlock,
  predictedTypicalityRating,
  prototypeProbabilityA,
  ruleProbabilityA,
  type CategorizationSubmissionInput,
} from '../src/prototype-exemplar'

const UNIFORM_2 = [0.5, 0.5]
const UNIFORM_4 = [0.25, 0.25, 0.25, 0.25]

/** Normative-consistent ratings + fully correct classifications on the bird set. */
const GOOD_BIRD_SUBMISSION: CategorizationSubmissionInput = {
  setId: BIRD_TYPICALITY_SET.id,
  typicalityRatings: {
    'bird-robin-old': 1,
    'bird-eagle': 2,
    'bird-chicken-old': 4,
    'bird-penguin-old': 5,
  },
  classifications: {
    'bird-robin-old': 'A',
    'bird-chicken-old': 'A',
    'bird-penguin-old': 'A',
    'bird-bat-old': 'B',
    'bird-eagle': 'A',
    'bird-dove': 'A',
    'bird-kiwi': 'A',
    'bird-butterfly': 'B',
    'bird-moth': 'B',
  },
}

describe('canonical category sets', () => {
  it('exposes exactly 5 schema-valid sets with unique ids', () => {
    expect(CANONICAL_CATEGORIZATION_SETS).toHaveLength(5)
    const ids = CANONICAL_CATEGORIZATION_SETS.map((s) => s.id)
    expect(new Set(ids).size).toBe(5)
    for (const set of CANONICAL_CATEGORIZATION_SETS) {
      expect(categorySetSchema.parse(set)).toBeTruthy()
      expect(set.studyItems.length).toBeGreaterThanOrEqual(5)
      expect(set.testItems.length).toBeGreaterThanOrEqual(7)
      expect(set.testItems.some((s) => s.isTransfer)).toBe(true)
      expect(set.dimensionLabels.length).toBe(set.studyItems[0]!.features.length)
    }
  })

  it('includes every designed scenario', () => {
    expect(BIRD_TYPICALITY_SET.structureKind).toBe('natural_typicality')
    expect(PROTOTYPE_DISTORTION_SET.structureKind).toBe('artificial_dimensional')
    expect(FIVE_FOUR_STRUCTURE_SET.structureKind).toBe('binary_structure')
    expect(NOSOFSKY_ATTENTION_SET.structureKind).toBe('artificial_dimensional')
    expect(RULE_BOUNDARY_SET.decisionRule).toBeDefined()
  })

  it('findCategorySet falls back to the first canonical set', () => {
    expect(findCategorySet('proto-54-structure').id).toBe('proto-54-structure')
    expect(findCategorySet('does-not-exist').id).toBe(BIRD_TYPICALITY_SET.id)
  })
})

describe('distance & similarity math', () => {
  it('computes weighted Minkowski distances (r=1 city-block vs r=2 euclidean)', () => {
    // |Δ| = [1, 0.5], uniform weights: r=1 → 0.75, r=2 → sqrt(0.625)
    expect(minkowskiDistance([1, 0], [0, 0.5], 1, UNIFORM_2)).toBeCloseTo(0.75, 6)
    expect(minkowskiDistance([1, 0], [0, 0.5], 2, UNIFORM_2)).toBeCloseTo(Math.sqrt(0.625), 6)
  })

  it('normalizes weights that do not sum to 1', () => {
    // weights [2, 2] behave like [0.5, 0.5]
    expect(minkowskiDistance([1, 0], [0, 0.5], 1, [2, 2])).toBeCloseTo(0.75, 6)
    // zero-sum weights fall back to uniform
    expect(minkowskiDistance([1, 0], [0, 0.5], 1, [0, 0])).toBeCloseTo(0.75, 6)
  })

  it('applies the exponential similarity gradient η = exp(−c·d)', () => {
    expect(exponentialSimilarity(0, 3)).toBe(1)
    expect(exponentialSimilarity(0.5, 3)).toBeCloseTo(Math.exp(-1.5), 6)
    expect(exponentialSimilarity(2, 0.5)).toBeCloseTo(Math.exp(-1), 6)
  })
})

describe('representation models', () => {
  it('computes the category prototype as the per-dimension mean', () => {
    expect(
      computePrototypeVector([
        [0, 1, 0.4],
        [1, 1, 0.6],
        [1, 1, 0.2],
      ]),
    ).toEqual([2 / 3, 1, 0.4])
    expect(computePrototypeVector([])).toEqual([])
  })

  it('returns 0.5 for items equidistant from both categories (GCM & prototype)', () => {
    const params = { c: 3, r: 1 as const, weights: UNIFORM_2, gamma: 1 }
    expect(gcmProbabilityA([0.5, 0.5], [[0, 0]], [[1, 1]], params)).toBe(0.5)
    expect(prototypeProbabilityA([0.5, 0.5], [0, 0], [1, 1], params)).toBe(0.5)
  })

  it('classifies confidently toward the nearer category', () => {
    const params = { c: 3, r: 1 as const, weights: UNIFORM_2, gamma: 1 }
    expect(gcmProbabilityA([0.1, 0.1], [[0, 0]], [[1, 1]], params)).toBeGreaterThan(0.9)
    expect(prototypeProbabilityA([0.1, 0.1], [0, 0], [1, 1], params)).toBeGreaterThan(0.9)
    expect(prototypeProbabilityA([0.9, 0.9], [0, 0], [1, 1], params)).toBeLessThan(0.1)
  })

  it('responds to attention weights (Nosofsky 1986)', () => {
    // Conflict probe [0.3, 0.7]: attending to size → A; brightness → B.
    const sizeWeights = { c: 3, r: 1 as const, weights: [1, 0.0001], gamma: 1 }
    const brightWeights = { c: 3, r: 1 as const, weights: [0.0001, 1], gamma: 1 }
    const gcmPASize = gcmProbabilityA([0.3, 0.7], [[0.2, 0.2]], [[0.7, 0.7]], sizeWeights)
    const gcmPABright = gcmProbabilityA([0.3, 0.7], [[0.2, 0.2]], [[0.7, 0.7]], brightWeights)
    expect(gcmPASize).toBeGreaterThan(0.9)
    expect(gcmPABright).toBeLessThan(0.1)
  })

  it('applies the explicit rule deterministically, including the threshold edge', () => {
    const rule = RULE_BOUNDARY_SET.decisionRule!
    expect(ruleProbabilityA([0.6, 0.2], rule)).toBe(1)
    expect(ruleProbabilityA([0.4, 0.2], rule)).toBe(0)
    expect(ruleProbabilityA([0.5, 0.9], rule)).toBe(1) // ≥ threshold routes to A
    const belowRule = { ...rule, direction: 'below' as const, categoryIfTrue: 'B' as const }
    expect(ruleProbabilityA([0.3, 0], belowRule)).toBe(1) // < threshold routes to B
    expect(ruleProbabilityA([0.7, 0], belowRule)).toBe(0)
  })
})

describe('family resemblance & predicted typicality', () => {
  const birdAFeatures = BIRD_TYPICALITY_SET.studyItems
    .filter((s) => s.category === 'A')
    .map((s) => s.features)
  const robin = birdAFeatures[0]!
  const ostrich = birdAFeatures[7]!

  it('scores Rosch-Mervis family resemblance as summed attribute sharing', () => {
    const others = birdAFeatures.filter((f) => f !== robin)
    // Robin shares flies/sings/perches/small with sparrow & bluejay, flies/perches
    // with hawk, flies with duck, and feathers with the rest = 5+5+3+1+2+1+1 = 18
    expect(familyResemblance(robin, others)).toBe(18)
    const ostrichOthers = birdAFeatures.filter((f) => f !== ostrich)
    // Ostrich shares only feathers with most members, feathers+long_legs with chicken
    expect(familyResemblance(ostrich, ostrichOthers)).toBe(8)
  })

  it('predicts the typicality gradient: robin far more central than ostrich', () => {
    const params = { c: 3, r: 1 as const, weights: new Array(10).fill(0.1), gamma: 1 }
    const robinRating = predictedTypicalityRating(
      robin,
      birdAFeatures,
      params,
      'family-resemblance',
    )
    const ostrichRating = predictedTypicalityRating(
      ostrich,
      birdAFeatures,
      params,
      'family-resemblance',
    )
    expect(robinRating).toBeLessThan(ostrichRating)
    expect(robinRating).toBeGreaterThanOrEqual(1)
    expect(ostrichRating).toBeLessThanOrEqual(7)
  })

  it('rates the never-seen 5-4 prototype as the single best category member', () => {
    const pool = FIVE_FOUR_STRUCTURE_SET.studyItems
      .filter((s) => s.category === 'A')
      .map((s) => s.features)
    const params = { c: 3, r: 1 as const, weights: UNIFORM_4, gamma: 1 }
    // FR(1111 vs pool) = 14 — strictly highest, so the unseen center maps to 1.
    expect(predictedTypicalityRating([1, 1, 1, 1], pool, params, 'family-resemblance')).toBe(1)
  })

  it('returns null correlation for degenerate series and exact r for clean ones', () => {
    expect(pearsonCorrelation([], [])).toBeNull()
    expect(pearsonCorrelation([1, 2], [3])).toBeNull()
    expect(pearsonCorrelation([1, 1, 1], [1, 2, 3])).toBeNull()
    expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6)
    expect(pearsonCorrelation([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 6)
  })
})

describe('deterministic model fitting', () => {
  const trials = [
    { features: [0.1, 0.1], chosen: 'A' as const },
    { features: [0.9, 0.9], chosen: 'B' as const },
    { features: [0.2, 0.3], chosen: 'A' as const },
    { features: [0.8, 0.7], chosen: 'B' as const },
  ]

  it('is deterministic: repeated fits produce identical statistics', () => {
    const fit1 = fitGcmParameters(
      trials,
      [
        [0.2, 0.2],
        [0.3, 0.3],
      ],
      [
        [0.8, 0.8],
        [0.7, 0.7],
      ],
      2,
    )
    const fit2 = fitGcmParameters(
      trials,
      [
        [0.2, 0.2],
        [0.3, 0.3],
      ],
      [
        [0.8, 0.8],
        [0.7, 0.7],
      ],
      2,
    )
    expect(JSON.stringify(fit1)).toBe(JSON.stringify(fit2))
    expect(fit1.parameters.c).toBeGreaterThan(0)
    expect(fit1.parameters.r).toBeGreaterThanOrEqual(1)
    expect(fit1.logLikelihood).toBeLessThanOrEqual(0)
  })

  it('fits category-consistent choices with near-zero loss and full agreement', () => {
    const fit = fitGcmParameters(
      trials,
      [
        [0.2, 0.2],
        [0.3, 0.3],
      ],
      [
        [0.8, 0.8],
        [0.7, 0.7],
      ],
      2,
    )
    expect(fit.agreement).toBe(1)
    expect(fit.logLikelihood).toBeGreaterThan(-0.5)
  })

  it('fits the prototype model and reports AIC/BIC with 2 free parameters', () => {
    const fit = fitPrototypeParameters(
      trials,
      [
        [0.2, 0.2],
        [0.3, 0.3],
      ],
      [
        [0.8, 0.8],
        [0.7, 0.7],
      ],
    )
    expect(fit.agreement).toBe(1)
    expect(fit.aic).toBeCloseTo(2 * 2 - 2 * fit.logLikelihood, 2)
  })

  it('handles empty trial lists without crashing', () => {
    const fit = fitGcmParameters([], [[0, 0]], [[1, 1]], 2)
    expect(fit.logLikelihood).toBe(0)
    expect(fit.agreement).toBe(0)
  })
})

describe('session evaluation', () => {
  it('returns the honest empty floor for an empty submission', () => {
    const evaluation = evaluateCategorizationSession(BIRD_TYPICALITY_SET, {
      setId: BIRD_TYPICALITY_SET.id,
    })
    expect(evaluation.typicalityReference).toBe('insufficient_ratings')
    expect(evaluation.tsc).toBe(0)
    expect(evaluation.cts).toBe(0)
    expect(evaluation.mcd).toBe(0)
    expect(evaluation.cri).toBe(0)
    expect(evaluation.maturityBand).toBe('featural_guesser')
    expect(evaluation.overallAccuracy).toBe(0)
    expect(evaluation.pedagogicalFeedback.length).toBeGreaterThan(0)
  })

  it('scores a normative-consistent, fully correct bird session highly', () => {
    const evaluation = evaluateCategorizationSession(BIRD_TYPICALITY_SET, GOOD_BIRD_SUBMISSION)
    expect(evaluation.typicalityReference).toBe('normative')
    expect(evaluation.tsc).toBeGreaterThanOrEqual(80)
    expect(evaluation.cts).toBe(100)
    expect(evaluation.transferAccuracy).toBe(100)
    expect(evaluation.overallAccuracy).toBe(100)
    expect(evaluation.cri).toBeGreaterThanOrEqual(70)
    expect(['boundary_tracer', 'dual_model_theorist']).toContain(evaluation.maturityBand)
    expect(evaluation.modelComparison.prototype.logLikelihood).toBeLessThanOrEqual(0)
    expect(evaluation.modelComparison.exemplar.logLikelihood).toBeLessThanOrEqual(0)
    expect(evaluation.modelComparison.betterRepresentation).toMatch(/prototype|exemplar|tie/)
    expect(evaluation.itemDiagnostics).toHaveLength(BIRD_TYPICALITY_SET.testItems.length)
    expect(evaluation.divergentItems.length).toBeLessThanOrEqual(4)
    // AIC (2k − 2LL) ≤ BIC (k·ln n − 2LL) once n > e² ≈ 7.39
    expect(evaluation.modelComparison.exemplar.bic).toBeGreaterThan(
      evaluation.modelComparison.exemplar.aic,
    )
    expect(evaluation.strengths.length).toBeGreaterThan(0)
  })

  it('reports rule consistency for rule-boundary sets and 0 free parameters', () => {
    const submission: CategorizationSubmissionInput = {
      setId: RULE_BOUNDARY_SET.id,
      typicalityRatings: {},
      classifications: {
        'rule-t-a1': 'A',
        'rule-t-b2': 'B',
        'rule-t-b4': 'B',
        'rule-t-near-a': 'A',
        'rule-t-near-b': 'B',
        'rule-t-extreme-a': 'A',
        'rule-t-extreme-b': 'B',
      },
    }
    const evaluation = evaluateCategorizationSession(RULE_BOUNDARY_SET, submission)
    expect(evaluation.modelComparison.ruleFit).toBeDefined()
    expect(evaluation.modelComparison.ruleFit!.agreement).toBe(1)
    expect(evaluation.cts).toBe(100)
  })

  it('rejects invalid submissions at the zod boundary', () => {
    expect(() =>
      evaluateCategorizationSession(BIRD_TYPICALITY_SET, {
        setId: BIRD_TYPICALITY_SET.id,
        typicalityRatings: { 'bird-robin-old': 0 },
      }),
    ).toThrow()
    expect(() =>
      evaluateCategorizationSession(BIRD_TYPICALITY_SET, {
        setId: BIRD_TYPICALITY_SET.id,
        typicalityRatings: { 'bird-robin-old': 8 },
      }),
    ).toThrow()
    expect(() =>
      evaluateCategorizationSession(BIRD_TYPICALITY_SET, {
        setId: BIRD_TYPICALITY_SET.id,
        classifications: { 'bird-robin-old': 'C' },
      } as unknown as CategorizationSubmissionInput),
    ).toThrow()
  })

  it('identifies divergent items where prototype and GCM disagree most', () => {
    const evaluation = evaluateCategorizationSession(RULE_BOUNDARY_SET, {
      setId: RULE_BOUNDARY_SET.id,
    })
    const divergences = evaluation.divergentItems.map((d) => d.divergence)
    for (let i = 1; i < divergences.length; i++) {
      expect(divergences[i]!).toBeLessThanOrEqual(divergences[i - 1]!)
    }
    // Divergence blends prototype-vs-GCM and rule-vs-GCM splits; the planner
    // test asserts the extreme probes surface as discriminating trials.
    expect(evaluation.divergentItems.length).toBeLessThanOrEqual(4)
    expect(evaluation.divergentItems.every((d) => d.divergence >= 0.15)).toBe(true)
  })
})

describe('discriminating trial planner', () => {
  it('produces a deterministic, descending-divergence plan with stable size', () => {
    const plan1 = planDiscriminatingBlock(RULE_BOUNDARY_SET, 6)
    const plan2 = planDiscriminatingBlock(RULE_BOUNDARY_SET, 6)
    expect(JSON.stringify(plan1)).toBe(JSON.stringify(plan2))
    expect(plan1.setId).toBe(RULE_BOUNDARY_SET.id)
    expect(plan1.trials).toHaveLength(6)
    for (let i = 1; i < plan1.trials.length; i++) {
      expect(plan1.trials[i]!.divergence).toBeLessThanOrEqual(plan1.trials[i - 1]!.divergence)
    }
    expect(plan1.trials.every((t) => t.rationale.length > 0)).toBe(true)
  })

  it('surfaces the near-boundary and extreme probes as model-discriminating trials', () => {
    const plan = planDiscriminatingBlock(RULE_BOUNDARY_SET, 6)
    const ids = plan.trials.map((t) => t.stimulusId)
    expect(ids).toContain('rule-t-near-a')
    expect(ids).toContain('rule-t-near-b')
    expect(ids).toContain('rule-t-extreme-a')
    expect(ids).toContain('rule-t-extreme-b')
  })

  it('clamps requested size to the available test items', () => {
    const plan = planDiscriminatingBlock(NOSOFSKY_ATTENTION_SET, 99)
    expect(plan.trials).toHaveLength(NOSOFSKY_ATTENTION_SET.testItems.length)
  })
})

describe('FSRS deck synthesis', () => {
  it('generates 4 deterministic cards of every phenomenon type', () => {
    const evaluation = evaluateCategorizationSession(BIRD_TYPICALITY_SET, {
      setId: BIRD_TYPICALITY_SET.id,
    })
    const deck = generateCategorizationDeck(BIRD_TYPICALITY_SET, evaluation)
    expect(deck.setId).toBe(BIRD_TYPICALITY_SET.id)
    expect(deck.cards).toHaveLength(4)
    expect(deck.cards.map((c) => c.cardType)).toEqual([
      'typicality_gradient',
      'prototype_abstraction',
      'exemplar_exception',
      'attention_strategy',
    ])
    for (const card of deck.cards) {
      expect(card.fsrsParameters.stability).toBeGreaterThanOrEqual(4)
      expect(card.fsrsParameters.stability).toBeLessThanOrEqual(9.2)
      expect(card.fsrsParameters.difficulty).toBeLessThanOrEqual(6.5)
      expect(card.fsrsParameters.difficulty).toBeGreaterThanOrEqual(4)
      expect(card.front).toContain(BIRD_TYPICALITY_SET.title)
    }
    expect(deck.criBaseline).toBe(evaluation.cri)
  })

  it('scales stability with CRI and difficulty inversely', () => {
    const low = evaluateCategorizationSession(BIRD_TYPICALITY_SET, {
      setId: BIRD_TYPICALITY_SET.id,
    })
    const highEval = evaluateCategorizationSession(BIRD_TYPICALITY_SET, GOOD_BIRD_SUBMISSION)
    const lowDeck = generateCategorizationDeck(BIRD_TYPICALITY_SET, low)
    const highDeck = generateCategorizationDeck(BIRD_TYPICALITY_SET, highEval)
    expect(highDeck.cards[0]!.fsrsParameters.stability).toBeGreaterThan(
      lowDeck.cards[0]!.fsrsParameters.stability,
    )
    expect(highDeck.cards[0]!.fsrsParameters.difficulty).toBeLessThan(
      lowDeck.cards[0]!.fsrsParameters.difficulty,
    )
  })
})

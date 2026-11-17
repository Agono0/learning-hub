/**
 * @file structural-invariance-engine.test.ts
 * @description Unit tests for Rohrer & Taylor (2007) interleaving, Kornell & Bjork
 * (2008) inductive discrimination, and Gick & Holyoak (1983) surface vs structural
 * feature separation in the structural invariance engine.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_INVARIANCE_CATEGORIES,
  CALIBRATED_INVARIANCE_PROBLEMS,
  computeCategoryContrastMatrix,
  computeDiscriminationTelemetry,
  computeSequenceMetrics,
  exportFSRSInterleavingDeck,
  featureVectorDistance,
  generateContrastSchedule,
  ProblemCategory,
  ProblemTemplate,
  StructuralInvarianceSession,
} from '../src/interleaving/structural-invariance-engine'

const categories = CALIBRATED_INVARIANCE_CATEGORIES
const problems = CALIBRATED_INVARIANCE_PROBLEMS

describe('Feature-vector distance (Gick & Holyoak 1983)', () => {
  it('returns 0 for identical vectors and 1 for disjoint vectors', () => {
    const a = { context: 'pool', entity: 'pipes' }
    expect(featureVectorDistance(a, { ...a })).toBe(0)
    expect(featureVectorDistance(a, { context: 'clinic', entity: 'medication' })).toBe(1)
  })

  it('returns fractional distances for partially overlapping vectors, symmetrically', () => {
    // 2 shared tokens (context, quantity) over a union of 4 → distance 0.5.
    const a = { context: 'pool', entity: 'pipes', quantity: 'time' }
    const b = { context: 'pool', entity: 'students', quantity: 'time' }
    const d1 = featureVectorDistance(a, b)
    const d2 = featureVectorDistance(b, a)
    expect(d1).toBeCloseTo(0.5, 5)
    expect(d1).toBe(d2)
  })

  it('treats two empty vectors as identical and empty vs non-empty as maximally distant', () => {
    expect(featureVectorDistance({}, {})).toBe(0)
    expect(featureVectorDistance({}, { a: '1' })).toBe(1)
  })
})

describe('Category contrast matrix (Carvalho & Goldstone 2014)', () => {
  it('produces one cell per unordered category pair', () => {
    const cells = computeCategoryContrastMatrix(categories, problems)
    expect(cells).toHaveLength((categories.length * (categories.length - 1)) / 2)
  })

  it('reports maximal structural distance for all calibrated pairs (distinct invariants)', () => {
    const cells = computeCategoryContrastMatrix(categories, problems)
    for (const cell of cells) {
      expect(cell.structuralDistance).toBe(1)
      expect(cell.contrastUtility).toBeCloseTo(1 - cell.surfaceDistance, 5)
    }
  })

  it('counter-balanced families keep every pair superficially tied but never identical', () => {
    // Each category pair shares exactly one same-family problem pair per family,
    // so surface distance lands strictly between 0.8 and 1.
    const cells = computeCategoryContrastMatrix(categories, problems)
    for (const cell of cells) {
      expect(cell.surfaceDistance).toBeGreaterThan(0.8)
      expect(cell.surfaceDistance).toBeLessThan(1)
      expect(cell.contrastUtility).toBeGreaterThan(0)
    }
  })
})

describe('Contrast schedule generation (Rohrer & Taylor 2007)', () => {
  it('interleaves: never places all members of a category consecutively', () => {
    const { schedule, metrics } = generateContrastSchedule(problems, categories, {
      mode: 'interleaved',
    })
    expect(schedule).toHaveLength(problems.length)
    expect(metrics.blockingFactor).toBe(0)
    expect(metrics.categoryEntropy).toBe(1)
    expect(metrics.transitionCount).toBe(problems.length - 1)
  })

  it('blocks: the comparator mode groups all same-category items together', () => {
    const { schedule, metrics } = generateContrastSchedule(problems, categories, {
      mode: 'blocked',
    })
    expect(metrics.blockingFactor).toBeGreaterThan(0.6)
    expect(metrics.categoryEntropy).toBe(1)
    // every category appears as exactly one contiguous run
    const seenRuns: string[] = []
    for (const t of schedule) {
      if (seenRuns[seenRuns.length - 1] !== t.categoryId) seenRuns.push(t.categoryId)
    }
    expect(seenRuns).toHaveLength(categories.length)
    expect(new Set(seenRuns).size).toBe(categories.length)
  })

  it('interleaving multiplies total contrast exposure and spacing lag over blocking', () => {
    // Kornell & Bjork's (2008) comparison: blocking *looks* cleaner, but the
    // shuffled sequence forces ~4x more category-discrimination transitions.
    const inter = generateContrastSchedule(problems, categories, { mode: 'interleaved' })
    const blocked = generateContrastSchedule(problems, categories, { mode: 'blocked' })

    const exposure = (m: typeof inter.metrics) => m.meanAdjacentContrast * m.transitionCount
    expect(exposure(inter.metrics)).toBeGreaterThan(exposure(blocked.metrics))
    expect(inter.metrics.meanCategoryLag).toBeGreaterThan(blocked.metrics.meanCategoryLag)
  })

  it('is deterministic for identical inputs', () => {
    const a = generateContrastSchedule(problems, categories, { mode: 'interleaved' })
    const b = generateContrastSchedule(problems, categories, { mode: 'interleaved' })
    expect(a.schedule.map((t) => t.id)).toEqual(b.schedule.map((t) => t.id))
  })

  it('computeSequenceMetrics works on an arbitrary reordering', () => {
    const shuffled: ProblemTemplate[] = [...problems].reverse()
    const metrics = computeSequenceMetrics(shuffled, categories, problems)
    expect(metrics.transitionCount).toBe(shuffled.length - 1)
    expect(metrics.blockingFactor).toBe(0)
    expect(metrics.meanAdjacentContrast).toBeGreaterThan(0)
  })
})

describe('StructuralInvarianceSession drill (Kornell & Bjork 2008)', () => {
  it('walks the schedule, records attempts, and tracks accuracy', () => {
    const session = new StructuralInvarianceSession(categories, problems, { mode: 'interleaved' })
    const first = session.getCurrentProblem()!
    expect(first).toBeDefined()

    let correctCount = 0
    while (!session.isComplete()) {
      const problem = session.getCurrentProblem()!
      // answer the first problem wrong, the rest right
      const choice = problem === first ? 'partwhole_proportion' : problem.categoryId
      if (session.answer(choice, 1200)) correctCount++
    }

    const state = session.getState()
    expect(state.attempts).toHaveLength(problems.length)
    expect(state.practiceAccuracy).toBeCloseTo(correctCount / problems.length, 5)
    expect(session.getCurrentProblem()).toBeNull()
  })

  it('restart regenerates the schedule and clears attempts', () => {
    const session = new StructuralInvarianceSession(categories, problems)
    session.answer(categories[0]!.id)
    session.restart({ mode: 'blocked' })
    const state = session.getState()
    expect(state.attempts).toHaveLength(0)
    expect(state.cursor).toBe(0)
    expect(state.schedule[0]!.categoryId).toBe(categories[0]!.id)
  })
})

describe('Discrimination telemetry and confusion matrix', () => {
  it('builds the confusion matrix with diagonal = correct picks', () => {
    const session = new StructuralInvarianceSession(categories, problems, { mode: 'blocked' })
    while (!session.isComplete()) {
      const problem = session.getCurrentProblem()!
      session.answer(problem.categoryId, 1000)
    }
    const telemetry = computeDiscriminationTelemetry(
      session.getState().attempts,
      categories,
      problems,
    )

    expect(telemetry.totalAttempts).toBe(problems.length)
    expect(telemetry.accuracy).toBe(1)
    expect(telemetry.surfaceBiasScore).toBe(0) // no errors → no bias
    expect(telemetry.topConfusions).toHaveLength(0)
    expect(telemetry.meanReactionMs).toBe(1000)
    for (const recall of telemetry.perCategoryRecall) {
      expect(recall.recall).toBe(1)
    }
  })

  it('scores zero surface bias on the counter-balanced curriculum (structure vs surface separable)', () => {
    // Err on the pipes/pool rate problem toward the pipes/pipes inclusion
    // problem's category: both distances tie by design, so no lure is flagged.
    const poolProblem = problems.find((p) => p.id === 'rate_pipes_pool')!
    expect(poolProblem).toBeDefined()

    const telemetry = computeDiscriminationTelemetry(
      [
        {
          problemId: poolProblem.id,
          trueCategoryId: 'rate_completion',
          chosenCategoryId: 'inclusion_exclusion',
        },
      ],
      categories,
      problems,
    )

    expect(telemetry.accuracy).toBe(0)
    expect(telemetry.topConfusions[0]).toMatchObject({
      trueCategoryId: 'rate_completion',
      chosenCategoryId: 'inclusion_exclusion',
      count: 1,
    })
    expect(telemetry.surfaceBiasScore).toBe(0)
  })

  it('detects surface clustering behind errors on unbalanced curricula', () => {
    const cats: ProblemCategory[] = [
      {
        id: 'alpha',
        label: 'Alpha Schema',
        deepPrinciple: 'Alpha invariant.',
        structuralSignature: { schema: 'alpha', key: 'a1', measure: 'ma', form: 'fa' },
        discriminationHint: 'Alpha hint.',
      },
      {
        id: 'beta',
        label: 'Beta Schema',
        deepPrinciple: 'Beta invariant.',
        structuralSignature: { schema: 'beta', key: 'b1', measure: 'mb', form: 'fb' },
        discriminationHint: 'Beta hint.',
      },
    ]
    const tpl: ProblemTemplate[] = [
      {
        id: 'pa1',
        categoryId: 'alpha',
        title: 'A1',
        prompt: 'A1?',
        surfaceFeatures: { theme: 'desert', prop: 'dunes' },
        structuralFeatures: { schema: 'alpha', key: 'a1', measure: 'ma', form: 'fa' },
        difficulty: 0.5,
      },
      {
        id: 'pa2',
        categoryId: 'alpha',
        title: 'A2',
        prompt: 'A2?',
        surfaceFeatures: { theme: 'ocean', prop: 'reef' },
        structuralFeatures: { schema: 'alpha', key: 'a1', measure: 'ma', form: 'fa' },
        difficulty: 0.5,
      },
      {
        id: 'pb1',
        categoryId: 'beta',
        title: 'B1',
        prompt: 'B1?',
        surfaceFeatures: { theme: 'desert', prop: 'dunes' },
        structuralFeatures: { schema: 'beta', key: 'b1', measure: 'mb', form: 'fb' },
        difficulty: 0.5,
      },
      {
        id: 'pb2',
        categoryId: 'beta',
        title: 'B2',
        prompt: 'B2?',
        surfaceFeatures: { theme: 'desert', prop: 'dunes' },
        structuralFeatures: { schema: 'beta', key: 'b1', measure: 'mb', form: 'fb' },
        difficulty: 0.5,
      },
      {
        id: 'pb3',
        categoryId: 'beta',
        title: 'B3',
        prompt: 'B3?',
        surfaceFeatures: { theme: 'ocean', prop: 'trench' },
        structuralFeatures: { schema: 'beta', key: 'b1', measure: 'mb', form: 'fb' },
        difficulty: 0.5,
      },
    ]

    // The desert/dunes surface clusters inside beta (2 of 3 members), so
    // answering beta for the alpha desert problem is a surface-lured error.
    const telemetry = computeDiscriminationTelemetry(
      [{ problemId: 'pa1', trueCategoryId: 'alpha', chosenCategoryId: 'beta' }],
      cats,
      tpl,
    )
    expect(telemetry.surfaceBiasScore).toBe(1)
  })
})

describe('FSRS interleaving deck export', () => {
  it('exports one identification card per problem with invariant on the back', () => {
    const cards = exportFSRSInterleavingDeck(problems, categories, 0.25)
    expect(cards).toHaveLength(problems.length)

    for (const card of cards) {
      expect(card.front).toContain('[Structural Invariance: identify the deep principle]')
      expect(card.back).toContain('**Invariant:**')
      expect(card.back).toContain('**Discrimination hint:**')
      expect(card.tags).toContain('interleaving')
      expect(card.suggestedInitialStability).toBeGreaterThan(0)
      expect(card.metadata.contrastUtility).toBeGreaterThan(0)
    }

    const pool = cards.find((c) => c.id === 'card_inv_rate_pipes_pool')!
    expect(pool.back).toContain('harmonic completion invariant')
    expect(pool.back).toContain('**Surface lure:**')
    expect(pool.metadata.domain).toBe('structural_invariance')
  })

  it('scales suggested difficulty with surface bias', () => {
    const clean = exportFSRSInterleavingDeck(problems, categories, 0)
    const biased = exportFSRSInterleavingDeck(problems, categories, 1)
    expect(biased[0]!.suggestedInitialDifficulty).toBeGreaterThan(
      clean[0]!.suggestedInitialDifficulty,
    )
  })
})

describe('Calibrated seed curriculum invariants', () => {
  it('counter-balances surface families across structural categories (orthogonality)', () => {
    // Every surface context that appears in 2+ problems must span 2+ categories:
    // keying on the story cannot predict the structure.
    const contextsByValue = new Map<string, Set<string>>()
    for (const p of problems) {
      const ctx = p.surfaceFeatures['context']!
      const set = contextsByValue.get(ctx) ?? new Set<string>()
      set.add(p.categoryId)
      contextsByValue.set(ctx, set)
    }
    const shared = [...contextsByValue.entries()].filter(([, cats]) => cats.size > 1)
    expect(shared.length).toBeGreaterThan(0)
    for (const [, cats] of contextsByValue) {
      expect(cats.size).toBeGreaterThan(1)
    }
  })

  it('gives every category exactly three problems with shared structural signatures', () => {
    for (const cat of categories) {
      const members = problems.filter((p) => p.categoryId === cat.id)
      expect(members).toHaveLength(3)
      for (const m of members) {
        expect(m.structuralFeatures['schema']).toBe(cat.structuralSignature['schema'])
        expect(m.structuralFeatures['invariant']).toBe(cat.structuralSignature['invariant'])
      }
    }
  })
})

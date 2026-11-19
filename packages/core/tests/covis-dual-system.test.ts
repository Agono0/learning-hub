import { describe, expect, it } from 'vitest'
import {
  calculateArbitrationGate,
  evaluateCovisSession,
  evaluateProceduralSystem,
  evaluateVerbalRule,
  generateCandidateRulePool,
  initProceduralState,
  updateProceduralState,
  type VerbalHypothesis,
} from '../src/categorization/covis-dual-system'

describe('explicit verbal hypothesis testing (Ashby 1998 PFC)', () => {
  it('evaluates unidimensional threshold rule with continuous confidence', () => {
    const rule: VerbalHypothesis = {
      id: 'test-rule-1',
      ruleType: 'unidimensional_threshold',
      dimensionIndex: 0,
      threshold: 0.5,
      direction: 'greater_than_or_equal',
      targetCategory: 'A',
      alternateCategory: 'B',
      description: 'Dim 1 >= 0.5 -> A',
      salienceWeight: 1.0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
    }

    // High feature value clearly above threshold
    const resA = evaluateVerbalRule(rule, [0.85, 0.1])
    expect(resA.choice).toBe('A')
    expect(resA.confidence).toBeGreaterThan(0.7)

    // Feature value below threshold
    const resB = evaluateVerbalRule(rule, [0.2, 0.9])
    expect(resB.choice).toBe('B')
    expect(resB.confidence).toBeGreaterThan(0.7)
  })

  it('evaluates 2D conjunctive rule requiring both criteria', () => {
    const conjRule: VerbalHypothesis = {
      id: 'test-rule-conj',
      ruleType: 'conjunctive_boundary',
      dimensionIndex: 0,
      secondaryDimensionIndex: 1,
      threshold: 0.5,
      secondaryThreshold: 0.5,
      direction: 'greater_than_or_equal',
      secondaryDirection: 'greater_than_or_equal',
      targetCategory: 'A',
      alternateCategory: 'B',
      description: 'Dim 1 >= 0.5 AND Dim 2 >= 0.5 -> A',
      salienceWeight: 0.7,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
    }

    // Both pass => A
    expect(evaluateVerbalRule(conjRule, [0.8, 0.8]).choice).toBe('A')
    // Only one passes => B
    expect(evaluateVerbalRule(conjRule, [0.8, 0.2]).choice).toBe('B')
    expect(evaluateVerbalRule(conjRule, [0.2, 0.8]).choice).toBe('B')
  })

  it('generates rich candidate rule pool covering dimensions and granularities', () => {
    const pool = generateCandidateRulePool(2, 'A', 'B', 0.0, 1.0, 4)
    expect(pool.length).toBeGreaterThan(10)
    expect(pool.some((r) => r.ruleType === 'unidimensional_threshold')).toBe(true)
    expect(pool.some((r) => r.ruleType === 'conjunctive_boundary')).toBe(true)
  })
})

describe('implicit procedural reinforcement learning (Ashby 1998 Striatum)', () => {
  it('updates procedural prototype centroids via dopamine prediction error', () => {
    const categories = ['A', 'B']
    let state = initProceduralState(categories, 2, 0.1, 2.0)

    // Initially at center [0.5, 0.5]
    expect(state.categoryCentroids['A']![0]).toBe(0.5)

    // Correct presentation of item [0.9, 0.9] belonging to Category A
    state = updateProceduralState(state, [0.9, 0.9], 'A', 'A', true)

    // Centroid for A should shift towards [0.9, 0.9]
    expect(state.categoryCentroids['A']![0]).toBeGreaterThan(0.5)
    expect(state.categoryCentroids['A']![1]).toBeGreaterThan(0.5)
  })

  it('computes procedural activation and confidence', () => {
    const categories = ['A', 'B']
    const state = initProceduralState(categories, 2, 0.1, 2.0)
    state.categoryCentroids['A'] = [0.9, 0.9]
    state.categoryCentroids['B'] = [0.1, 0.1]

    const evalA = evaluateProceduralSystem(state, [0.85, 0.85], categories)
    expect(evalA.choice).toBe('A')
    expect(evalA.confidence).toBeGreaterThan(0.6)

    const evalB = evaluateProceduralSystem(state, [0.15, 0.15], categories)
    expect(evalB.choice).toBe('B')
    expect(evalB.confidence).toBeGreaterThan(0.6)
  })
})

describe('COVIS arbitration & full session evaluation', () => {
  it('computes arbitration gate probability biasing towards higher trust system', () => {
    // Equal trust => 50% probability
    const eq = calculateArbitrationGate(0.5, 0.5)
    expect(eq.verbalGateProb).toBeCloseTo(0.5, 2)

    // High verbal trust => verbal wins
    const vWin = calculateArbitrationGate(0.8, 0.2)
    expect(vWin.verbalGateProb).toBeGreaterThan(0.8)
    expect(vWin.winningSystem).toBe('verbal')

    // High procedural trust => procedural wins
    const pWin = calculateArbitrationGate(0.2, 0.8)
    expect(pWin.verbalGateProb).toBeLessThan(0.2)
    expect(pWin.winningSystem).toBe('procedural')
  })

  it('evaluates session and detects rule switching on negative feedback', () => {
    // 6 stimuli where rule Dim1 >= 0.5 fails on stimulus 2 and 3
    const stimuli = [
      { id: 's1', features: [0.8, 0.2], correctCategory: 'A', participantChoice: 'A' },
      { id: 's2', features: [0.9, 0.1], correctCategory: 'B', participantChoice: 'B' }, // violates Dim1 >= 0.5 rule
      { id: 's3', features: [0.85, 0.1], correctCategory: 'B', participantChoice: 'B' }, // consecutive failure => trigger switch
      { id: 's4', features: [0.2, 0.9], correctCategory: 'A', participantChoice: 'A' },
      { id: 's5', features: [0.1, 0.8], correctCategory: 'A', participantChoice: 'A' },
      { id: 's6', features: [0.3, 0.7], correctCategory: 'A', participantChoice: 'A' },
    ]

    const evalRes = evaluateCovisSession(stimuli, {
      ruleSwitchThreshold: 2,
    })

    expect(evalRes.totalTrials).toBe(6)
    expect(evalRes.ruleSwitchCount).toBeGreaterThan(0)
    expect(evalRes.trials.some((t) => t.ruleSwitched)).toBe(true)
    expect(evalRes.neurocognitiveInsight).toBeTruthy()
  })
})

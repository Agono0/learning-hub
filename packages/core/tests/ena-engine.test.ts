import { describe, it, expect } from 'vitest'
import {
  accumulateStanzaCoOccurrences,
  normalizeNetworkSphere,
  computeEpistemicNetworkMetrics,
  projectEpistemicSpace,
  detectEpistemicGaps,
  buildEpistemicDiscourseModel,
  bridgeEpistemicToCurriculum,
  STANDARD_EPISTEMIC_CODES,
  DiscourseUtterance,
} from '../src/epistemic/ena-engine'

describe('Epistemic Network Analysis (ENA) Engine', () => {
  const sampleUtterances: DiscourseUtterance[] = [
    {
      id: 'utt_1',
      unitId: 'learner_1',
      conversationId: 'session_conv_1',
      lineIndex: 0,
      timestamp: '2026-11-18T00:00:00Z',
      speaker: 'Learner',
      text: 'According to Amdahls Law, the theoretical speedup of a program using multiple processors is limited by the sequential fraction.',
      appliedCodes: ['code_domain_principle', 'code_causal_reasoning'],
    },
    {
      id: 'utt_2',
      unitId: 'learner_1',
      conversationId: 'session_conv_1',
      lineIndex: 1,
      timestamp: '2026-11-18T00:01:00Z',
      speaker: 'Tutor',
      text: 'How does your benchmark run on 16 threads compare with that predicted limit?',
      appliedCodes: ['code_empirical_evidence'],
    },
    {
      id: 'utt_3',
      unitId: 'learner_1',
      conversationId: 'session_conv_1',
      lineIndex: 2,
      timestamp: '2026-11-18T00:02:00Z',
      speaker: 'Learner',
      text: 'The throughput plateaued at 4.2x speedup because lock contention in the memory allocator dominated the sequential portion.',
      appliedCodes: [
        'code_empirical_evidence',
        'code_causal_reasoning',
        'code_procedural_execution',
      ],
    },
    {
      id: 'utt_4',
      unitId: 'learner_1',
      conversationId: 'session_conv_1',
      lineIndex: 3,
      timestamp: '2026-11-18T00:03:00Z',
      speaker: 'Learner',
      text: 'Wait, let me double check whether false sharing on cache lines could be distorting these latency metrics.',
      appliedCodes: ['code_metacognitive_check', 'code_counterfactual_critique'],
    },
  ]

  it('accumulates moving stanza co-occurrences with symmetry and correct vector length', () => {
    const { adjacencyMatrix, upperTriangleVector, edges } = accumulateStanzaCoOccurrences(
      sampleUtterances,
      STANDARD_EPISTEMIC_CODES,
      { windowSize: 3, windowType: 'moving_stanza' },
    )

    const K = STANDARD_EPISTEMIC_CODES.length
    expect(adjacencyMatrix.length).toBe(K)
    expect(adjacencyMatrix[0].length).toBe(K)

    // Matrix symmetry: A[i][j] === A[j][i]
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        expect(adjacencyMatrix[i][j]).toBe(adjacencyMatrix[j][i])
      }
    }

    // Upper triangle vector length: K*(K-1)/2
    const expectedLength = (K * (K - 1)) / 2
    expect(upperTriangleVector.length).toBe(expectedLength)
    expect(edges.length).toBe(expectedLength)

    // Assert positive co-occurrence for domain_principle <-> causal_reasoning
    const principleIdx = STANDARD_EPISTEMIC_CODES.findIndex((c) => c.id === 'code_domain_principle')
    const causalIdx = STANDARD_EPISTEMIC_CODES.findIndex((c) => c.id === 'code_causal_reasoning')
    expect(adjacencyMatrix[principleIdx][causalIdx]).toBeGreaterThan(0)
  })

  it('normalizes epistemic vector to unit hypersphere (Shaffer 2016)', () => {
    const rawVector = [3, 0, 4, 0, 0] // 3^2 + 4^2 = 25 -> sqrt(25) = 5
    const normalized = normalizeNetworkSphere(rawVector)
    expect(normalized).toEqual([0.6, 0, 0.8, 0, 0])

    // Sum of squares approximately 1.0
    const sumSq = normalized.reduce((acc, v) => acc + v * v, 0)
    expect(Math.abs(sumSq - 1.0)).toBeLessThan(0.01)
  })

  it('computes network density and centrality metrics', () => {
    const { adjacencyMatrix } = accumulateStanzaCoOccurrences(
      sampleUtterances,
      STANDARD_EPISTEMIC_CODES,
    )
    const { networkDensity, centrality } = computeEpistemicNetworkMetrics(
      adjacencyMatrix,
      STANDARD_EPISTEMIC_CODES,
    )

    expect(networkDensity).toBeGreaterThan(0)
    expect(networkDensity).toBeLessThanOrEqual(1.0)
    expect(centrality['code_causal_reasoning'].degree).toBeGreaterThanOrEqual(1)
    expect(centrality['code_causal_reasoning'].strength).toBeGreaterThan(0)
  })

  it('projects sphere-normalized vectors into 2D Epistemic Space', () => {
    const { upperTriangleVector } = accumulateStanzaCoOccurrences(
      sampleUtterances,
      STANDARD_EPISTEMIC_CODES,
    )
    const sphereVector = normalizeNetworkSphere(upperTriangleVector)
    const projection = projectEpistemicSpace(sphereVector, STANDARD_EPISTEMIC_CODES)

    expect(projection.dimension1Coord).toBeDefined()
    expect(projection.dimension2Coord).toBeDefined()
    expect(projection.varianceExplainedDim1).toBeGreaterThan(0)
    expect(projection.epistemicInterpretation.length).toBeGreaterThan(10)
  })

  it('detects subtractive epistemic gaps against expert benchmark', () => {
    const { edges } = accumulateStanzaCoOccurrences(sampleUtterances, STANDARD_EPISTEMIC_CODES)
    const expertEdges = [
      {
        sourceCodeId: 'code_domain_principle',
        targetCodeId: 'code_empirical_evidence',
        rawCount: 15,
        normalizedWeight: 0.95,
      },
      {
        sourceCodeId: 'code_metacognitive_check',
        targetCodeId: 'code_domain_principle',
        rawCount: 12,
        normalizedWeight: 0.85,
      },
    ]

    const gaps = detectEpistemicGaps(edges, expertEdges, STANDARD_EPISTEMIC_CODES)
    expect(gaps.length).toBeGreaterThanOrEqual(1)
    expect(gaps[0].gapMagnitude).toBeGreaterThan(0.25)
    expect(gaps[0].remedialSynthesisPrompt.length).toBeGreaterThan(10)
  })

  it('builds a full Epistemic Discourse Model and bridges to curriculum mastery', () => {
    const model = buildEpistemicDiscourseModel(
      'model_test_1',
      'Amdahls Law & Concurrent Concurrency Analysis',
      'Computer Systems',
      sampleUtterances,
      STANDARD_EPISTEMIC_CODES,
    )

    expect(model.id).toBe('model_test_1')
    expect(model.network.networkDensity).toBeGreaterThan(0)
    expect(model.trajectory.length).toBe(4)
    expect(model.overallMaturityScore).toBeGreaterThanOrEqual(20)

    // Curriculum Bridge
    const bridge = bridgeEpistemicToCurriculum(model, 0.75)
    expect(bridge.originalMastery).toBe(0.75)
    expect(bridge.transferMultiplier).toBeGreaterThan(0.8)
    expect(bridge.modulatedMastery).toBeGreaterThan(0)
  })
})

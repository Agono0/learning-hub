import { describe, expect, it } from 'vitest'
import {
  calculateGcmDistance,
  calculateGcmSimilarity,
  classifyWithGcm,
  evaluateGcmLogLikelihood,
  fitGcmAttentionWeights,
  type GcmExemplar,
  type GcmParameters,
} from '../src/categorization/gcm-attention'

describe('Generalized Context Model distance & similarity (Nosofsky 1986)', () => {
  it('computes city-block separable distance (r=1) with attention weighting', () => {
    const params: GcmParameters = {
      sensitivity: 2.0,
      minkowskiR: 1.0,
      attentionWeights: [0.8, 0.2], // heavily weight dimension 1
      categoryBiases: { A: 0.5, B: 0.5 },
      responseScaling: 1.0,
    }

    // Two stimuli differing by 1.0 on Dim 1 and 0.0 on Dim 2
    // d = 2.0 * (0.8 * 1.0 + 0.2 * 0.0) = 1.6
    const dist1 = calculateGcmDistance([1.0, 0.0], [0.0, 0.0], params)
    expect(dist1).toBeCloseTo(1.6, 4)

    // Two stimuli differing by 0.0 on Dim 1 and 1.0 on Dim 2
    // d = 2.0 * (0.8 * 0.0 + 0.2 * 1.0) = 0.4
    const dist2 = calculateGcmDistance([0.0, 1.0], [0.0, 0.0], params)
    expect(dist2).toBeCloseTo(0.4, 4)
  })

  it('computes exponential similarity decay (Shepard 1987)', () => {
    const params: GcmParameters = {
      sensitivity: 1.0,
      minkowskiR: 2.0,
      attentionWeights: [0.5, 0.5],
      categoryBiases: { A: 0.5, B: 0.5 },
      responseScaling: 1.0,
    }

    // Identical points => distance 0 => similarity 1.0
    expect(calculateGcmSimilarity([0.5, 0.5], [0.5, 0.5], params)).toBeCloseTo(1.0, 4)

    // Far points => near 0 similarity
    expect(calculateGcmSimilarity([10.0, 10.0], [0.0, 0.0], params)).toBeLessThan(1e-4)
  })

  it('classifies stimulus using summed exemplar similarity', () => {
    const exemplars: GcmExemplar[] = [
      { id: 'exA1', category: 'A', features: [0.8, 0.8], presentationFrequency: 1 },
      { id: 'exA2', category: 'A', features: [0.9, 0.7], presentationFrequency: 1 },
      { id: 'exB1', category: 'B', features: [0.1, 0.2], presentationFrequency: 1 },
      { id: 'exB2', category: 'B', features: [0.2, 0.1], presentationFrequency: 1 },
    ]

    const params: GcmParameters = {
      sensitivity: 4.0,
      minkowskiR: 1.0,
      attentionWeights: [0.5, 0.5],
      categoryBiases: { A: 0.5, B: 0.5 },
      responseScaling: 1.0,
    }

    // Probe close to Category A
    const resA = classifyWithGcm([0.85, 0.75], exemplars, params)
    expect(resA.predictedCategory).toBe('A')
    expect(resA.categoryProbabilities['A']).toBeGreaterThan(0.9)

    // Probe close to Category B
    const resB = classifyWithGcm([0.15, 0.15], exemplars, params)
    expect(resB.predictedCategory).toBe('B')
    expect(resB.categoryProbabilities['B']).toBeGreaterThan(0.9)
  })
})

describe('attention optimization & maximum likelihood (Nosofsky 1986)', () => {
  it('recovers selective attention shift when participant consistently attends one dimension', () => {
    const exemplars: GcmExemplar[] = [
      { id: 'exA', category: 'A', features: [0.8, 0.2], presentationFrequency: 1 },
      { id: 'exB', category: 'B', features: [0.2, 0.8], presentationFrequency: 1 },
    ]

    // Participant choices strictly follow Dimension 1 (high Dim1 => A, low Dim1 => B)
    const trials = [
      { features: [0.9, 0.1], participantChoice: 'A' },
      { features: [0.85, 0.9], participantChoice: 'A' }, // Dim 1 high despite Dim 2 high
      { features: [0.75, 0.8], participantChoice: 'A' },
      { features: [0.1, 0.2], participantChoice: 'B' },
      { features: [0.15, 0.9], participantChoice: 'B' },
      { features: [0.25, 0.1], participantChoice: 'B' },
    ]

    const fit = fitGcmAttentionWeights(trials, exemplars, 2, {
      cGrid: [1.0, 3.0, 5.0],
      weightSteps: 10,
    })

    expect(fit.fittedWeights[0]).toBeGreaterThan(fit.fittedWeights[1]!)
    expect(fit.selectiveAttentionShiftDetected).toBe(true)
    expect(fit.attendedDimension).toBe(0)
    expect(fit.distortionDescription).toContain('stretched')
  })

  it('evaluates Log-Likelihood correctly across trials', () => {
    const exemplars: GcmExemplar[] = [
      { id: 'exA', category: 'A', features: [0.9, 0.9], presentationFrequency: 1 },
      { id: 'exB', category: 'B', features: [0.1, 0.1], presentationFrequency: 1 },
    ]
    const params: GcmParameters = {
      sensitivity: 3.0,
      minkowskiR: 1.0,
      attentionWeights: [0.5, 0.5],
      categoryBiases: { A: 0.5, B: 0.5 },
      responseScaling: 1.0,
    }

    const consistentTrials = [
      { features: [0.9, 0.9], participantChoice: 'A' },
      { features: [0.1, 0.1], participantChoice: 'B' },
    ]
    const inconsistentTrials = [
      { features: [0.9, 0.9], participantChoice: 'B' },
      { features: [0.1, 0.1], participantChoice: 'A' },
    ]

    const llConsistent = evaluateGcmLogLikelihood(consistentTrials, exemplars, params)
    const llInconsistent = evaluateGcmLogLikelihood(inconsistentTrials, exemplars, params)

    expect(llConsistent).toBeGreaterThan(llInconsistent)
  })
})

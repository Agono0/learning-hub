import { describe, expect, it } from 'vitest'
import {
  computeReadability,
  countCausalMarkers,
  estimateSyllables,
  evaluateFeynmanExplanation,
  extractJargon,
  feynmanDiagnosticReportSchema,
} from '../src/feynman'

describe('Feynman Teach-Back & Readability Engine', () => {
  it('estimates syllables accurately', () => {
    expect(estimateSyllables('cat')).toBe(1)
    expect(estimateSyllables('water')).toBe(2)
    expect(estimateSyllables('difficult')).toBe(3)
    expect(estimateSyllables('differentiation')).toBeGreaterThanOrEqual(5)
  })

  it('computes Flesch-Kincaid readability and accessibility', () => {
    const simple =
      'Water flows down the hill. It goes into a small pipe. The pipe carries the water to the farm.'
    const result = computeReadability(simple)
    expect(result.words).toBeGreaterThan(10)
    expect(result.sentences).toBe(3)
    expect(result.gradeLevel).toBeLessThan(8)
    expect(result.readingEase).toBeGreaterThan(60)
  })

  it('detects domain jargon and causal connectors', () => {
    const text =
      'Because the prior distribution is non-informative, Bayesian parameter estimation consequently degenerates into maximum likelihood estimation.'
    const jargon = extractJargon(text)
    const causal = countCausalMarkers(text)

    expect(jargon.terms.length).toBeGreaterThan(0)
    expect(causal.count).toBeGreaterThanOrEqual(2) // 'because', 'consequently'
    expect(causal.density).toBeGreaterThan(0)
  })

  it('evaluates Feynman explanation and calculates IOED gap', () => {
    // High confidence (5) but full of dense jargon and lacking mechanical steps
    const jargonHeavy = evaluateFeynmanExplanation({
      concept: 'Neural Networks',
      explanation:
        'Backpropagation computes the gradient of the loss function with respect to hyperparameters using the chain rule across manifold tensors.',
      initialConfidence: 5,
    })

    expect(feynmanDiagnosticReportSchema.safeParse(jargonHeavy).success).toBe(true)
    expect(jargonHeavy.isTwelveYearOldAccessible).toBe(false)
    expect(jargonHeavy.ioedGap).toBeGreaterThan(20)
    expect(jargonHeavy.socraticProbes.length).toBeGreaterThanOrEqual(2)
    expect(jargonHeavy.suggestedGapCards.length).toBeGreaterThanOrEqual(1)

    // Plain, simple explanation with clear causal language
    const plainSimple = evaluateFeynmanExplanation({
      concept: 'Electric Current',
      explanation:
        'Think of electricity like water flowing in a pipe. The battery acts like a water pump pushing the water. Because the pump pushes, the water moves through the pipe and turns a water wheel to make light.',
      initialConfidence: 4,
    })

    expect(feynmanDiagnosticReportSchema.safeParse(plainSimple).success).toBe(true)
    expect(plainSimple.isTwelveYearOldAccessible).toBe(true)
    expect(plainSimple.explanatoryDepthScore).toBeGreaterThan(50)
    expect(plainSimple.summaryVerdict).toBe('mastery_clarity')
  })
})

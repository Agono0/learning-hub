import { describe, expect, it } from 'vitest'
import {
  checkHypercorrection,
  computeKeystrokeJitter,
  evaluateCognitiveLoad,
  interleaveBySemanticDistance,
} from '../src/cognitive-load'
import { cosineSimilarity } from '../src/embeddings'

describe('Cognitive Load & Flow State Domain', () => {
  describe('computeKeystrokeJitter', () => {
    it('returns 0 for minimal keypress streams', () => {
      expect(computeKeystrokeJitter([])).toBe(0)
      expect(computeKeystrokeJitter([100, 200])).toBe(0)
    })

    it('detects high variance in inter-keystroke intervals', () => {
      // Steady typing: 100ms intervals
      const steady = [0, 100, 200, 300, 400]
      // Hesitant typing: long thinking pause followed by bursts
      const hesitant = [0, 100, 1500, 1600, 3200]

      const steadyJitter = computeKeystrokeJitter(steady)
      const hesitantJitter = computeKeystrokeJitter(hesitant)
      expect(steadyJitter).toBe(0)
      expect(hesitantJitter).toBeGreaterThan(500)
    })
  })

  describe('evaluateCognitiveLoad', () => {
    it('detects optimal flow when retrieval latency is reasonable and errors are low', () => {
      const res = evaluateCognitiveLoad({
        cardId: 1,
        responseLatencyMs: 3800,
        baselineLatencyMs: 4000,
        backspaceCount: 0,
        recentErrorCount: 0,
      })
      expect(res.flowZone).toBe('optimal_flow')
      expect(res.intervention).toBe('none')
    })

    it('detects overload and steps down format when backspaces and errors spike', () => {
      const res = evaluateCognitiveLoad({
        cardId: 2,
        responseLatencyMs: 14000,
        baselineLatencyMs: 3500,
        backspaceCount: 7,
        recentErrorCount: 3,
      })
      expect(res.flowZone).toBe('overload')
      expect(res.intervention).toBe('worked_example')
    })

    it('detects underload during instant effortless retrievals', () => {
      const res = evaluateCognitiveLoad({
        cardId: 3,
        responseLatencyMs: 1200,
        baselineLatencyMs: 4500,
        backspaceCount: 0,
        recentErrorCount: 0,
      })
      expect(res.flowZone).toBe('underload')
    })
  })

  describe('cosineSimilarity & Semantic Interleaving', () => {
    it('computes exact cosine similarity between vector embeddings', () => {
      const v1 = [1, 0, 0]
      const v2 = [0, 1, 0]
      const v3 = [1, 0, 0]
      expect(cosineSimilarity(v1, v2)).toBe(0)
      expect(cosineSimilarity(v1, v3)).toBe(1)
    })

    it('interleaves cards to avoid blocked clusters of identical concepts', () => {
      const cards = [
        { id: 1, embedding: [1, 0, 0] },
        { id: 2, embedding: [0.99, 0.05, 0] }, // Very close to 1
        { id: 3, embedding: [0, 1, 0] }, // Far from 1
      ]
      const interleaved = interleaveBySemanticDistance(cards)
      // Card 3 should be placed between card 1 and card 2
      expect(interleaved[0].id).toBe(1)
      expect(interleaved[1].id).toBe(3)
      expect(interleaved[2].id).toBe(2)
    })
  })

  describe('Socratic Hypercorrection', () => {
    it('triggers contrast drill when learner is certain (confidence 5) but incorrect (grade 1)', () => {
      const drill = checkHypercorrection({
        cardId: 99,
        confidence: 5,
        grade: 1,
        userGivenAnswer: 'Mitosis',
        correctAnswer: 'Meiosis',
      })
      expect(drill.isEligible).toBe(true)
      expect(drill.prompt).toContain('Mitosis')
      expect(drill.prompt).toContain('Meiosis')
    })

    it('does not trigger on low-confidence guesses', () => {
      const drill = checkHypercorrection({
        cardId: 99,
        confidence: 2,
        grade: 1,
        correctAnswer: 'Meiosis',
      })
      expect(drill.isEligible).toBe(false)
    })
  })
})

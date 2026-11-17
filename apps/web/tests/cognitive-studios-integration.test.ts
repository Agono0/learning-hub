import { describe, expect, it } from 'vitest'
import { POST as generationPost } from '../src/server/handlers/cognitive/generation/route'
import {
  GET as feynmanGet,
  POST as feynmanPost,
} from '../src/server/handlers/cognitive/feynman-eval/route'
import { POST as interleavingPost } from '../src/server/handlers/cognitive/interleaving/route'
import {
  GET as metacognitionGet,
  POST as metacognitionPost,
} from '../src/server/handlers/cognitive/metacognition/route'
import { POST as dualCodingPost } from '../src/server/handlers/cognitive/dual-coding/route'

describe('Cognitive Science Interactive Studios API Suite', () => {
  describe('Generation Effect Studio Integration', () => {
    it('generates 4-tier ladder for a given concept', async () => {
      const req = new Request('http://localhost/api/cognitive/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: 'Hebbian Plasticity',
          explanation:
            'Synaptic efficacy increases when presynaptic and postsynaptic cells fire together',
          tier: 'reverse_query',
        }),
      })

      const res = await generationPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.ladder.tierLevel).toBe(3)
      expect(data.ladder.generationMultiplier).toBe(1.8)
    })

    it('evaluates learner trial with empirical potentiation multiplier', async () => {
      const req = new Request('http://localhost/api/cognitive/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: 'Hebbian Plasticity',
          tier: 'reverse_query',
          expectedAnswer: 'How do synapses physically adapt to repeated concurrent stimulation?',
          userAttempt: 'How do synapses physically adapt to repeated concurrent stimulation?',
          latencyMs: 4500,
        }),
      })

      const res = await generationPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.result.isCorrect).toBe(true)
      expect(data.result.retentionMultiplier).toBeGreaterThanOrEqual(1.5)
    })
  })

  describe('Feynman Teach-Back Studio Integration', () => {
    it('returns default diagnostic evaluation on GET', async () => {
      const req = new Request('http://localhost/api/cognitive/feynman-eval', { method: 'GET' })
      const res = await feynmanGet(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.report.fleschReadingEase).toBeDefined()
      expect(data.report.socraticProbes.length).toBeGreaterThan(0)
    })

    it('evaluates explanation and generates gap cards and socratic probes', async () => {
      const req = new Request('http://localhost/api/cognitive/feynman-eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: 'Photosynthesis',
          explanation:
            'Green plants use sunlight to turn carbon dioxide and water into sweet sugars and oxygen because chlorophyll catches light energy like a solar panel.',
          initialConfidence: 4,
        }),
      })

      const res = await feynmanPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.report.explanatoryDepthScore).toBeGreaterThanOrEqual(40)
      expect(data.report.causalMarkerCount).toBeGreaterThanOrEqual(1)
      expect(data.report.socraticProbes.length).toBeGreaterThan(0)
    })
  })

  describe('Metacognitive Calibration Studio Integration', () => {
    it('returns current calibration status and guidance on GET', async () => {
      const req = new Request('http://localhost/api/cognitive/metacognition', { method: 'GET' })
      const res = await metacognitionGet(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      // The GET now derives the profile from real revlog rows (empty log →
      // honest zero profile) instead of hardcoded sample trials.
      expect(data.profile.brierScore).toBeDefined()
      expect(data.profile.status).toBeDefined()
      expect(data.sampleSize).toBeGreaterThan(0) // real rows from this suite's DB
    })

    it('processes batch judgments and computes updated Brier score', async () => {
      const req = new Request('http://localhost/api/cognitive/metacognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trials: [
            { confidence: 0.8, outcome: 1, latencyMs: 1500 },
            { confidence: 0.9, outcome: 0, latencyMs: 800 },
            { confidence: 0.3, outcome: 0, latencyMs: 3000 },
          ],
        }),
      })

      const res = await metacognitionPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.report.sampleSize).toBe(3)
      expect(data.report.brierScore).toBeGreaterThan(0)
    })
  })

  describe('Interleaving Practice Studio Integration', () => {
    it('schedules an interleaved session across multiple categories', async () => {
      const req = new Request('http://localhost/api/cognitive/interleaving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              id: '1',
              categoryId: 'Algebra',
              title: 'Quadratic equations',
              difficulty: 0.6,
              urgency: 0.8,
            },
            {
              id: '2',
              categoryId: 'Algebra',
              title: 'Linear systems',
              difficulty: 0.4,
              urgency: 0.7,
            },
            {
              id: '3',
              categoryId: 'Calculus',
              title: 'Definite integrals',
              difficulty: 0.8,
              urgency: 0.9,
            },
            {
              id: '4',
              categoryId: 'Calculus',
              title: 'Chain rule',
              difficulty: 0.7,
              urgency: 0.85,
            },
            {
              id: '5',
              categoryId: 'Geometry',
              title: 'Circle theorems',
              difficulty: 0.5,
              urgency: 0.6,
            },
          ],
          options: {
            maxConsecutiveCategory: 1,
            targetCount: 5,
          },
        }),
      })

      const res = await interleavingPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.result.schedule.length).toBe(5)
      expect(data.result.blockingFactor).toBe(0)
      expect(data.result.categoryEntropy).toBeGreaterThan(0.8)
    })
  })

  describe('Paivio Dual-Coding Studio Integration', () => {
    it('analyzes text proposition and provides dual-coding recommendations', async () => {
      const req = new Request('http://localhost/api/cognitive/dual-coding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'The signal transduction process flows in three steps through phosphorylation loops.',
          hasDiagram: true,
          verbalRetention: 0.7,
          visualRetention: 0.75,
        }),
      })

      const res = await dualCodingPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.analysis.isDualCoded).toBe(true)
      expect(data.analysis.compositeRetention).toBeGreaterThan(0.7)
      expect(data.analysis.forgettingReductionFactor).toBeGreaterThan(1.5)
      expect(data.analysis.recommendedModality).toBe('sketch_diagram')
    })
  })
})

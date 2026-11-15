import { describe, expect, it } from 'vitest'
import {
  GET as metacognitionGet,
  POST as metacognitionPost,
} from '../src/server/handlers/cognitive/metacognition/route'
import { GET as tmrGet, POST as tmrPost } from '../src/server/handlers/cognitive/tmr/route'

describe('Cognitive Metacognition & TMR API Endpoints', () => {
  describe('/api/cognitive/metacognition', () => {
    it('GET returns baseline calibration diagnostic report', async () => {
      const req = new Request('http://localhost/api/cognitive/metacognition', { method: 'GET' })
      const res = await metacognitionGet(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.report.sampleSize).toBe(5)
      expect(data.report.brierScore).toBeDefined()
      expect(data.report.status).toBeDefined()
    })

    it('POST evaluates learner judgment trials and detects fluency illusion', async () => {
      const payload = {
        trials: [
          { confidence: 0.95, outcome: 0.0, latencyMs: 1200 },
          { confidence: 0.9, outcome: 0.0, latencyMs: 1400 },
          { confidence: 0.85, outcome: 0.0, latencyMs: 1500 },
        ],
      }

      const req = new Request('http://localhost/api/cognitive/metacognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const res = await metacognitionPost(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.report.bias).toBeGreaterThan(0.25)
      expect(data.report.status).toBe('fluency_illusion')
      expect(data.report.difficultyAdjustment).toBe('escalate_to_free_production')
    })
  })

  describe('/api/cognitive/tmr', () => {
    it('GET returns sample nightly sleep consolidation plan', async () => {
      const req = new Request('http://localhost/api/cognitive/tmr', { method: 'GET' })
      const res = await tmrGet(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.plan.swsWindows.length).toBeGreaterThanOrEqual(1)
      expect(data.plan.forecastedRetentionGain).toBeGreaterThan(0)
      expect(data.plan.targetAcousticDba).toBe(35)
    })

    it('POST generates personalized slow-wave sleep schedule prioritizing vulnerable cards', async () => {
      const payload = {
        cards: [
          {
            cardId: 201,
            stability: 0.5,
            difficulty: 0.8,
            baseFrequency: 300,
            harmonicType: 'major_triad',
          },
          {
            cardId: 202,
            stability: 5.0,
            difficulty: 0.2,
            baseFrequency: 600,
            harmonicType: 'octave_bloom',
          },
        ],
        sleepDurationHours: 8,
      }

      const req = new Request('http://localhost/api/cognitive/tmr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const res = await tmrPost(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.plan.cues.length).toBe(2)
      // Lowest stability scheduled first
      expect(data.plan.cues[0].cardId).toBe(201)
      expect(data.plan.swsWindows.length).toBe(2)
    })
  })
})

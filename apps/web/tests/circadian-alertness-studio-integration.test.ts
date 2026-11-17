import { describe, expect, it } from 'vitest'
import {
  simulateCircadianAlertness,
  simulateCaffeineDecay,
  getBinauralFrequencies,
  type Chronotype,
} from '@learning-hub/core'
import { GET as physioGet, POST as physioPost } from '../src/server/handlers/physio/route'

describe('Circadian Alertness Studio Integration Suite', () => {
  it('simulates 24h cognitive peak windows across all chronotypes', () => {
    const chronotypes: Chronotype[] = ['morning_lark', 'intermediate', 'night_owl']

    for (const ct of chronotypes) {
      const result = simulateCircadianAlertness(ct, 7, 23)
      expect(result.hourlyCurve).toHaveLength(24)
      expect(result.windows.workingMemoryPeak).toBeDefined()
      expect(result.windows.creativeIncubation).toBeDefined()
      expect(result.windows.postLunchDip).toBeDefined()
      expect(result.windows.nocturnalConsolidation).toBeDefined()

      // Assert valid hour bounds (0-23)
      expect(result.windows.workingMemoryPeak.startHour).toBeGreaterThanOrEqual(0)
      expect(result.windows.workingMemoryPeak.startHour).toBeLessThanOrEqual(23)
    }
  })

  it('correctly models caffeine clearance kinetics and bedtime sleep impact', () => {
    // 150mg dose at 12:00, 23:00 bedtime (11 hours elapsed, ~2 half-lives)
    const decay = simulateCaffeineDecay([{ mg: 150, hour: 12 }], 23)
    expect(decay.hourlyRemainingMg).toHaveLength(24)
    expect(decay.bedtimeRemainingMg).toBeLessThan(50)
    expect(decay.recommendedCutoffHour).toBe(14)
  })

  it('generates stereophonic frequency channels for binaural modes', () => {
    const gamma = getBinauralFrequencies('gamma_40hz')
    expect(gamma.beatDelta).toBe(40.0)
    expect(gamma.carrierRight - gamma.carrierLeft).toBe(40.0)

    const alpha = getBinauralFrequencies('alpha_10hz')
    expect(alpha.beatDelta).toBe(10.0)
    expect(alpha.carrierRight - alpha.carrierLeft).toBe(10.0)

    const delta = getBinauralFrequencies('delta_2hz')
    expect(delta.beatDelta).toBe(2.5)
    expect(delta.carrierRight - delta.carrierLeft).toBe(2.5)
  })

  it('integrates with GET and POST /api/physio handler', async () => {
    // 1. GET /api/physio
    const getReq = new Request('http://localhost/api/physio?bedtime=22', { method: 'GET' })
    const getRes = await physioGet(getReq)
    expect(getRes.status).toBe(200)
    const getData = await getRes.json()
    expect(getData.insights).toBeDefined()
    expect(getData.insights.caffeine.cutoffHour).toBe(14) // 22 - 8 = 14

    // 2. POST /api/physio
    const postReq = new Request('http://localhost/api/physio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-11-17',
        sleepHours: 7.5,
        sleepQuality: 4,
        exerciseMinutes: 45,
        exerciseHoursAfterLearning: 4,
        caffeineCutoffHour: 14,
        arousal: 6,
        notes: 'Circadian optimization integration test',
        tzOffset: 0,
      }),
    })
    const postRes = await physioPost(postReq)
    expect([200, 201]).toContain(postRes.status)
    const postData = await postRes.json()
    expect(postData.log).toBeDefined()
    expect(postData.log.sleepHours).toBe(7.5)
  })
})

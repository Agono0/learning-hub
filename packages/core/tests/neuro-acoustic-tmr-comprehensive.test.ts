import { describe, expect, it } from 'vitest'
import {
  calculateDeltaOscillationGain,
  createPinkNoiseState,
  evaluateConsolidationGain,
  stepPinkNoise,
  type PinkNoiseState,
} from '../src/tmr/neuro-acoustic'

describe('Neuro-Acoustic Sleep Consolidation & SWS Delta Coupling', () => {
  describe('Pink Noise Voss-McCartney Filter', () => {
    it('initializes zeroed state filter coefficients', () => {
      const state = createPinkNoiseState()
      expect(state.b0).toBe(0)
      expect(state.b6).toBe(0)
    })

    it('generates normalized samples within [-1.0, 1.0]', () => {
      const state: PinkNoiseState = createPinkNoiseState()
      for (let i = 0; i < 500; i++) {
        const white = Math.random() * 2 - 1
        const pink = stepPinkNoise(state, white)
        expect(pink).toBeGreaterThanOrEqual(-1.0)
        expect(pink).toBeLessThanOrEqual(1.0)
      }
    })

    it('smooths white noise high-frequency transients into 1/f spectral envelope', () => {
      const state = createPinkNoiseState()
      // Run filter to prime state
      for (let i = 0; i < 100; i++) {
        stepPinkNoise(state, Math.random() * 2 - 1)
      }

      // Compute variance of raw white vs pink output
      const whiteSamples: number[] = []
      const pinkSamples: number[] = []
      for (let i = 0; i < 200; i++) {
        const w = (i % 2 === 0 ? 1 : -1) * 0.8
        whiteSamples.push(w)
        pinkSamples.push(stepPinkNoise(state, w))
      }

      // Successive differences of pink noise should be significantly smaller than alternating white pulses
      let pinkDiffs = 0
      for (let i = 1; i < pinkSamples.length; i++) {
        pinkDiffs += Math.abs(pinkSamples[i] - pinkSamples[i - 1])
      }
      const meanPinkDiff = pinkDiffs / (pinkSamples.length - 1)
      expect(meanPinkDiff).toBeLessThan(1.0)
    })
  })

  describe('Slow-Wave Delta Oscillation Envelope', () => {
    it('modulates gain within safe acoustic bounds [0.1, 1.0]', () => {
      for (let t = 0; t <= 10; t += 0.1) {
        const gain = calculateDeltaOscillationGain(t, 1.2, 0.4)
        expect(gain).toBeGreaterThanOrEqual(0.1)
        expect(gain).toBeLessThanOrEqual(1.0)
      }
    })

    it('repeats periodically with the delta period (1 / frequency)', () => {
      const freq = 1.0 // 1.0 Hz -> period = 1.0s
      const gainAtZero = calculateDeltaOscillationGain(0, freq, 0.4)
      const gainAtOnePeriod = calculateDeltaOscillationGain(1.0, freq, 0.4)
      const gainAtTwoPeriods = calculateDeltaOscillationGain(2.0, freq, 0.4)

      expect(gainAtZero).toBeCloseTo(gainAtOnePeriod, 4)
      expect(gainAtZero).toBeCloseTo(gainAtTwoPeriods, 4)
    })
  })

  describe('Replay Consolidation Gain Model', () => {
    it('forecasts optimal consolidation for difficult items in early SWS cycles', () => {
      // Card 101, difficulty 0.8 (challenging), 4 replays, cycle 1 (peak SWS)
      const audit = evaluateConsolidationGain(101, 0.8, 4, 1)

      expect(audit.swsCycleOverlapScore).toBe(1.0)
      expect(audit.predictedRetentionBoostPct).toBeGreaterThanOrEqual(15)
      expect(audit.synapticStabilizationTier).toBe('optimal')
    })

    it('forecasts moderate boost for late cycles (cycle 3)', () => {
      // Cycle 3 has reduced delta slow-waves (more REM / light sleep)
      const audit = evaluateConsolidationGain(102, 0.5, 3, 3)

      expect(audit.swsCycleOverlapScore).toBe(0.5)
      expect(audit.predictedRetentionBoostPct).toBeLessThan(18)
      expect(audit.synapticStabilizationTier).toMatch(/moderate|optimal/)
    })

    it('handles marginal boost when cue count is 1 or item is trivial', () => {
      // Difficulty 0.1 (trivial), single cue, late cycle 4
      const audit = evaluateConsolidationGain(103, 0.1, 1, 4)

      expect(audit.predictedRetentionBoostPct).toBeLessThan(8)
      expect(audit.synapticStabilizationTier).toBe('marginal')
    })
  })
})

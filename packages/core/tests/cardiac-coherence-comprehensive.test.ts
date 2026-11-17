import { describe, expect, it } from 'vitest'
import {
  BREATHING_PROTOCOLS,
  calculateHrvMetrics,
  evaluateBreathCycle,
  type BreathingProtocol,
} from '../src/coherence'

describe('Cardiac Coherence & Autonomic Resonance Engine', () => {
  describe('HRV Metric Calculation', () => {
    it('handles empty or insufficient IBI data gracefully', () => {
      const emptyResult = calculateHrvMetrics([])
      expect(emptyResult.heartRateBpm).toBe(75)
      expect(emptyResult.coherenceTier).toBe('low')
      expect(emptyResult.recommendation).toContain('establish an autonomic baseline')

      const singleResult = calculateHrvMetrics([820])
      expect(singleResult.rmssd).toBe(0)
      expect(singleResult.sdnn).toBe(0)
    })

    it('filters out non-physiological outlier intervals (<300ms or >2000ms)', () => {
      // 100ms (600 BPM) and 3500ms (17 BPM) are physiological noise/artifacts
      const rawWithNoise = [100, 800, 820, 810, 830, 3500, 815]
      const result = calculateHrvMetrics(rawWithNoise)
      expect(result.meanIbiMs).toBeGreaterThan(800)
      expect(result.meanIbiMs).toBeLessThan(830)
      expect(result.heartRateBpm).toBeGreaterThan(70)
      expect(result.heartRateBpm).toBeLessThan(76)
    })

    it('calculates correct RMSSD, SDNN, and pNN50 for steady resting rhythm', () => {
      // Realistic resting sinus rhythm with ~40ms respiratory sinus arrhythmia
      const restingSinus = [800, 840, 810, 850, 820, 860, 810, 840, 820]
      const metrics = calculateHrvMetrics(restingSinus)

      expect(metrics.heartRateBpm).toBeGreaterThan(65)
      expect(metrics.heartRateBpm).toBeLessThan(78)
      expect(metrics.rmssd).toBeGreaterThan(30)
      expect(metrics.sdnn).toBeGreaterThan(15)
      expect(metrics.pnn50).toBeGreaterThanOrEqual(0)
      expect(metrics.coherenceRatio).toBeGreaterThan(0.2)
    })

    it('detects high coherence during resonance frequency sinus rhythms', () => {
      // High-coherence 0.1 Hz oscillation: smooth sinusoidal variation between 750 and 950ms
      const resonanceIbis = [
        750, 770, 810, 860, 910, 940, 950, 930, 890, 840, 790, 760, 750, 780, 820, 870, 920, 950,
        930, 880, 830, 780, 750,
      ]
      const metrics = calculateHrvMetrics(resonanceIbis)

      expect(metrics.coherenceRatio).toBeGreaterThanOrEqual(0.65)
      expect(metrics.coherenceTier).toMatch(/moderate|high/)
      expect(metrics.cognitiveReadinessScore).toBeGreaterThanOrEqual(65)
    })

    it('classifies sympathetic stress when heart rate is high and RMSSD is suppressed', () => {
      // Stress state: fast heart rate (~100 BPM / 600ms), low variability (10-15ms diffs)
      const stressedIbis = [600, 610, 595, 605, 590, 600, 610, 595, 605, 600]
      const metrics = calculateHrvMetrics(stressedIbis)

      expect(metrics.heartRateBpm).toBeGreaterThan(88)
      expect(metrics.rmssd).toBeLessThan(25)
      expect(metrics.autonomicState).toBe('sympathetic_stress')
      expect(metrics.recommendation).toContain('sympathetic stress')
    })

    it('classifies deep parasympathetic state when heart rate is low and RMSSD is elevated', () => {
      // Deep calm: 1000ms IBI (60 BPM), high RSA variability (>60ms diffs)
      const calmIbis = [980, 1050, 960, 1060, 970, 1070, 960, 1050, 980]
      const metrics = calculateHrvMetrics(calmIbis)

      expect(metrics.heartRateBpm).toBeLessThan(68)
      expect(metrics.rmssd).toBeGreaterThan(55)
      expect(metrics.autonomicState).toBe('deep_parasympathetic')
      expect(metrics.recommendation).toContain('parasympathetic vagal tone')
    })
  })

  describe('Breathing Protocol Cadence & Phase Evaluator', () => {
    const protocols: BreathingProtocol[] = [
      'resonance_0_1hz',
      'calm_parasympathetic',
      'box_focus',
      'energizing_gamma',
    ]

    it('provides valid phase durations for all protocols', () => {
      for (const p of protocols) {
        const config = BREATHING_PROTOCOLS[p]
        expect(config.inhaleMs).toBeGreaterThan(0)
        expect(config.exhaleMs).toBeGreaterThan(0)
        expect(config.breathsPerMinute).toBeGreaterThan(2)
        expect(config.breathsPerMinute).toBeLessThan(15)
      }
    })

    it('evaluates inhale phase progression accurately', () => {
      // At 2500ms of a 5000ms inhale (resonance_0_1hz)
      const state = evaluateBreathCycle('resonance_0_1hz', 2500)
      expect(state.phase).toBe('inhale')
      expect(state.phaseProgress).toBeCloseTo(0.5, 2)
      expect(state.orbScale).toBeGreaterThan(1.0)
      expect(state.orbScale).toBeLessThan(1.8)
      expect(state.guidanceText).toContain('Breathe in')
    })

    it('evaluates hold phase progression for box breathing', () => {
      // Box focus: 4s inhale (0-4000), 4s hold (4000-8000)
      const state = evaluateBreathCycle('box_focus', 6000)
      expect(state.phase).toBe('hold')
      expect(state.phaseProgress).toBeCloseTo(0.5, 2)
      expect(state.orbScale).toBe(1.8)
      expect(state.guidanceText).toContain('Hold')
    })

    it('evaluates exhale phase progression smoothly', () => {
      // Resonance 0.1Hz: 5000ms inhale, 5000ms exhale. At 7500ms -> exhale at 50%
      const state = evaluateBreathCycle('resonance_0_1hz', 7500)
      expect(state.phase).toBe('exhale')
      expect(state.phaseProgress).toBeCloseTo(0.5, 2)
      expect(state.orbScale).toBeGreaterThan(1.0)
      expect(state.orbScale).toBeLessThan(1.8)
      expect(state.guidanceText).toContain('exhale')
    })

    it('loops seamlessly into next cycle after full duration', () => {
      // Resonance total cycle is 10,000ms. At 12,000ms -> 2000ms into 2nd cycle (inhale at 40%)
      const state = evaluateBreathCycle('resonance_0_1hz', 12000)
      expect(state.phase).toBe('inhale')
      expect(state.phaseProgress).toBeCloseTo(0.4, 2)
    })
  })
})

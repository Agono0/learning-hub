import { describe, expect, it } from 'vitest'
import {
  calculateAudioRecallPauseMs,
  extractIncidentalGlossTokens,
  generateTmrEarcon,
  getBinauralFrequencies,
  tmrEarconSchema,
} from '../src/circadian'

describe('Circadian & Passive Learning Domain', () => {
  describe('calculateAudioRecallPauseMs', () => {
    it('clamps to lower bound for new/immature cards (S ~ 0)', () => {
      const pause = calculateAudioRecallPauseMs(0)
      expect(pause).toBe(2500) // Lower clamped bound 2.5s -> 2500ms
    })

    it('scales logarithmically for mature cards (S = 100 days)', () => {
      const pause = calculateAudioRecallPauseMs(100)
      expect(pause).toBeGreaterThan(4500)
      expect(pause).toBeLessThanOrEqual(8000)
    })

    it('clamps to upper bound for extremely high stabilities (S = 10000)', () => {
      const pause = calculateAudioRecallPauseMs(10000)
      expect(pause).toBe(8000) // Upper clamped bound 8.0s -> 8000ms
    })

    it('blends prior measured latency smoothly', () => {
      const pauseWithFastPrior = calculateAudioRecallPauseMs(10, 1000)
      const pauseWithSlowPrior = calculateAudioRecallPauseMs(10, 6000)
      expect(pauseWithSlowPrior).toBeGreaterThan(pauseWithFastPrior)
    })
  })

  describe('Targeted Memory Reactivation (TMR)', () => {
    it('generates deterministic harmonic earcons within safe auditory thresholds', () => {
      const cue1 = generateTmrEarcon(42)
      const cue2 = generateTmrEarcon(42)
      expect(cue1).toEqual(cue2)
      expect(cue1.maxDbSpl).toBeLessThanOrEqual(35) // Safe SWS threshold
      expect(cue1.baseFrequency).toBeGreaterThanOrEqual(120)
      expect(cue1.baseFrequency).toBeLessThanOrEqual(880)

      const parsed = tmrEarconSchema.safeParse(cue1)
      expect(parsed.success).toBe(true)
    })
  })

  describe('Procedural Binaural Entrainment', () => {
    it('computes 40Hz Gamma stereophonic carriers correctly', () => {
      const freqs = getBinauralFrequencies('gamma_40hz')
      expect(freqs.carrierRight - freqs.carrierLeft).toBe(40.0)
      expect(freqs.beatDelta).toBe(40.0)
    })

    it('computes 10Hz Alpha stereophonic carriers correctly', () => {
      const freqs = getBinauralFrequencies('alpha_10hz')
      expect(freqs.carrierRight - freqs.carrierLeft).toBe(10.0)
      expect(freqs.beatDelta).toBe(10.0)
    })

    it('computes 2.5Hz Delta nocturnal consolidation carriers correctly', () => {
      const freqs = getBinauralFrequencies('delta_2hz')
      expect(freqs.carrierRight - freqs.carrierLeft).toBe(2.5)
      expect(freqs.beatDelta).toBe(2.5)
    })
  })

  describe('Incidental Glossing (Krashen i+1)', () => {
    it('identifies target vocabulary for ambient in-context marginalia', () => {
      const vocabMap = new Map([
        ['ubiquitous', { cardId: 101, definition: 'present, appearing, or found everywhere' }],
      ])
      const text = 'Smartphones are ubiquitous in modern society.'
      const tokens = extractIncidentalGlossTokens(text, vocabMap)

      const target = tokens.find((t) => t.normalized === 'ubiquitous')
      expect(target).toBeDefined()
      expect(target?.isKnown).toBe(false)
      expect(target?.cardId).toBe(101)
      expect(target?.definition).toContain('present')
    })
  })
})

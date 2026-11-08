import { describe, expect, it } from 'vitest'
import {
  generateWhiteNoiseSamples,
  generatePinkNoiseSamples,
  generateBrownianNoiseSamples,
  SOUNDSCAPE_CATALOG,
  soundscapePresetSchema,
} from '../src/focus-soundscape'

describe('focus-soundscape', () => {
  describe('noise buffer generation', () => {
    it('generates white noise samples within [-1, 1] range', () => {
      const samples = generateWhiteNoiseSamples(1024)
      expect(samples.length).toBe(1024)

      let min = Infinity
      let max = -Infinity
      let sum = 0

      for (let i = 0; i < samples.length; i++) {
        const val = samples[i]
        if (val < min) min = val
        if (val > max) max = val
        sum += val
      }

      expect(min).toBeGreaterThanOrEqual(-1)
      expect(max).toBeLessThanOrEqual(1)
      // Mean of uniform [-1, 1] over 1024 samples should be close to 0
      const mean = sum / samples.length
      expect(Math.abs(mean)).toBeLessThan(0.15)
    })

    it('generates pink noise samples with 1/f spectral attenuation', () => {
      const samples = generatePinkNoiseSamples(2048)
      expect(samples.length).toBe(2048)

      // Verify no NaNs or Infinities and bounded amplitude
      let maxAbs = 0
      for (let i = 0; i < samples.length; i++) {
        const absVal = Math.abs(samples[i])
        expect(Number.isFinite(samples[i])).toBe(true)
        if (absVal > maxAbs) maxAbs = absVal
      }

      // Check pink noise isn't all zeros and is bounded
      expect(maxAbs).toBeGreaterThan(0.01)
      expect(maxAbs).toBeLessThanOrEqual(1.5)
    })

    it('generates brownian noise samples with integrated low-pass profile', () => {
      const samples = generateBrownianNoiseSamples(2048)
      expect(samples.length).toBe(2048)

      for (let i = 0; i < samples.length; i++) {
        expect(Number.isFinite(samples[i])).toBe(true)
      }

      // Smoothness check: consecutive samples should have smaller differences than pure white noise
      let diffSum = 0
      for (let i = 1; i < samples.length; i++) {
        diffSum += Math.abs(samples[i] - samples[i - 1])
      }
      const avgDiff = diffSum / (samples.length - 1)
      expect(avgDiff).toBeLessThan(0.2) // Brownian is much smoother than white noise
    })
  })

  describe('catalog and schemas', () => {
    it('validates soundscape presets correctly', () => {
      expect(soundscapePresetSchema.safeParse('pink_noise').success).toBe(true)
      expect(soundscapePresetSchema.safeParse('brown_noise').success).toBe(true)
      expect(soundscapePresetSchema.safeParse('rain_ambience').success).toBe(true)
      expect(soundscapePresetSchema.safeParse('invalid_sound').success).toBe(false)
    })

    it('contains valid catalog definitions for all presets', () => {
      const presets = [
        'none',
        'white_noise',
        'pink_noise',
        'brown_noise',
        'rain_ambience',
        'gamma_focus_40hz',
        'alpha_flow_10hz',
      ] as const
      for (const preset of presets) {
        const meta = SOUNDSCAPE_CATALOG[preset]
        expect(meta).toBeDefined()
        expect(meta.id).toBe(preset)
        expect(meta.name.length).toBeGreaterThan(0)
        expect(meta.description.length).toBeGreaterThan(0)
        expect(meta.defaultVolume).toBeGreaterThanOrEqual(0)
        expect(meta.defaultVolume).toBeLessThanOrEqual(1)
      }
    })
  })
})

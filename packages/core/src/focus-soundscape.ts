/**
 * Learning HUB — Procedural Bio-Acoustic Focus Soundscape Engine.
 *
 * Implements pure mathematical procedural audio generation for distraction masking:
 * 1. White Noise: uniform random frequency distribution.
 * 2. Pink Noise (1/f): Voss-McCartney algorithm for natural speech/chatter masking.
 * 3. Brownian Noise (1/f^2): integration algorithm for deep waterfall/low-rumble relaxation.
 * 4. Procedural rain generator parameters.
 * Zero external mp3/wav files required; generated on-demand via Web Audio API.
 */
import { z } from 'zod'

export const soundscapePresetSchema = z.enum([
  'none',
  'white_noise',
  'pink_noise',
  'brown_noise',
  'rain_ambience',
  'gamma_focus_40hz',
  'alpha_flow_10hz',
])
export type SoundscapePreset = z.infer<typeof soundscapePresetSchema>

export interface SoundscapeMeta {
  id: SoundscapePreset
  name: string
  description: string
  defaultVolume: number
}

export const SOUNDSCAPE_CATALOG: Record<SoundscapePreset, SoundscapeMeta> = {
  none: {
    id: 'none',
    name: 'Silent Calm',
    description: 'No background audio masking.',
    defaultVolume: 0,
  },
  pink_noise: {
    id: 'pink_noise',
    name: 'Pink Noise (1/f)',
    description:
      'Balanced power across octaves; optimal for masking ambient speech and office chatter.',
    defaultVolume: 0.15,
  },
  brown_noise: {
    id: 'brown_noise',
    name: 'Brown Noise (1/f²)',
    description: 'Deep low-frequency rumble resembling a distant waterfall or heavy rainfall.',
    defaultVolume: 0.2,
  },
  white_noise: {
    id: 'white_noise',
    name: 'White Noise',
    description:
      'Equal power per frequency; sharp acoustic barrier for sudden intermittent noises.',
    defaultVolume: 0.1,
  },
  rain_ambience: {
    id: 'rain_ambience',
    name: 'Procedural Rain',
    description: 'Dual-layer pink noise with randomized droplet impulse filters.',
    defaultVolume: 0.18,
  },
  gamma_focus_40hz: {
    id: 'gamma_focus_40hz',
    name: '40Hz Gamma Flow Beats',
    description:
      'Binaural carrier offsets at 40Hz to stimulate attentional binding and cognitive focus.',
    defaultVolume: 0.12,
  },
  alpha_flow_10hz: {
    id: 'alpha_flow_10hz',
    name: '10Hz Alpha State',
    description: 'Calm relaxed alertness for prolonged reading and deep writing.',
    defaultVolume: 0.15,
  },
}

/**
 * Generates an array of white noise samples (uniform distribution between -1 and +1).
 */
export function generateWhiteNoiseSamples(numSamples: number): Float32Array {
  const output = new Float32Array(numSamples)
  for (let i = 0; i < numSamples; i++) {
    output[i] = Math.random() * 2 - 1
  }
  return output
}

/**
 * Generates Pink Noise samples (1/f energy distribution) using the Voss-McCartney algorithm.
 * Pink noise has equal energy per octave, closely matching human perceptual loudness.
 */
export function generatePinkNoiseSamples(numSamples: number): Float32Array {
  const output = new Float32Array(numSamples)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0

  for (let i = 0; i < numSamples; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898

    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    b6 = white * 0.115926
    output[i] = pink * 0.11 // Scaled to prevent clipping [-1, 1]
  }

  return output
}

/**
 * Generates Brownian / Red Noise samples (1/f^2 energy distribution) by integrating white noise.
 * Emphasizes deep, low-frequency sounds that reduce physiological arousal.
 */
export function generateBrownianNoiseSamples(numSamples: number): Float32Array {
  const output = new Float32Array(numSamples)
  let lastOut = 0.0

  for (let i = 0; i < numSamples; i++) {
    const white = Math.random() * 2 - 1
    lastOut = (lastOut + 0.02 * white) / 1.02
    output[i] = lastOut * 3.5 // Normalized
  }

  return output
}

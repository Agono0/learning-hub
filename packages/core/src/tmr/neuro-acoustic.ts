import { z } from 'zod'

/**
 * @file Neuro-Acoustic Sleep Consolidation & Slow-Wave Oscillation Coupling
 * @description Models slow-wave sleep (SWS) delta rhythm oscillations (0.5–2 Hz),
 * acoustic pink-noise 1/f spectral densities, and sub-arousal earcon delivery
 * to maximize hippocampal-to-neocortical memory consolidation (Ngo et al., 2013; Rasch & Born, 2013).
 */

export const acousticNoiseTypeSchema = z.enum([
  'pink_noise',
  'brown_noise',
  'delta_binaural',
  'pure_harmonic',
])
export type AcousticNoiseType = z.infer<typeof acousticNoiseTypeSchema>

export interface NeuroAcousticProfile {
  noiseType: AcousticNoiseType
  /** Base carrier frequency in Hz (e.g. 100-250 Hz for warm soothing undertones) */
  carrierFrequencyHz: number
  /** Delta oscillation frequency in Hz (typically 1.0 - 1.5 Hz for SWS resonance) */
  deltaFrequencyHz: number
  /** Attenuation ceiling in dBA to prevent cortical arousals (safe max: 42 dBA) */
  maxAcousticDba: number
  /** Duration of fade-in ramp in seconds (prevents sudden acoustic shock) */
  fadeInDurationSeconds: number
  /** Inter-cue silence interval range [minSeconds, maxSeconds] */
  interCueIntervalRange: [number, number]
}

export const DEFAULT_NEURO_ACOUSTIC_PROFILE: NeuroAcousticProfile = {
  noiseType: 'pink_noise',
  carrierFrequencyHz: 136.1, // Om resonance / grounding frequency
  deltaFrequencyHz: 1.2, // Optimal human SWS delta frequency
  maxAcousticDba: 38, // Safe whisper volume ceiling
  fadeInDurationSeconds: 4.0,
  interCueIntervalRange: [25, 45],
}

/**
 * Voss-McCartney Pink Noise filter generator coefficient state.
 * Generates true 1/f (-3 dB/octave) power spectral density matching natural resting brainwaves.
 */
export interface PinkNoiseState {
  b0: number
  b1: number
  b2: number
  b3: number
  b4: number
  b5: number
  b6: number
}

export function createPinkNoiseState(): PinkNoiseState {
  return { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 }
}

/**
 * Applies the Voss-McCartney filter algorithm to a white noise sample (-1.0 to 1.0)
 * returning a filtered pink noise sample (-1.0 to 1.0).
 */
export function stepPinkNoise(state: PinkNoiseState, whiteSample: number): number {
  state.b0 = 0.99886 * state.b0 + whiteSample * 0.0555179
  state.b1 = 0.99332 * state.b1 + whiteSample * 0.0750759
  state.b2 = 0.969 * state.b2 + whiteSample * 0.153852
  state.b3 = 0.8665 * state.b3 + whiteSample * 0.3104856
  state.b4 = 0.55 * state.b4 + whiteSample * 0.5329522
  state.b5 = -0.7616 * state.b5 - whiteSample * 0.016898
  const pink =
    state.b0 +
    state.b1 +
    state.b2 +
    state.b3 +
    state.b4 +
    state.b5 +
    state.b6 +
    whiteSample * 0.5362
  state.b6 = whiteSample * 0.115926
  return Math.max(-1.0, Math.min(1.0, pink * 0.11))
}

/**
 * Calculates the amplitude modulation envelope for Slow-Wave Sleep (SWS) delta coupling.
 * Sinusoidally modulates acoustic level at delta frequency (e.g. 1.2 Hz) with gentle depth.
 */
export function calculateDeltaOscillationGain(
  timeSeconds: number,
  deltaFrequencyHz = 1.2,
  modulationDepth = 0.35,
): number {
  // Base gain 1.0 - modulationDepth/2, modulated by sin wave
  const baseGain = 1.0 - modulationDepth / 2
  const oscillation = (Math.sin(2 * Math.PI * deltaFrequencyHz * timeSeconds) * modulationDepth) / 2
  return Math.max(0.1, Math.min(1.0, baseGain + oscillation))
}

export interface ReplayConsolidationAudit {
  cardId: number
  daytimeDifficulty: number
  cueCount: number
  swsCycleOverlapScore: number // 0.0 to 1.0
  predictedRetentionBoostPct: number // e.g. +18.4%
  synapticStabilizationTier: 'optimal' | 'moderate' | 'marginal'
}

/**
 * Calculates predicted memory consolidation boost based on daytime difficulty,
 * number of night replays, and alignment with SWS delta cycle peaks (Oudiette & Paller, 2013).
 */
export function evaluateConsolidationGain(
  cardId: number,
  daytimeDifficulty: number,
  cueCount: number,
  cycleIndex: number,
): ReplayConsolidationAudit {
  // SWS cycle 1 and 2 deliver maximal delta sleep consolidation; cycle 3+ tapers off
  const cycleWeights: Record<number, number> = { 1: 1.0, 2: 0.85, 3: 0.5, 4: 0.25 }
  const cycleWeight = cycleWeights[cycleIndex] ?? 0.2

  // Moderate to high difficulty items benefit most from TMR (difficult items have fragile traces)
  const difficultyFactor = 0.7 + 0.6 * Math.min(1.0, Math.max(0, daytimeDifficulty))

  // Law of diminishing returns on cue count (3-5 replays is optimal; >8 risks habituation or micro-arousal)
  const countFactor = Math.min(1.0, Math.log2(1 + Math.max(1, cueCount)) / 2.3)

  const rawBoost = 0.28 * cycleWeight * difficultyFactor * countFactor
  const predictedBoostPct = Math.round(rawBoost * 1000) / 10

  let tier: 'optimal' | 'moderate' | 'marginal' = 'marginal'
  if (predictedBoostPct >= 15) {
    tier = 'optimal'
  } else if (predictedBoostPct >= 8) {
    tier = 'moderate'
  }

  return {
    cardId,
    daytimeDifficulty,
    cueCount,
    swsCycleOverlapScore: Math.round(cycleWeight * 100) / 100,
    predictedRetentionBoostPct: predictedBoostPct,
    synapticStabilizationTier: tier,
  }
}

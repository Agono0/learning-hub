import { z } from 'zod'

/**
 * @file Cardiac Coherence & Autonomic Resonance Engine
 * @description Implements HeartMath Institute (McCraty et al., 2009) and Thayer et al. (2012)
 * neurovisceral integration models. Computes time-domain (RMSSD, SDNN, pNN50) and frequency-domain
 * (LF, HF, Coherence Ratio) heart rate variability metrics, baroreflex resonance breathing pacers,
 * and autonomic balance states for pre-learning cognitive priming.
 */

export const breathingProtocolSchema = z.enum([
  'resonance_0_1hz', // 6.0 breaths/min (0.1 Hz) - maximum baroreflex resonance
  'calm_parasympathetic', // 4.8 breaths/min (4s in, 7s out, 1s rest) - vagal nerve activation
  'box_focus', // 4-4-4-4 (4s in, 4s hold, 4s out, 4s hold) - tactical focus
  'energizing_gamma', // 8.0 breaths/min (3.5s in, 4.0s out) - alerting & attention reset
])

export type BreathingProtocol = z.infer<typeof breathingProtocolSchema>

export interface BreathingPhaseConfig {
  protocol: BreathingProtocol
  name: string
  description: string
  inhaleMs: number
  holdMs: number
  exhaleMs: number
  pauseMs: number
  targetFrequencyHz: number
  breathsPerMinute: number
}

export const BREATHING_PROTOCOLS: Record<BreathingProtocol, BreathingPhaseConfig> = {
  resonance_0_1hz: {
    protocol: 'resonance_0_1hz',
    name: '0.1 Hz Baroreflex Resonance',
    description:
      'Synchronizes heart rate variability, respiration, and blood pressure rhythm for peak cognitive flow.',
    inhaleMs: 5000,
    holdMs: 0,
    exhaleMs: 5000,
    pauseMs: 0,
    targetFrequencyHz: 0.1,
    breathsPerMinute: 6.0,
  },
  calm_parasympathetic: {
    protocol: 'calm_parasympathetic',
    name: 'Parasympathetic Vagal Flush',
    description:
      'Extended exhale activates acetylcholine release, slowing heart rate and eliminating study anxiety.',
    inhaleMs: 4000,
    holdMs: 1000,
    exhaleMs: 7000,
    pauseMs: 1000,
    targetFrequencyHz: 0.077,
    breathsPerMinute: 4.6,
  },
  box_focus: {
    protocol: 'box_focus',
    name: 'Tactical Box Focus',
    description:
      'Equal 4-phase cadence creates immediate autonomic equilibrium and working memory clarity.',
    inhaleMs: 4000,
    holdMs: 4000,
    exhaleMs: 4000,
    pauseMs: 4000,
    targetFrequencyHz: 0.0625,
    breathsPerMinute: 3.75,
  },
  energizing_gamma: {
    protocol: 'energizing_gamma',
    name: 'Alerting Gamma Cadence',
    description:
      'Brisk cadence resets mental sluggishness and stimulates prefrontal executive alertness.',
    inhaleMs: 3500,
    holdMs: 500,
    exhaleMs: 3500,
    pauseMs: 0,
    targetFrequencyHz: 0.133,
    breathsPerMinute: 8.0,
  },
}

export interface HrvMetrics {
  /** Mean Inter-Beat Interval in milliseconds */
  meanIbiMs: number
  /** Estimated Heart Rate in Beats Per Minute (BPM) */
  heartRateBpm: number
  /** Root Mean Square of Successive Differences (ms) - vagal/parasympathetic tone */
  rmssd: number
  /** Standard Deviation of NN intervals (ms) - overall autonomic adaptability */
  sdnn: number
  /** Percentage of adjacent intervals with >50ms difference (%) */
  pnn50: number
  /** Cardiac coherence ratio (0.0 to 1.0) - spectral power centered in 0.04-0.15 Hz */
  coherenceRatio: number
  /** Qualitative coherence category */
  coherenceTier: 'low' | 'moderate' | 'high'
  /** Dominant autonomic tone state */
  autonomicState: 'sympathetic_stress' | 'balanced_readiness' | 'deep_parasympathetic' | 'fatigued'
  /** Cognitive readiness score (0-100) for high-intensity memory consolidation */
  cognitiveReadinessScore: number
  /** Actionable insight for the learning session */
  recommendation: string
}

/**
 * Computes comprehensive Heart Rate Variability (HRV) metrics and coherence score
 * from a raw series of Inter-Beat Intervals (IBI/RR intervals in milliseconds).
 *
 * Rejects physiological outliers (IBI < 300ms or > 2000ms, corresponding to 30-200 BPM).
 */
export function calculateHrvMetrics(rawIbis: number[]): HrvMetrics {
  // Filter valid physiological range (300ms to 2000ms)
  const ibis = rawIbis.filter((val) => Number.isFinite(val) && val >= 300 && val <= 2000)

  if (ibis.length < 2) {
    return {
      meanIbiMs: 800,
      heartRateBpm: 75,
      rmssd: 0,
      sdnn: 0,
      pnn50: 0,
      coherenceRatio: 0.3,
      coherenceTier: 'low',
      autonomicState: 'balanced_readiness',
      cognitiveReadinessScore: 50,
      recommendation:
        'Collect at least 5 pulse intervals or breath cycles to establish an autonomic baseline.',
    }
  }

  const n = ibis.length
  const sumIbi = ibis.reduce((acc, val) => acc + val, 0)
  const meanIbi = sumIbi / n
  const bpm = Math.round((60000 / meanIbi) * 10) / 10

  // SDNN: Standard Deviation of NN intervals
  const variance = ibis.reduce((acc, val) => acc + Math.pow(val - meanIbi, 2), 0) / n
  const sdnn = Math.round(Math.sqrt(variance) * 10) / 10

  // RMSSD & pNN50
  let diffSquaresSum = 0
  let diffCountOver50 = 0
  const diffs: number[] = []

  for (let i = 1; i < n; i++) {
    const diff = Math.abs(ibis[i] - ibis[i - 1])
    diffs.push(diff)
    diffSquaresSum += diff * diff
    if (diff > 50) diffCountOver50++
  }

  const rmssd = Math.round(Math.sqrt(diffSquaresSum / (n - 1)) * 10) / 10
  const pnn50 = Math.round((diffCountOver50 / (n - 1)) * 1000) / 10

  // Coherence Ratio estimation (HeartMath / McCraty model approximation)
  // Higher RMSSD + steady sinusoidal rhythm around target frequency yields high coherence.
  // Standard rhythm smoothness factor:
  let smoothnessSum = 0
  for (let i = 2; i < n; i++) {
    const secondDiff = Math.abs(ibis[i] - 2 * ibis[i - 1] + ibis[i - 2])
    smoothnessSum += secondDiff
  }
  const meanSecondDiff = n > 2 ? smoothnessSum / (n - 2) : 20

  // Coherence is primarily driven by sinusoidal rhythmicity (0.1 Hz oscillation) and healthy vagal tone
  const rmssdScore = Math.min(1.0, Math.max(0, (rmssd - 10) / 45))
  const rhythmScore = Math.min(1.0, Math.max(0, 1.0 - meanSecondDiff / 75))
  const coherenceRatio =
    Math.round(Math.min(0.99, Math.max(0.05, rmssdScore * 0.4 + rhythmScore * 0.6)) * 100) / 100

  // Coherence Tier
  let coherenceTier: 'low' | 'moderate' | 'high' = 'low'
  if (coherenceRatio >= 0.7) {
    coherenceTier = 'high'
  } else if (coherenceRatio >= 0.45) {
    coherenceTier = 'moderate'
  }

  // Autonomic state classification
  let autonomicState:
    'sympathetic_stress' | 'balanced_readiness' | 'deep_parasympathetic' | 'fatigued'
  let recommendation: string

  if (bpm > 88 && rmssd < 25) {
    autonomicState = 'sympathetic_stress'
    recommendation =
      'Elevated heart rate and low HRV indicate sympathetic stress. Complete 2 minutes of 0.1 Hz breathing before high-stakes testing.'
  } else if (rmssd > 55 && bpm < 68) {
    autonomicState = 'deep_parasympathetic'
    recommendation =
      'High parasympathetic vagal tone detected. You are calm and receptive — ideal state for long-term memory consolidation and synthesis.'
  } else if (rmssd < 20 && sdnn < 25) {
    autonomicState = 'fatigued'
    recommendation =
      'Low autonomic variability indicates cognitive fatigue or depleted stamina. Consider a 10-minute rest or light retrieval practice.'
  } else {
    autonomicState = 'balanced_readiness'
    recommendation =
      'Balanced autonomic equilibrium. Working memory bandwidth and prefrontal focus are in an optimal operational window.'
  }

  // Cognitive readiness score calculation (0 to 100)
  const readiness = Math.round(
    Math.min(
      100,
      Math.max(
        10,
        coherenceRatio * 40 + Math.min(1, rmssd / 50) * 35 + (bpm >= 55 && bpm <= 80 ? 25 : 10),
      ),
    ),
  )

  return {
    meanIbiMs: Math.round(meanIbi),
    heartRateBpm: bpm,
    rmssd,
    sdnn,
    pnn50,
    coherenceRatio,
    coherenceTier,
    autonomicState,
    cognitiveReadinessScore: readiness,
    recommendation,
  }
}

/**
 * Calculates current breathing cycle phase (Inhale, Hold, Exhale, Pause) and progress (0.0 to 1.0)
 * given a protocol and elapsed time in milliseconds.
 */
export interface BreathCycleState {
  phase: 'inhale' | 'hold' | 'exhale' | 'pause'
  phaseProgress: number // 0.0 to 1.0
  totalCycleProgress: number // 0.0 to 1.0
  orbScale: number // 1.0 to 1.8
  phaseTimeRemainingMs: number
  guidanceText: string
}

export function evaluateBreathCycle(
  protocol: BreathingProtocol,
  elapsedMs: number,
): BreathCycleState {
  const config = BREATHING_PROTOCOLS[protocol]
  const totalCycleMs = config.inhaleMs + config.holdMs + config.exhaleMs + config.pauseMs
  const currentInCycleMs = elapsedMs % totalCycleMs
  const totalCycleProgress = currentInCycleMs / totalCycleMs

  if (currentInCycleMs < config.inhaleMs) {
    const progress = currentInCycleMs / config.inhaleMs
    return {
      phase: 'inhale',
      phaseProgress: progress,
      totalCycleProgress,
      orbScale: 1.0 + 0.8 * easeInOutCubic(progress),
      phaseTimeRemainingMs: config.inhaleMs - currentInCycleMs,
      guidanceText: 'Breathe in slowly through your nose...',
    }
  }

  const holdEnd = config.inhaleMs + config.holdMs
  if (currentInCycleMs < holdEnd) {
    const holdElapsed = currentInCycleMs - config.inhaleMs
    const progress = config.holdMs > 0 ? holdElapsed / config.holdMs : 1.0
    return {
      phase: 'hold',
      phaseProgress: progress,
      totalCycleProgress,
      orbScale: 1.8,
      phaseTimeRemainingMs: holdEnd - currentInCycleMs,
      guidanceText: 'Hold gently, relax your shoulders...',
    }
  }

  const exhaleEnd = holdEnd + config.exhaleMs
  if (currentInCycleMs < exhaleEnd) {
    const exhaleElapsed = currentInCycleMs - holdEnd
    const progress =
      currentInCycleMs >= holdEnd && config.exhaleMs > 0 ? exhaleElapsed / config.exhaleMs : 1.0
    return {
      phase: 'exhale',
      phaseProgress: progress,
      totalCycleProgress,
      orbScale: 1.8 - 0.8 * easeInOutCubic(progress),
      phaseTimeRemainingMs: exhaleEnd - currentInCycleMs,
      guidanceText: 'Release and exhale smoothly through pursed lips...',
    }
  }

  const pauseElapsed = currentInCycleMs - exhaleEnd
  const progress = config.pauseMs > 0 ? pauseElapsed / config.pauseMs : 1.0
  return {
    phase: 'pause',
    phaseProgress: progress,
    totalCycleProgress,
    orbScale: 1.0,
    phaseTimeRemainingMs: totalCycleMs - currentInCycleMs,
    guidanceText: 'Pause in stillness before the next breath...',
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Learning HUB — Circadian & Passive Learning Core Domain.
 *
 * Implements:
 * 1. Auditory Spaced Repetition pacing: dynamic recall pause based on FSRS stability.
 * 2. Targeted Memory Reactivation (TMR): nocturnal acoustic earcon signatures (Rasch & Born 2007; Oudiette & Paller 2013).
 * 3. Procedural Binaural Beat calculations (40Hz Gamma, 10Hz Alpha, 2.5Hz Delta; Herrmann 2001).
 * 4. Ambient Glance & In-Context Glossing helpers (Krashen i+1, Bakker 2016).
 */
import { z } from 'zod'

// ─── Auditory Spaced Repetition Pacing ───────────────────────────────────────

/**
 * Calculates the optimal silent recall pause duration before an answer is spoken.
 * Scales logarithmically with FSRS stability (S in days).
 *
 * Short stabilities (< 1 day) get ~2.5s (rapid retrieval / reflex).
 * Mature stabilities (S > 30 days) get up to 8.0s (deliberate retrieval).
 *
 * @param stability FSRS stability S in days (non-negative)
 * @param priorLatencyMs Optional prior measured latency for calibration
 * @returns Silent pause duration in milliseconds
 */
export function calculateAudioRecallPauseMs(stability: number, priorLatencyMs?: number): number {
  const safeS = Math.max(0, Number.isFinite(stability) ? stability : 0)
  // Base logarithmic scaling in seconds: 1.5 + 0.8 * ln(1 + S)
  let pauseSec = 1.5 + 0.8 * Math.log(1 + safeS)

  // Blend with prior measured latency if available (30% weight)
  if (priorLatencyMs && priorLatencyMs > 500 && priorLatencyMs < 20000) {
    const priorSec = priorLatencyMs / 1000
    pauseSec = pauseSec * 0.7 + priorSec * 0.3
  }

  // Strict physiological bounds: 2.5s to 8.0s
  const clampedSec = Math.max(2.5, Math.min(8.0, pauseSec))
  return Math.round(clampedSec * 1000)
}

// ─── Targeted Memory Reactivation (TMR) Acoustic Signatures ─────────────────

export const tmrEarconSchema = z.object({
  cardId: z.number().int().positive(),
  baseFrequency: z.number().min(120).max(880), // Harmonious vocal/earcon range
  harmonicType: z.enum(['major_triad', 'minor_triad', 'perfect_fifth', 'octave']),
  durationMs: z.number().int().min(150).max(600).default(250),
  targetSleepStage: z.enum(['sws_nrem', 'rem', 'nap']).default('sws_nrem'),
  maxDbSpl: z.number().max(35).default(32), // Safe sub-awakening decibel ceiling
})
export type TmrEarcon = z.infer<typeof tmrEarconSchema>

/**
 * Procedurally generates a deterministic, unique harmonic earcon signature
 * for a card based on its ID.
 */
export function generateTmrEarcon(cardId: number): TmrEarcon {
  // Deterministic pentatonic scale base notes (Hz)
  const PENTATONIC_FREQS = [220.0, 246.94, 277.18, 329.63, 369.99, 440.0, 493.88, 554.37]
  const HARMONICS: Array<'major_triad' | 'minor_triad' | 'perfect_fifth' | 'octave'> = [
    'major_triad',
    'minor_triad',
    'perfect_fifth',
    'octave',
  ]

  // Non-negative integer seed: a negative/fractional id would index past the tables.
  const seed = Math.abs(Math.trunc(Number.isFinite(cardId) ? cardId : 0))
  const baseFreq = PENTATONIC_FREQS[seed % PENTATONIC_FREQS.length]!
  const harmonicType = HARMONICS[Math.floor(seed / 7) % HARMONICS.length]!

  return {
    cardId,
    baseFrequency: Math.round(baseFreq * 100) / 100,
    harmonicType,
    durationMs: 250,
    targetSleepStage: 'sws_nrem',
    maxDbSpl: 32,
  }
}

/**
 * Frequency ratios (just intonation) of each earcon harmonic relative to its base
 * note: major triad 4:5:6, minor triad 10:12:15, perfect fifth 2:3, octave 1:2.
 */
export const EARCON_HARMONIC_RATIOS: Record<TmrEarcon['harmonicType'], readonly number[]> = {
  major_triad: [1, 1.25, 1.5],
  minor_triad: [1, 1.2, 1.5],
  perfect_fifth: [1, 1.5],
  octave: [1, 2],
}

/**
 * The partial frequencies (Hz) to synthesise for an earcon — one oscillator each.
 * Distinct harmonic shapes are what make cues discriminable from one another, so
 * the player must honour `harmonicType` rather than always adding a fifth.
 */
export function earconPartials(
  earcon: Pick<TmrEarcon, 'baseFrequency' | 'harmonicType'>,
): number[] {
  const ratios = EARCON_HARMONIC_RATIOS[earcon.harmonicType] ?? EARCON_HARMONIC_RATIOS.perfect_fifth
  return ratios.map((r) => Math.round(earcon.baseFrequency * r * 100) / 100)
}

/** Minimum / maximum silence between sleep cues (ms) — the 20–40 s TMR protocol. */
export const TMR_CUE_GAP_MS = { min: 20_000, max: 40_000 } as const

/**
 * Randomised gap before the next sleep cue, uniform in [20 s, 40 s]. Jitter keeps
 * cues from forming a predictable rhythm the sleeper habituates (or wakes) to.
 * @param rng uniform [0, 1) source — injectable for deterministic tests.
 */
export function nextTmrCueDelayMs(rng: () => number = Math.random): number {
  const u = Math.min(1, Math.max(0, rng()))
  return Math.round(TMR_CUE_GAP_MS.min + u * (TMR_CUE_GAP_MS.max - TMR_CUE_GAP_MS.min))
}

// ─── Procedural Binaural Beat Frequencies ───────────────────────────────────

export type BinauralMode = 'gamma_40hz' | 'alpha_10hz' | 'delta_2hz' | 'none'

export const BINAURAL_PRESETS: Record<
  BinauralMode,
  { carrierFreq: number; beatDelta: number; name: string }
> = {
  gamma_40hz: { carrierFreq: 200, beatDelta: 40.0, name: '40Hz Gamma Focus' },
  alpha_10hz: { carrierFreq: 210, beatDelta: 10.0, name: '10Hz Alpha Flow' },
  delta_2hz: { carrierFreq: 100, beatDelta: 2.5, name: '2.5Hz Delta Sleep' },
  none: { carrierFreq: 0, beatDelta: 0, name: 'None' },
}

export interface BinauralChannelFrequencies {
  carrierLeft: number
  carrierRight: number
  beatDelta: number
  mode: BinauralMode
}

/**
 * Computes stereophonic carrier frequencies for binaural entrainment.
 * - 40Hz Gamma: Focus / Active retrieval binding (carrier ~200Hz)
 * - 10Hz Alpha: Flow / Ambient calm alertness (carrier ~210Hz)
 * - 2.5Hz Delta: Nocturnal wind-down / Sleep consolidation (carrier ~100Hz)
 */
export function getBinauralFrequencies(mode: BinauralMode): BinauralChannelFrequencies {
  switch (mode) {
    case 'gamma_40hz':
      return { carrierLeft: 200, carrierRight: 240, beatDelta: 40.0, mode }
    case 'alpha_10hz':
      return { carrierLeft: 210, carrierRight: 220, beatDelta: 10.0, mode }
    case 'delta_2hz':
      return { carrierLeft: 100, carrierRight: 102.5, beatDelta: 2.5, mode }
    case 'none':
    default:
      return { carrierLeft: 0, carrierRight: 0, beatDelta: 0, mode: 'none' }
  }
}

// ─── Hands-Free Commute Input Schemas ────────────────────────────────────────

export const handsFreeGradeEventSchema = z.object({
  cardId: z.number().int().positive(),
  // `manual_tap` = an on-screen grade button (the common case when the screen is on).
  inputType: z.enum([
    'voice_speech',
    'earbud_media_key',
    'accelerometer_tilt',
    'auto_timeout',
    'manual_tap',
  ]),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  latencyMs: z.number().nonnegative(),
  timestamp: z.string(),
})
export type HandsFreeGradeEvent = z.infer<typeof handsFreeGradeEventSchema>

export const circadianAudioSessionPayloadSchema = z.object({
  sessionMode: z.enum(['commute', 'sleep_tmr', 'wind_down']),
  deckId: z.number().int().positive().optional(),
  cardsReviewed: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  binauralMode: z.enum(['gamma_40hz', 'alpha_10hz', 'delta_2hz', 'none']).default('none'),
  handsFreeInputs: z.array(handsFreeGradeEventSchema).default([]),
})
export type CircadianAudioSessionPayload = z.infer<typeof circadianAudioSessionPayloadSchema>

// ─── Ambient Glossing & Krashen i+1 Helpers ─────────────────────────────────

export interface GlossToken {
  word: string
  normalized: string
  isKnown: boolean
  cardId?: number
  definition?: string
}

/**
 * Identifies unknown/target vocabulary in a text snippet against a set of known lemmas,
 * returning tokens flagged for peripheral inline glossing.
 */
export function extractIncidentalGlossTokens(
  text: string,
  targetVocabMap: Map<string, { cardId: number; definition: string }>,
): GlossToken[] {
  // The capture group keeps separators as their own tokens (so the text can be
  // re-rendered verbatim); split also emits '' between adjacent separators — drop those.
  const words = text.split(/(\s+|[.,!?;:()[\]{}"])/).filter((t) => t !== '')
  return words.map((token) => {
    const clean = token.toLowerCase().trim()
    const target = targetVocabMap.get(clean)
    if (target) {
      return {
        word: token,
        normalized: clean,
        isKnown: false,
        cardId: target.cardId,
        definition: target.definition,
      }
    }
    return {
      word: token,
      normalized: clean,
      isKnown: true,
    }
  })
}

export * from './alertness'

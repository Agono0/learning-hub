/**
 * Learning HUB — Audio & Voice Spaced Repetition Core Domain.
 *
 * Implements speech grading with phonetic & Levenshtein fuzzy matching,
 * audio digest script generation for hands-free commute listening, and schemas.
 */
import { z } from 'zod'

export const speechEngineSchema = z.enum([
  'webspeech',
  'openai',
  'gemini',
  'elevenlabs',
  'local_wasm',
])
export type SpeechEngine = z.infer<typeof speechEngineSchema>

export interface AudioDigestCue {
  id: string
  cardId?: number
  phase: 'intro' | 'prompt' | 'pause' | 'answer' | 'outro'
  text: string
  pauseMs: number
}

export interface AudioDigestScript {
  totalEstimatedSeconds: number
  cardCount: number
  cues: AudioDigestCue[]
}

export interface CardReviewPrompt {
  id: number
  front: string
  back: string
  deckName?: string
}

export interface SpeechGradeResult {
  isMatch: boolean
  confidence: number
  grade: 1 | 2 | 3 | 4 // Again | Hard | Good | Easy
  spokenNormalized: string
  expectedNormalized: string
}

/**
 * Normalizes text for voice comparison (lowercases, removes punctuation & extra spaces).
 */
export function normalizeSpeechText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Standard Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1, // deletion
        dp[i]![j - 1]! + 1, // insertion
        dp[i - 1]![j - 1]! + cost, // substitution
      )
    }
  }

  return dp[m]![n]!
}

/**
 * Simple phonetic simplification rule (sound-alike reduction).
 */
export function phoneticSimplify(text: string): string {
  return text
    .replace(/e\b/g, '') // trailing silent e
    .replace(/ph/g, 'f')
    .replace(/ght/g, 't')
    .replace(/kn/g, 'n')
    .replace(/wr/g, 'r')
    .replace(/[aeiouy]+/g, 'a')
}

/**
 * Grades spoken audio answer against expected card answer with fuzzy phonetic tolerance.
 */
export function evaluateSpokenAnswer(spoken: string, expected: string): SpeechGradeResult {
  const spokenNorm = normalizeSpeechText(spoken)
  const expectedNorm = normalizeSpeechText(expected)

  if (!spokenNorm) {
    return {
      isMatch: false,
      confidence: 0,
      grade: 1,
      spokenNormalized: spokenNorm,
      expectedNormalized: expectedNorm,
    }
  }

  // Exact normalized match
  if (spokenNorm === expectedNorm) {
    return {
      isMatch: true,
      confidence: 1.0,
      grade: 4,
      spokenNormalized: spokenNorm,
      expectedNormalized: expectedNorm,
    }
  }

  // Substring containment match (e.g. spoken "it is Paris" contains "paris")
  if (spokenNorm.includes(expectedNorm) || expectedNorm.includes(spokenNorm)) {
    return {
      isMatch: true,
      confidence: 0.9,
      grade: 3,
      spokenNormalized: spokenNorm,
      expectedNormalized: expectedNorm,
    }
  }

  // Levenshtein similarity
  const maxLen = Math.max(spokenNorm.length, expectedNorm.length)
  const dist = levenshteinDistance(spokenNorm, expectedNorm)
  const rawSim = Math.max(0, 1 - dist / maxLen)

  // Phonetic similarity
  const spokenPhonetic = phoneticSimplify(spokenNorm)
  const expectedPhonetic = phoneticSimplify(expectedNorm)
  const phonMax = Math.max(spokenPhonetic.length, expectedPhonetic.length)
  const phonDist = levenshteinDistance(spokenPhonetic, expectedPhonetic)
  const phonSim = Math.max(0, 1 - phonDist / phonMax)

  // Combined confidence
  const confidence = Math.max(rawSim, phonSim * 0.95)

  let grade: 1 | 2 | 3 | 4 = 1
  let isMatch = false

  if (confidence >= 0.85) {
    grade = 4 // Easy
    isMatch = true
  } else if (confidence >= 0.7) {
    grade = 3 // Good
    isMatch = true
  } else if (confidence >= 0.5) {
    grade = 2 // Hard
    isMatch = false
  } else {
    grade = 1 // Again
    isMatch = false
  }

  return {
    isMatch,
    confidence: Number(confidence.toFixed(2)),
    grade,
    spokenNormalized: spokenNorm,
    expectedNormalized: expectedNorm,
  }
}

/**
 * Resamples an audio buffer (Float32Array) from any input sample rate to 16,000 Hz mono PCM,
 * suitable for on-device automatic speech recognition (Whisper).
 */
export function resampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) {
    return new Float32Array(input)
  }
  if (inputSampleRate <= 0 || input.length === 0) {
    return new Float32Array(0)
  }

  const ratio = inputSampleRate / 16000
  const outputLength = Math.round(input.length / ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const originalPos = i * ratio
    const indexLow = Math.floor(originalPos)
    const indexHigh = Math.min(input.length - 1, Math.ceil(originalPos))
    const fraction = originalPos - indexLow
    output[i] = input[indexLow]! * (1 - fraction) + input[indexHigh]! * fraction
  }

  return output
}

/**
 * Generates an audio narration script for commute/hands-free spaced repetition.
 */
export function generateAudioDigestScript(
  cards: CardReviewPrompt[],
  maxMinutes = 10,
): AudioDigestScript {
  const cues: AudioDigestCue[] = []
  const maxSeconds = maxMinutes * 60

  cues.push({
    id: 'intro',
    phase: 'intro',
    text: `Starting hands-free commute review. You have ${cards.length} cards scheduled. Speak your answer after each prompt.`,
    pauseMs: 1500,
  })

  let accumulatedSeconds = 8
  let includedCards = 0

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!
    const cleanFront = card.front.replace(/<[^>]*>/g, '').trim()
    const cleanBack = card.back.replace(/<[^>]*>/g, '').trim()

    // Estimate speaking duration: ~150 words per minute (2.5 words per sec)
    const promptWords = cleanFront.split(/\s+/).length
    const promptSecs = Math.max(2, Math.round(promptWords / 2.5))
    const pauseSecs = 4 // pause to allow user recall / speaking
    const answerWords = cleanBack.split(/\s+/).length
    const answerSecs = Math.max(2, Math.round(answerWords / 2.5))

    const itemTotal = promptSecs + pauseSecs + answerSecs + 2

    if (accumulatedSeconds + itemTotal > maxSeconds && includedCards > 0) {
      break
    }

    cues.push({
      id: `prompt-${card.id}`,
      cardId: card.id,
      phase: 'prompt',
      text: cleanFront,
      pauseMs: 0,
    })

    cues.push({
      id: `pause-${card.id}`,
      cardId: card.id,
      phase: 'pause',
      text: '...',
      pauseMs: pauseSecs * 1000,
    })

    cues.push({
      id: `answer-${card.id}`,
      cardId: card.id,
      phase: 'answer',
      text: cleanBack,
      pauseMs: 1000,
    })

    accumulatedSeconds += itemTotal
    includedCards++
  }

  cues.push({
    id: 'outro',
    phase: 'outro',
    text: `Commute review session complete! You studied ${includedCards} cards. Great consistency.`,
    pauseMs: 500,
  })

  return {
    totalEstimatedSeconds: accumulatedSeconds,
    cardCount: includedCards,
    cues,
  }
}

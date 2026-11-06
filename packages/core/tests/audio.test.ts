import { describe, expect, it } from 'vitest'
import {
  evaluateSpokenAnswer,
  generateAudioDigestScript,
  levenshteinDistance,
  normalizeSpeechText,
  phoneticSimplify,
} from '../src/audio/index'

describe('Audio & Speech Spaced Repetition Domain', () => {
  it('normalizes speech text accurately', () => {
    expect(normalizeSpeechText('  Paris, France!  ')).toBe('paris france')
    expect(normalizeSpeechText("It's... a test?")).toBe('it s a test')
  })

  it('calculates standard Levenshtein distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    expect(levenshteinDistance('paris', 'paris')).toBe(0)
    expect(levenshteinDistance('cat', 'hat')).toBe(1)
  })

  it('applies phonetic sound-alike simplifications', () => {
    expect(phoneticSimplify('phone')).toBe('fan')
    expect(phoneticSimplify('knight')).toBe('nat')
  })

  it('grades exact and substring speech matches with high confidence', () => {
    const exact = evaluateSpokenAnswer('Paris', 'Paris')
    expect(exact.isMatch).toBe(true)
    expect(exact.confidence).toBe(1.0)
    expect(exact.grade).toBe(4)

    const substring = evaluateSpokenAnswer('The answer is Paris France', 'Paris')
    expect(substring.isMatch).toBe(true)
    expect(substring.confidence).toBeGreaterThanOrEqual(0.85)
    expect([3, 4]).toContain(substring.grade)
  })

  it('evaluates phonetically similar spoken answers with tolerance', () => {
    // "fotons" vs "photons"
    const result = evaluateSpokenAnswer('fotons', 'photons')
    expect(result.isMatch).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.7)
    expect(result.grade).toBeGreaterThanOrEqual(3)
  })

  it('rejects completely incorrect spoken answers', () => {
    const wrong = evaluateSpokenAnswer('London', 'Tokyo')
    expect(wrong.isMatch).toBe(false)
    expect(wrong.grade).toBe(1)
    expect(wrong.confidence).toBeLessThan(0.5)
  })

  it('generates a structured audio digest podcast script from cards', () => {
    const cards = [
      { id: 1, front: 'What is the capital of Japan?', back: 'Tokyo' },
      { id: 2, front: 'What is the powerhouse of the cell?', back: 'Mitochondria' },
    ]

    const script = generateAudioDigestScript(cards, 5)
    expect(script.cardCount).toBe(2)
    expect(script.totalEstimatedSeconds).toBeGreaterThan(15)
    expect(script.cues[0]!.phase).toBe('intro')
    expect(script.cues[1]!.phase).toBe('prompt')
    expect(script.cues[1]!.text).toBe('What is the capital of Japan?')
    expect(script.cues[2]!.phase).toBe('pause')
    expect(script.cues[3]!.phase).toBe('answer')
    expect(script.cues[3]!.text).toBe('Tokyo')
    expect(script.cues.at(-1)!.phase).toBe('outro')
  })
})

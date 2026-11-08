import { describe, expect, it } from 'vitest'
import { computeLexicalCoverage, isEligibleForSrsPromotion, tokenizeText } from '../src/exposure'

describe('Ambient Exposure Ledger (Krashen i+1 & Spaced Encounters)', () => {
  it('tokenizes text into normalized unique word stems filtering punctuation and short tokens', () => {
    const text = 'Neuroplasticity allows the synaptic connections in our brain to adapt!'
    const tokens = tokenizeText(text)
    expect(tokens).toContain('neuroplasticity')
    expect(tokens).toContain('synaptic')
    expect(tokens).toContain('connections')
    expect(tokens).toContain('brain')
    expect(tokens).toContain('adapt')
    // Stop words or short tokens < 3 chars filtered
    expect(tokens).not.toContain('to')
    expect(tokens).not.toContain('in')
  })

  it('computes lexical coverage percentage and classifies into Krashen i+1 bands', () => {
    // 100 running tokens: 96 known, 4 unknown -> 96% coverage
    const tokens = Array.from({ length: 96 }, (_, i) => `word${i}`).concat([
      'novel1',
      'novel2',
      'novel3',
      'novel4',
    ])
    const known = new Set(Array.from({ length: 96 }, (_, i) => `word${i}`))

    const coverage = computeLexicalCoverage(tokens, known)
    expect(coverage.coveragePercent).toBe(96)
    expect(coverage.zone).toBe('optimal') // 95-98% Krashen band
  })

  it('classifies low coverage (<95%) as frustration zone', () => {
    const tokens = ['quantum', 'superposition', 'decoherence', 'entanglement', 'wavefunction']
    const known = new Set(['quantum']) // 20% known
    const coverage = computeLexicalCoverage(tokens, known)
    expect(coverage.coveragePercent).toBeLessThan(95)
    expect(coverage.zone).toBe('frustration')
  })

  it('evaluates SRS promotion threshold (>= 5 encounters across >= 3 distinct days)', () => {
    // Case 1: 5 encounters on same day -> false
    const sameDay = [
      { createdAt: '2026-11-01T10:00:00Z' },
      { createdAt: '2026-11-01T11:00:00Z' },
      { createdAt: '2026-11-01T12:00:00Z' },
      { createdAt: '2026-11-01T14:00:00Z' },
      { createdAt: '2026-11-01T16:00:00Z' },
    ]
    expect(isEligibleForSrsPromotion(sameDay)).toBe(false)

    // Case 2: 5 encounters across 3 distinct days -> true
    const spaced = [
      { createdAt: '2026-11-01T10:00:00Z' },
      { createdAt: '2026-11-01T14:00:00Z' },
      { createdAt: '2026-11-03T09:00:00Z' },
      { createdAt: '2026-11-05T18:00:00Z' },
      { createdAt: '2026-11-05T20:00:00Z' },
    ]
    expect(isEligibleForSrsPromotion(spaced)).toBe(true)

    // Case 3: only 4 encounters -> false
    expect(isEligibleForSrsPromotion(spaced.slice(0, 4))).toBe(false)
  })
})

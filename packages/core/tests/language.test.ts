/**
 * Agent A — language module tests: i+1 checking, grammar cards, digit chunking.
 */
import { describe, expect, it } from 'vitest'
import { buildGrammarCard, checkOneT, chunkDigits } from '../src/language'

describe('checkOneT (i+1 comprehensible input)', () => {
  const known = ['the', 'cat', 'sat', 'on', 'mat', 'a', 'dog', 'ran']

  it('passes with zero unknown words (i)', () => {
    const out = checkOneT('The cat sat on the mat', known)
    expect(out.ok).toBe(true)
    expect(out.unknownWords).toEqual([])
    expect(out.totalWords).toBe(6)
  })

  it('passes with exactly one unknown word (i+1)', () => {
    const out = checkOneT('The cat sat on the velvet mat', known)
    expect(out.ok).toBe(true)
    expect(out.unknownWords).toEqual(['velvet'])
  })

  it('fails with two unknown words (i+2)', () => {
    const out = checkOneT('The cat sprawled across the velvet mat', known)
    expect(out.ok).toBe(false)
    expect(out.unknownWords).toEqual(['sprawled', 'across', 'velvet'])
  })

  it('is case-insensitive and dedupes unknowns', () => {
    const out = checkOneT('Velvet velvet VELVET', known)
    expect(out.unknownWords).toEqual(['velvet'])
    expect(out.totalWords).toBe(3)
  })

  it('works with a Set of known words', () => {
    const out = checkOneT('A dog ran', new Set(['a', 'dog', 'ran']))
    expect(out.ok).toBe(true)
    expect(out.knownCount).toBe(3)
  })
})

describe('buildGrammarCard', () => {
  it('builds grammar content with pattern and target', () => {
    const out = buildGrammarCard({
      sentence: 'Je vais au marché',
      pattern: 'aller + au + place',
      target: 'au',
      translation: 'I go to the market',
    })
    expect(out.type).toBe('grammar')
    expect(out.content.grammar).toEqual({
      sentence: 'Je vais au marché',
      pattern: 'aller + au + place',
      target: 'au',
      translation: 'I go to the market',
    })
  })

  it('is case-insensitive about the target match', () => {
    expect(() =>
      buildGrammarCard({ sentence: 'I go home', pattern: 'p', target: 'Go' }),
    ).not.toThrow()
  })

  it('throws when the target is not in the sentence', () => {
    expect(() => buildGrammarCard({ sentence: 'I go home', pattern: 'p', target: 'walk' })).toThrow(
      /not found/,
    )
  })
})

describe('chunkDigits', () => {
  it('chunks even-length numbers into pairs', () => {
    expect(chunkDigits(4125)).toEqual([41, 25])
    expect(chunkDigits('4125')).toEqual([41, 25])
  })

  it('leads odd-length numbers with a single digit', () => {
    expect(chunkDigits(352)).toEqual([3, 52])
    expect(chunkDigits(7)).toEqual([7])
  })

  it('strips non-digits and handles edge cases', () => {
    expect(chunkDigits('12-34')).toEqual([12, 34])
    expect(chunkDigits(0)).toEqual([0])
    expect(chunkDigits('')).toEqual([])
  })
})

/**
 * Agent A — memory module tests: Major system, PAO, palace walk order.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  MAJOR_FAMILIES,
  MAJOR_SYSTEM,
  buildPaoEntry,
  majorToWord,
  palaceWalkOrder,
  splitPao,
  wordToMajorDigits,
} from '../src/memory'

describe('Major system', () => {
  it('exposes the canonical digit→consonant map', () => {
    expect(MAJOR_SYSTEM).toEqual({
      '0': 's', '1': 't', '2': 'n', '3': 'm', '4': 'r',
      '5': 'l', '6': 'sh', '7': 'k', '8': 'f', '9': 'p',
    })
    // every digit 0-9 has a phoneme family
    for (let d = 0; d <= 9; d++) {
      expect(MAJOR_FAMILIES[String(d)].length).toBeGreaterThan(0)
    }
  })

  it('majorToWord builds the phonetic skeleton', () => {
    expect(majorToWord(42)).toBe('rn') // rain / ruin
    expect(majorToWord(35)).toBe('ml') // mail
    expect(majorToWord('0119')).toBe('sttp')
    expect(majorToWord(0)).toBe('s')
    expect(majorToWord('abc')).toBe('')
  })

  it('wordToMajorDigits decodes user words (vowels ignored)', () => {
    expect(wordToMajorDigits('rain')).toBe('42')
    expect(wordToMajorDigits('mail')).toBe('35')
    expect(wordToMajorDigits('shine')).toBe('62')
    expect(wordToMajorDigits('photo')).toBe('81') // ph → 8
    expect(wordToMajorDigits('atheist')).toBe('101')
  })

  it('property: wordToMajorDigits inverts majorToWord for single-letter consonants', () => {
    // digits whose canonical consonant is one letter (excl. 6 = 'sh', which
    // creates ambiguous decodings next to 0/s) round-trip exactly
    const singleLetterDigits = ['0', '1', '2', '3', '4', '5', '7', '8', '9']
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...singleLetterDigits), { minLength: 1, maxLength: 6 }),
        (digits) => {
          const n = digits.join('')
          expect(wordToMajorDigits(majorToWord(n))).toBe(n)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('PAO helpers', () => {
  it('splitPao splits 6 digits into person/action/object', () => {
    expect(splitPao(412537)).toEqual({ person: 41, action: 25, object: 37 })
    expect(splitPao('004231')).toEqual({ person: 0, action: 42, object: 31 })
  })

  it('splitPao rejects non-6-digit input', () => {
    expect(() => splitPao(12345)).toThrow(/6 digits/)
    expect(() => splitPao(1234567)).toThrow(/6 digits/)
  })

  it('buildPaoEntry produces a mnemonic_tables row shape', () => {
    expect(buildPaoEntry(41, 'Saturn', 'to tip', 'a rod')).toEqual({
      kind: 'pao',
      code: '41',
      person: 'Saturn',
      action: 'to tip',
      object: 'a rod',
    })
    expect(() => buildPaoEntry(4, 'a', 'b', 'c')).toThrow(/2-digit/)
  })
})

describe('palaceWalkOrder', () => {
  it('sorts by lociIndex ascending without mutating input', () => {
    const items = [
      { lociIndex: 2, name: 'bookshelf' },
      { lociIndex: 0, name: 'doormat' },
      { lociIndex: 1, name: 'coat rack' },
    ]
    const out = palaceWalkOrder(items)
    expect(out.map((i) => i.name)).toEqual(['doormat', 'coat rack', 'bookshelf'])
    expect(items.map((i) => i.lociIndex)).toEqual([2, 0, 1])
  })

  it('is stable for equal loci and works on empty input', () => {
    const items = [
      { lociIndex: 1, name: 'a' },
      { lociIndex: 1, name: 'b' },
    ]
    expect(palaceWalkOrder(items).map((i) => i.name)).toEqual(['a', 'b'])
    expect(palaceWalkOrder([])).toEqual([])
  })
})

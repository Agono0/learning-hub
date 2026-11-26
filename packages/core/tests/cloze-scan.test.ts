import { describe, expect, it } from 'vitest'
import { clozeSegments, findClozeMarkers, hasClozeMarker, parseCloze } from '../src/cards'
import { extractMarkdownNotesAndClozes } from '../src/multimodal'

/** The regex the scanner replaced; the differential test pins the scanner to it. */
const REFERENCE = /\{\{c(\d+)::(.*?)\}\}/g
const reference = (text: string) =>
  [...text.matchAll(REFERENCE)].map((m) => ({
    index: m.index!,
    end: m.index! + m[0].length,
    num: m[1]!,
    inner: m[2]!,
  }))

/** Small deterministic PRNG so a failing case is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('findClozeMarkers', () => {
  it('returns exactly the matches of the original regex on random marker-like text', () => {
    const alphabet = ['{', '{', '}', '}', 'c', '1', '2', ':', ':', 'x', '\n', '\r', '\u2028', ' ']
    const rand = rng(12345)
    for (let n = 0; n < 6000; n++) {
      const len = Math.floor(rand() * 40)
      let s = ''
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rand() * alphabet.length)]
      expect(findClozeMarkers(s), JSON.stringify(s)).toEqual(reference(s))
      expect(hasClozeMarker(s), JSON.stringify(s)).toBe(reference(s).length > 0)
    }
  })

  it('returns exactly the matches of the original regex on random token soup', () => {
    const tokens = ['{{c1::', '{{c23::', '}}', '}', '{', 'x', '::', '\n', '\r\n', 'c', ' ']
    const rand = rng(777)
    for (let n = 0; n < 6000; n++) {
      const len = Math.floor(rand() * 14)
      let s = ''
      for (let i = 0; i < len; i++) s += tokens[Math.floor(rand() * tokens.length)]
      expect(findClozeMarkers(s), JSON.stringify(s)).toEqual(reference(s))
    }
  })

  it('matches the regex on hand-picked edge cases', () => {
    for (const s of [
      '{{c1::a}}',
      '{{c12::a::hint}} and {{c2::b}}',
      '{{c1::}}',
      '{{c1::a}}}',
      '{{{c1::a}}',
      '{{c1::a\n}}',
      '{{c1::a\r}}',
      '{{c1::a\u2029}}',
      '{{c::a}}',
      '{{c1:a}}',
      '{{c1::{{c2::a}}',
      '{{c1::a}} {{c2::b',
      'x{{c1::a\n{{c2::b}}',
      '',
    ]) {
      expect(findClozeMarkers(s), JSON.stringify(s)).toEqual(reference(s))
    }
  })

  it('keeps parseCloze and clozeSegments results for normal text', () => {
    expect(parseCloze('The capital of {{c1::France}} is {{c2::Paris::a city}}.')).toEqual({
      text: 'The capital of {{c1::France}} is {{c2::Paris::a city}}.',
      answers: ['France', 'Paris'],
      mode: 'enumeration',
      hint: 'a city',
    })
    expect(clozeSegments('a {{c1::b}} c')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'blank', index: 1, answer: 'b' },
      { kind: 'text', text: ' c' },
    ])
  })
})

describe('hostile input stays linear', () => {
  const big = 200_000
  const openers = '{{c1::'.repeat(Math.ceil(big / 6))
  const LIMIT_MS = 1000 // the old code needs seconds for each of these shapes

  it('many openers and no closer', () => {
    const t = Date.now()
    expect(findClozeMarkers(openers)).toEqual([])
    expect(parseCloze(openers).answers).toEqual([])
    expect(Date.now() - t).toBeLessThan(LIMIT_MS)
  })

  it('many openers with a closer only on a later line', () => {
    const t = Date.now()
    const text = `${openers}\nx}}`
    expect(findClozeMarkers(text)).toEqual([])
    expect(Date.now() - t).toBeLessThan(LIMIT_MS)
  })

  it('many openers with one trailing closer is a single marker', () => {
    const t = Date.now()
    const text = `${openers}}}`
    const found = findClozeMarkers(text)
    expect(found).toHaveLength(1)
    expect(found[0]!.index).toBe(0)
    expect(Date.now() - t).toBeLessThan(LIMIT_MS)
  })

  it('the markdown_notes extractor on one huge hostile line', () => {
    const t = Date.now()
    const cards = extractMarkdownNotesAndClozes(openers)
    expect(cards.filter((c) => c.format === 'cloze')).toEqual([])
    expect(Date.now() - t).toBeLessThan(LIMIT_MS)
  })
})

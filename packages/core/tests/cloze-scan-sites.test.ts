import { describe, expect, it } from 'vitest'
import {
  cardFrontText,
  replaceClozeMarkers,
  suggestGenerationLadderForCard,
  syncBulletCard,
  validateCardContent,
} from '../src/index'
import { cardSides } from '../src/games'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('replaceClozeMarkers', () => {
  it('matches String.replace with the old regex on random token soup', () => {
    const tokens = ['{{c1::', '{{c23::', '}}', '}', '{', 'x', '::', '\n', '\r\n', 'c', ' ', '$1']
    const rand = rng(4242)
    for (let n = 0; n < 6000; n++) {
      const len = Math.floor(rand() * 14)
      let s = ''
      for (let i = 0; i < len; i++) s += tokens[Math.floor(rand() * tokens.length)]
      expect(
        replaceClozeMarkers(s, () => '___'),
        JSON.stringify(s),
      ).toBe(s.replace(/\{\{c\d+::.*?\}\}/g, '___'))
      expect(
        replaceClozeMarkers(s, (inner) => inner),
        JSON.stringify(s),
      ).toBe(s.replace(/\{\{c\d+::(.*?)\}\}/g, '$1'))
    }
  })
})

describe('every cloze text consumer stays linear on hostile text', () => {
  const hostile = '{{c1::'.repeat(Math.ceil(200_000 / 6))
  const LIMIT_MS = 1000 // the old regexes need seconds for each of these at 200 KB
  const timed = (fn: () => void) => {
    const t = Date.now()
    fn()
    return Date.now() - t
  }

  it('validateCardContent (cloze) rejects text with no closed marker quickly', () => {
    let result: ReturnType<typeof validateCardContent> | undefined
    expect(
      timed(() => {
        result = validateCardContent('cloze', {
          cloze: { text: hostile, answers: ['a'], mode: 'basic' },
        })
      }),
    ).toBeLessThan(LIMIT_MS)
    expect(result?.ok).toBe(false)
  })

  it('syncBulletCard does not treat it as a cloze', () => {
    let type = ''
    expect(timed(() => (type = syncBulletCard(hostile, 1).type))).toBeLessThan(LIMIT_MS)
    expect(type).not.toBe('cloze')
  })

  it('cardFrontText and cardSides keep the text', () => {
    const content = { cloze: { text: hostile, answers: ['a'], mode: 'basic' } } as never
    expect(timed(() => cardFrontText(content))).toBeLessThan(LIMIT_MS)
    expect(timed(() => cardSides(content))).toBeLessThan(LIMIT_MS)
  })

  it('the doctor ladder suggestion', () => {
    const card = {
      id: 1,
      type: 'cloze',
      lapses: 9,
      content: { cloze: { text: hostile, answers: ['a'], mode: 'basic' } },
    } as never
    expect(timed(() => suggestGenerationLadderForCard(card))).toBeLessThan(LIMIT_MS)
  })

  it('normal cloze text is unchanged', () => {
    expect(
      cardFrontText({
        cloze: { text: 'A {{c1::b}} c {{c2::d::hint}}', answers: ['b', 'd'], mode: 'enumeration' },
      } as never),
    ).toBe('A ___ c ___')
    expect(
      validateCardContent('cloze', {
        cloze: { text: 'A {{c1::b}}', answers: ['b'], mode: 'basic' },
      }).ok,
    ).toBe(true)
  })
})

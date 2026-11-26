import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

/** Source with comments removed, so a doc comment may still mention the old regex. */
function codeOf(file: string): string {
  const src = readFileSync(fileURLToPath(new URL(`../src/${file}`, import.meta.url)), 'utf8')
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('cloze text consumers', () => {
  // Hostile shape, small enough that even the old regex finishes at once: the results of the
  // shared scanner must equal what the old regexes gave for it.
  const hostile = '{{c1::'.repeat(300)
  const mixed = `${hostile}\nA {{c1::b}} and {{c2::d::hint}}\n${hostile}}}`

  it('give the same results as the old regexes on hostile-shaped text', () => {
    for (const text of [hostile, mixed]) {
      const content = { cloze: { text, answers: ['a'], mode: 'basic' } } as never
      expect(cardFrontText(content)).toBe(text.replace(/\{\{c\d+::.*?\}\}/g, '___'))
      expect(cardSides(content)?.left).toBe(text.replace(/\{\{c\d+::.*?\}\}/g, '___'))
      expect(syncBulletCard(text, 1).type === 'cloze').toBe(/\{\{c\d+::.*?\}\}/.test(text))
      expect(
        validateCardContent('cloze', { cloze: { text, answers: ['a'], mode: 'basic' } }).ok,
      ).toBe(/\{\{c\d+::.*?\}\}/.test(text))
    }
  })

  it('reject cloze text with no closed marker', () => {
    expect(
      validateCardContent('cloze', { cloze: { text: hostile, answers: ['a'], mode: 'basic' } }).ok,
    ).toBe(false)
    expect(syncBulletCard(hostile, 1).type).not.toBe('cloze')
  })

  it('doctor suggestion works on the hostile shape', () => {
    const card = {
      id: 1,
      type: 'cloze',
      lapses: 9,
      content: { cloze: { text: mixed, answers: ['a'], mode: 'basic' } },
    } as never
    expect(() => suggestGenerationLadderForCard(card)).not.toThrow()
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

  // The old regex is quadratic on unclosed openers; a wall-clock bound would be flaky, so pin
  // the fix structurally: these files must not carry the lazy cloze regex any more.
  it.each(['cards.ts', 'games.ts', 'linter.ts', 'doctor.ts', 'multimodal/index.ts'])(
    '%s no longer uses the lazy cloze regex',
    (file) => {
      expect(codeOf(file)).not.toMatch(/\\\{\\\{c/)
    },
  )
})

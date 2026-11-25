import { describe, expect, it } from 'vitest'
import {
  isEmptyField,
  parseTemplate,
  renderTemplate,
  TEMPLATE_LIMITS,
  UnsupportedModelError,
  validateTemplate,
} from '../../src/anki-import'

const known = new Set(['Front', 'Back', 'Extra', 'Tags', 'Type'])
const vals = (o: Record<string, string>) => new Map(Object.entries(o))
const render = (src: string, o: Record<string, string>, front: string | null = null) =>
  renderTemplate(parseTemplate(src), vals(o), front)

describe('renderTemplate', () => {
  it('substitutes fields and keeps literal text', () => {
    expect(render('Q: {{Front}} / A: {{Back}}', { Front: 'x', Back: 'y' })).toBe('Q: x / A: y')
  })

  it('{{#F}} renders only when the field is non-empty, {{^F}} only when empty', () => {
    const t = '{{#Extra}}[{{Extra}}]{{/Extra}}{{^Extra}}none{{/Extra}}'
    expect(render(t, { Extra: 'e' })).toBe('[e]')
    expect(render(t, { Extra: '' })).toBe('none')
  })

  it('whitespace-only counts as empty (upstream field_is_empty, plain-text part)', () => {
    expect(isEmptyField('  \n\t ')).toBe(true)
    expect(isEmptyField('0')).toBe(false)
    expect(render('{{#Extra}}x{{/Extra}}', { Extra: ' \n ' })).toBe('')
  })

  it('nested conditionals need every enclosing key', () => {
    const t = '{{#Front}}{{#Back}}both{{/Back}}{{^Back}}front only{{/Back}}{{/Front}}'
    expect(render(t, { Front: 'a', Back: 'b' })).toBe('both')
    expect(render(t, { Front: 'a', Back: '' })).toBe('front only')
    expect(render(t, { Front: '', Back: 'b' })).toBe('')
  })

  it('FrontSide inserts the already rendered question text verbatim', () => {
    expect(render('{{FrontSide}}|{{Back}}', { Back: 'b' }, 'Q text')).toBe('Q text|b')
  })

  it('field values are inserted as plain text, not re-scanned for template tags', () => {
    expect(render('{{Front}}', { Front: '{{Back}} {{#X}}' })).toBe('{{Back}} {{#X}}')
  })

  it('throws output-too-large past the cap instead of truncating', () => {
    const big = 'x'.repeat(TEMPLATE_LIMITS.maxRenderedChars)
    expect(render('{{Front}}', { Front: big })).toHaveLength(TEMPLATE_LIMITS.maxRenderedChars)
    expect(() => render('{{Front}}y', { Front: big })).toThrow(UnsupportedModelError)
    expect(() => render('{{Front}}{{Front}}', { Front: big })).toThrow(/output-too-large/)
  })
})

describe('validateTemplate', () => {
  const check = (src: string, side: 'question' | 'answer') => () =>
    validateTemplate(parseTemplate(src), known, side)

  it('accepts known fields and special fields', () => {
    expect(check('{{Front}}{{Tags}}{{Type}}', 'question')).not.toThrow()
  })

  it('refuses unknown keys in replacements and conditionals, even in a branch never rendered', () => {
    expect(check('{{Nope}}', 'question')).toThrow(/unknown-key/)
    expect(check('{{#Nope}}x{{/Nope}}', 'answer')).toThrow(/unknown-key/)
    expect(check('{{#Front}}{{Nope}}{{/Front}}', 'answer')).toThrow(/unknown-key/)
  })

  it('FrontSide is valid on the answer side only, and never as a conditional key', () => {
    expect(check('{{FrontSide}}', 'answer')).not.toThrow()
    expect(check('{{FrontSide}}', 'question')).toThrow(/frontside-on-question/)
    expect(check('{{#FrontSide}}x{{/FrontSide}}', 'answer')).toThrow(/unknown-key/)
  })

  it('Deck, Subdeck, Card and CardFlag need card context and are refused as unknown', () => {
    for (const k of ['Deck', 'Subdeck', 'Card', 'CardFlag']) {
      expect(check(`{{${k}}}`, 'question'), k).toThrow(/unknown-key/)
    }
  })
})

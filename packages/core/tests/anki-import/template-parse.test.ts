import { describe, expect, it } from 'vitest'
import {
  parseTemplate,
  TEMPLATE_LIMITS,
  UnsupportedModelError,
  type RefusalCode,
} from '../../src/anki-import'

const code = (src: string): RefusalCode | null => {
  try {
    parseTemplate(src)
    return null
  } catch (e) {
    if (e instanceof UnsupportedModelError) return e.code
    throw e
  }
}

describe('parseTemplate (grounded in rslib/src/template.rs at 25.09.2)', () => {
  it('parses text, replacements and nested conditionals', () => {
    const nodes = parseTemplate('a{{F}}{{#X}}b{{^Y}}c{{/Y}}{{/X}}')
    expect(nodes).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'field', name: 'F' },
      {
        kind: 'cond',
        name: 'X',
        negated: false,
        children: [
          { kind: 'text', text: 'b' },
          { kind: 'cond', name: 'Y', negated: true, children: [{ kind: 'text', text: 'c' }] },
        ],
      },
    ])
  })

  it('trims whitespace inside tags like upstream, keeps field names with spaces', () => {
    expect(parseTemplate('{{ Back Extra }}')).toEqual([{ kind: 'field', name: 'Back Extra' }])
    expect(parseTemplate('{{# X }}y{{/ X }}')).toHaveLength(1)
  })

  it('an unclosed `{{` is not a tag upstream; here a tag without closing braces is refused', () => {
    expect(code('a {{Front')).toBe('unbalanced')
  })

  it('refuses unbalanced and mismatched conditionals', () => {
    expect(code('{{#A}}x')).toBe('unbalanced')
    expect(code('x{{/A}}')).toBe('unbalanced')
    expect(code('{{#A}}x{{/B}}')).toBe('unbalanced')
    expect(code('{{#A}}{{#B}}x{{/A}}{{/B}}')).toBe('unbalanced')
  })

  it('refuses any filter (upstream would silently ignore unknown ones)', () => {
    for (const f of [
      'text:F',
      'cloze:F',
      'hint:F',
      'type:F',
      'furigana:F',
      'tts en_US:F',
      'a:b:F',
    ]) {
      expect(code(`{{${f}}}`), f).toBe('filter')
    }
  })

  it('refuses syntax this path does not support', () => {
    expect(code('{{}}')).toBe('syntax')
    expect(code('{{{F}}}')).toBe('syntax')
    expect(code('{{=<% %>=}}')).toBe('syntax')
    expect(code('{{!comment}}')).toBe('syntax')
    expect(code('{{#}}x{{/}}')).toBe('syntax')
  })

  it('refuses markup, entities and media/type tags in template text', () => {
    for (const t of [
      '<div>{{F}}</div>',
      'a<br>b',
      '{{F}} &nbsp;',
      '[sound:a.mp3]',
      '[type:F]',
      '<!-- c -->',
    ]) {
      expect(code(t), t).toBe('html-or-media')
    }
  })

  it('caps conditional depth, node count and template size, each with a typed refusal', () => {
    const deep = (n: number) => '{{#A}}'.repeat(n) + 'x' + '{{/A}}'.repeat(n)
    expect(code(deep(TEMPLATE_LIMITS.maxDepth))).toBeNull()
    expect(code(deep(TEMPLATE_LIMITS.maxDepth + 1))).toBe('too-deep')
    expect(code('{{F}}'.repeat(TEMPLATE_LIMITS.maxNodes))).toBeNull()
    expect(code('{{F}}'.repeat(TEMPLATE_LIMITS.maxNodes + 1))).toBe('too-many-nodes')
    expect(code('a'.repeat(TEMPLATE_LIMITS.maxTemplateChars + 1))).toBe('template-too-large')
  })

  it('a very deep or wide hostile template fails fast without recursion in the parser', () => {
    const t0 = Date.now()
    expect(code('{{#A}}'.repeat(10_000))).toBe('too-deep')
    expect(code('{{'.repeat(1_000_000))).not.toBeNull()
    expect(Date.now() - t0).toBeLessThan(2_000)
  })
})

import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Markdown } from '../src/ui/Markdown'

describe('Markdown blocks follow the direction of their text', () => {
  const html = renderToString(
    React.createElement(
      Markdown,
      null,
      '# عنوان\n\nمرحبا بالعالم\n\n- بند أول\n- item two\n\n> اقتباس\n\n| أ | b |\n|---|---|\n| 1 | 2 |',
    ),
  )
  it.each([
    '<p dir="auto">',
    '<li dir="auto">',
    '<h1 dir="auto">',
    '<blockquote dir="auto">',
    '<th dir="auto">',
    '<td dir="auto">',
  ])('renders %s', (tag) => expect(html).toContain(tag))
  it('keeps the Arabic text intact', () => {
    expect(html).toContain('مرحبا بالعالم')
  })
  it('free-text inputs use plaintext bidi in the global stylesheet', () => {
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8')
    expect(css).toMatch(/textarea,[\s\S]*unicode-bidi:\s*plaintext/)
  })
})

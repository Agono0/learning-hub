/**
 * Source-contract test: study content is user-authored and may be Arabic, English or mixed, so
 * every card-face text block on the Review page must set `dir="auto"` (the browser then picks the
 * direction per block from its first strong character). This does NOT prove full RTL layout
 * (the surrounding chrome stays LTR); it only pins that card text is not forced LTR.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(__dirname, '../app/review/page.tsx'), 'utf8')

const flat = src.replace(/\s+/g, ' ')

describe('review card faces use dir="auto"', () => {
  it('basic front and back, cloze text, typein and mcq questions', () => {
    expect(flat).toContain('<div dir="auto" className="text-xl font-medium">{front}</div>')
    expect(flat).toContain('<div dir="auto">{content.basic.back}</div>')
    expect(flat).toContain('<div dir="auto" className="text-xl leading-loose">')
    const questions = flat.match(
      /<div dir="auto" className="text-xl font-medium">\{question\}<\/div>/g,
    )
    expect(questions?.length).toBe(2)
  })
})

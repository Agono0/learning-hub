import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { summarizeImport } from '../src/lib/import-summary'
import { StatusLineView } from '../src/components/StatusLineView'

;(globalThis as { React?: typeof React }).React = React

describe('summarizeImport', () => {
  it('a clean import has no warning', () => {
    expect(summarizeImport({ imported: 12 })).toEqual({
      headline: 'Imported 12 cards',
      warning: null,
    })
    expect(summarizeImport({ imported: 1, rejectedCards: 0, skippedModels: [] }).warning).toBeNull()
  })

  it('reports rejected cards with a correct singular and plural', () => {
    expect(summarizeImport({ imported: 3, rejectedCards: 1 }).warning).toBe(
      '1 card was not imported because it failed validation.',
    )
    expect(summarizeImport({ imported: 3, rejectedCards: 4 }).warning).toBe(
      '4 cards were not imported because they failed validation.',
    )
  })

  it('names skipped note types and does not invent counts or reasons', () => {
    const w = summarizeImport({ imported: 5, skippedModels: ['Image Occlusion'] }).warning!
    expect(w).toBe('Notes using 1 unsupported note type were skipped: Image Occlusion.')
    expect(w).not.toMatch(/\d+ notes/)
  })

  it('says both when both happened, and keeps an import of zero visible', () => {
    const s = summarizeImport({ imported: 0, rejectedCards: 2, skippedModels: ['A', 'B'] })
    expect(s.headline).toBe('Imported 0 cards')
    expect(s.warning).toContain('2 cards were not imported')
    expect(s.warning).toContain('2 unsupported note types were skipped: A, B.')
  })

  it('caps the names shown, truncates long names and ignores blanks', () => {
    const names = ['Alpha', 'B', 'C', 'D', 'E', 'F', 'G', '  ']
    const w = summarizeImport({ imported: 1, skippedModels: names }).warning!
    expect(w).toContain('7 unsupported note types')
    expect(w).toContain('Alpha, B, C, D, E and 2 more.')
    const long = summarizeImport({ imported: 1, skippedModels: ['x'.repeat(200)] }).warning!
    expect(long.length).toBeLessThan(160)
    expect(long).toContain('…')
  })
})

describe('StatusLineView', () => {
  const html = (kind: 'ok' | 'warn' | 'error' | 'info') =>
    renderToStaticMarkup(createElement(StatusLineView, { line: { kind, text: 'x' } }))

  it('a partial import is visibly a warning, announced, and labelled in text', () => {
    const warn = html('warn')
    expect(warn).toContain('Partly imported.')
    expect(warn).toContain('role="alert"')
    expect(warn).toContain('amber')
    expect(html('ok')).not.toContain('Partly imported')
    expect(html('ok')).not.toContain('role=')
  })
})

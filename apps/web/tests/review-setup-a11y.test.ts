import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Source-level contract for the Review setup screen (no DOM render: the page needs the full
 * app providers). It guards the accessibility fixes from the independent source review of the
 * redesign: a programmatic name for the session-size input and a pressed state on every
 * toggle-style choice (deck chips, multi-deck chips, session modes).
 */
const src = readFileSync(path.resolve(__dirname, '../app/review/page.tsx'), 'utf8')

describe('review setup accessibility contract', () => {
  it('names the session size input', () => {
    expect(src).toMatch(/aria-label="Session size \(cards\)"/)
  })

  it('exposes pressed state on deck chips, multi-deck chips and session modes', () => {
    expect(src).toContain('aria-pressed={deckId === null}')
    expect(src).toContain('aria-pressed={deckId === d.id}')
    expect(src).toContain('aria-pressed={isSelected}')
    expect(src).toContain('aria-pressed={mode === m}')
  })

  it('keeps exactly one primary Start session button on the setup screen', () => {
    const matches = src.match(/<Zap className="h-4 w-4" \/> Start session/g) ?? []
    expect(matches).toHaveLength(1)
  })
})

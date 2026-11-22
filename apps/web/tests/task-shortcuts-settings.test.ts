/**
 * Shortcuts settings section (S3-35) — SSR of the map rows (defaults shown,
 * capture affordance, no recording until clicked) + a device-local family
 * smoke. The core resolver is unit-tested in tasks-shortcuts.test.ts.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { ShortcutsSection } from '../src/components/settings/ShortcutsSection'

const section = (): string =>
  renderToString(React.createElement(ShortcutsSection)).replace(/<!-- -->/g, '')

describe('ShortcutsSection rendering', () => {
  it('renders every default binding with its combo', () => {
    const html = section()
    expect(html).toContain('Keyboard shortcuts (this device)')
    expect(html).toContain('Move the cursor down')
    expect(html).toContain('Move the cursor up')
    expect(html).toContain('Open the shortcut cheat sheet')
    expect(html).toContain('j')
    expect(html).toContain('?')
  })

  it('shows the capture affordance without recording on SSR', () => {
    const html = section()
    expect(html).not.toContain('Press a key')
    expect(html).toContain('Rebind')
  })

  it('keeps rows calm until a conflict exists (no conflict copy on defaults)', () => {
    expect(section()).not.toContain('Duplicate combo')
  })
})

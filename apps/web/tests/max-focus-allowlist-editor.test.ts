/**
 * MaxFocusAllowlistEditor (M2-22) integration test — SSR renderToString with
 * a fresh QueryClient: the editor frame, honest empty state before data, and
 * the create affordance. CRUD behavior against the allowlists handlers is
 * covered by the repo tests (focus-lock-repo.test.ts) and the handlers
 * themselves; this pins the render contract.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MaxFocusAllowlistEditor } from '../src/components/MaxFocusAllowlistEditor'

const render = (): string => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(MaxFocusAllowlistEditor),
    ),
  )
}

describe('MaxFocusAllowlistEditor', () => {
  it('renders the editor frame with the create affordance', () => {
    const html = render()
    expect(html).toContain('Allowlist presets')
    expect(html).toContain('New allowlist preset name')
    expect(html).toContain('Create')
  })

  it('is honest about loading and edits-apply-to-future-sessions', () => {
    const html = render()
    expect(html).toContain('future sessions')
    expect(/Loading presets|No presets yet/.test(html)).toBe(true)
  })
})

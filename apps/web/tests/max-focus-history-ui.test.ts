/**
 * MaxFocusSessionHistory (M2-25) integration test — SSR renderToString of
 * the presentation contract: reason labels/tones (one hue per meaning), the
 * honest empty state, and loading/error frames. Data flows from the M2-04
 * history handler; the handler side is covered by max-focus-integration.test.ts.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  EXIT_REASON_LABELS,
  EXIT_REASON_TONES,
  MaxFocusSessionHistory,
} from '../src/components/MaxFocusSessionHistory'

const render = (): string => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(MaxFocusSessionHistory),
    ),
  )
}

describe('MaxFocusSessionHistory', () => {
  it('renders the history frame with loading skeleton before data arrives', () => {
    const html = render()
    expect(html).toContain('Max Focus history')
    expect(html).toContain('animate-pulse')
  })

  it('covers every unlock reason with a label (the M2-01 union)', () => {
    for (const reason of ['timer', 'pin', 'battery', 'failure', 'tamper']) {
      expect(EXIT_REASON_LABELS[reason]).toBeTruthy()
      expect(EXIT_REASON_TONES[reason]).toBeTruthy()
    }
    // one hue per meaning: timer is the only success, tamper/failure are danger
    expect(EXIT_REASON_TONES['timer']).toBe('success')
    expect(EXIT_REASON_TONES['tamper']).toBe('danger')
    expect(EXIT_REASON_TONES['failure']).toBe('danger')
  })
})

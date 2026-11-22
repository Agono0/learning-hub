/**
 * Idle-classify dialog (S3-78) — SSR over the three verdicts (active never
 * opens, break/discard render their actions), the suppression note, and the
 * gap-minutes math. The gate math is core-tested (tasks-idle.test.ts).
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import type { IdleClassification } from '@learning-hub/core'
import {
  IdleClassifyDialog,
  gapMinutes,
  shouldPrompt,
} from '../src/components/tasks/IdleClassifyDialog'

const active: IdleClassification = {
  verdict: 'active',
  idleMs: 90_000,
  subtractMs: 0,
  suppressedBy: null,
}
const breaking: IdleClassification = {
  verdict: 'suggest-break',
  idleMs: 5 * 60_000,
  subtractMs: 0,
  suppressedBy: null,
}
const discarded: IdleClassification = {
  verdict: 'suggest-discard',
  idleMs: 12 * 60_000,
  subtractMs: 10 * 60_000,
  suppressedBy: null,
}
const suppressed: IdleClassification = { ...active, suppressedBy: 'max-focus' }

const dialog = (classification: IdleClassification): string =>
  renderToString(
    React.createElement(IdleClassifyDialog, {
      open: true,
      onClose: () => {},
      classification,
      taskTitle: 'Ship it',
      onResolve: () => {},
    }),
  ).replace(/<!-- -->/g, '')

describe('gap minutes', () => {
  it('floors at 1 for a surfaced gap', () => {
    expect(gapMinutes(30_000)).toBe(1)
    expect(gapMinutes(12 * 60_000 + 40_000)).toBe(13)
  })
})

describe('shouldPrompt', () => {
  it('active (incl. suppressed) never prompts; break/discard do', () => {
    expect(shouldPrompt(active)).toBe(false)
    expect(shouldPrompt(suppressed)).toBe(false)
    expect(shouldPrompt(breaking)).toBe(true)
    expect(shouldPrompt(discarded)).toBe(true)
  })
})

describe('IdleClassifyDialog rendering', () => {
  it('renders the gap + three actions over the tracked task', () => {
    const html = dialog(discarded)
    expect(html).toContain('Away for 12 min')
    expect(html).toContain('Ship it')
    expect(html).toContain('Keep tracking')
    expect(html).toContain('It was a break')
    expect(html).toContain('Discard 10 min of dead time')
  })

  it('hides the discard action for break-level gaps', () => {
    const html = dialog(breaking)
    expect(html).toContain('Away for 5 min')
    expect(html).not.toContain('Discard')
  })

  it('never opens for an active verdict (Sheet gated on the verdict)', () => {
    expect(dialog(active)).not.toContain('Away for')
    expect(dialog(suppressed)).not.toContain('Away for')
  })
})

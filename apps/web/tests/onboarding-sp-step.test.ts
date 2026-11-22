/**
 * Onboarding SP first-run step (S3-40) — SSR of the optional project+task
 * capture (honest placeholders, create gated on content) and the parsed
 * preview helper. The wizard splice (step 5/5, arithmetic nav) is pinned by
 * the wizard's own integration surface; the create wire path mirrors the
 * S3-20 AddTaskBar contract.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { parsedSpTask, SpFirstRunStep } from '../src/components/onboarding/SpFirstRunStep'

const TODAY = '2026-11-22'

const step = (todayIso: string | null = TODAY): string =>
  renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(SpFirstRunStep, { todayIso, onCreated: () => {} }),
    ),
  ).replace(/<!-- -->/g, '')

describe('parsedSpTask', () => {
  it('parses the short syntax against the client day', () => {
    const parsed = parsedSpTask(TODAY, 'Draft outline #thesis 45m')
    expect(parsed?.title).toBe('Draft outline')
    expect(parsed?.tags).toEqual(['thesis'])
    expect(parsed?.estimateMs).toBe(45 * 60_000)
  })

  it('returns null for empty input and pre-mount', () => {
    expect(parsedSpTask(TODAY, '')).toBeNull()
    expect(parsedSpTask(null, 'anything')).toBeNull()
  })
})

describe('SpFirstRunStep rendering', () => {
  it('renders the optional project + task fields with the grammar hint', () => {
    const html = step()
    expect(html).toContain('First project (optional)')
    expect(html).toContain('First task (optional')
    expect(html).toContain('#tag +project 10m')
    expect(html).toContain('Create project')
  })

  it('is skippable by design (the copy says so, the create is gated)', () => {
    const html = step()
    expect(html).toContain('Skip freely')
    // SSR renders the fields empty → the create button is disabled
    expect(html).toContain('disabled')
  })
})

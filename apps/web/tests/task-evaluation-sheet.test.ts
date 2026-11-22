/**
 * Evaluation sheet (S3-50) — scale definitions and tone rules, SSR of the
 * sheet (picker chips, seeded values via the metrics GET, honest disabled
 * save), over the S3-19 metricDays handler contract.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  ENERGY_SCALE,
  EvaluationSheet,
  IMPACT_SCALE,
  energyTone,
} from '../src/components/tasks/EvaluationSheet'

const TODAY = '2026-11-22'

const sheet = (): string =>
  renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(EvaluationSheet, { day: TODAY }),
    ),
  ).replace(/<!-- -->/g, '')

describe('scales', () => {
  it('impact covers 1-4 with plain-language labels', () => {
    expect(IMPACT_SCALE.map((s) => s.value)).toEqual([1, 2, 3, 4])
    expect(IMPACT_SCALE[0]?.label).toBe('Drifted')
    expect(IMPACT_SCALE[3]?.label).toBe('Deep work landed')
  })

  it('energy covers 1-3', () => {
    expect(ENERGY_SCALE.map((s) => s.value)).toEqual([1, 2, 3])
  })

  it('low energy warns, high energy accents — never danger', () => {
    expect(energyTone(1)).toBe('warning')
    expect(energyTone(2)).toBe('neutral')
    expect(energyTone(3)).toBe('accent')
  })
})

describe('EvaluationSheet rendering', () => {
  it('renders both pickers and the reflection field for the day', () => {
    const html = sheet()
    expect(html).toContain(`How did ${TODAY} land?`)
    expect(html).toContain('Impact')
    expect(html).toContain('Energy')
    expect(html).toContain('Reflection')
    expect(html).toContain('Save evaluation')
    // nothing chosen yet → the save button is disabled (calm default)
    expect(html).toContain('disabled')
  })
})

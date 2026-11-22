/**
 * Impact stars + lazy chart (S3-96) — SSR of the star fill matrix (existing
 * ImpactStars) and the LazyChart toggle contract (deferred by default,
 * ready-gated, expand/collapse in place).
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { ImpactStars, starFill } from '../src/components/tasks/ImpactStars'
import { LazyChart } from '../src/components/tasks/LazyChart'

const stars = (impact: number | null): string =>
  renderToString(React.createElement(ImpactStars, { impact })).replace(/<!-- -->/g, '')

const chart = (props: { defaultOpen?: boolean; ready?: boolean }): string =>
  renderToString(
    React.createElement(LazyChart, {
      label: 'tracked chart',
      ready: props.ready ?? true,
      defaultOpen: props.defaultOpen ?? false,
      children: React.createElement('svg', { 'data-probe': 'chart' }),
    }),
  ).replace(/<!-- -->/g, '')

describe('ImpactStars (existing, pinned)', () => {
  it('fills positionally: null hollow, 3 fills three of four', () => {
    expect(starFill(null, 1)).toBe('hollow')
    expect(starFill(3, 1)).toBe('filled')
    expect(starFill(3, 3)).toBe('filled')
    expect(starFill(3, 4)).toBe('hollow')
  })

  it('renders four stars with the a11y name carrying the number', () => {
    const html = stars(3)
    expect(html).toContain('3 of 4')
    expect((html.match(/lucide-star/g) ?? []).length).toBe(4)
  })
})

describe('LazyChart', () => {
  it('renders the visible show-affordance when closed and ready', () => {
    const html = chart({})
    expect(html).toContain('Show tracked chart')
    expect(html).not.toContain('data-probe') // the chart is deferred
  })

  it('gates on readiness — not-ready keeps nothing (honest null)', () => {
    expect(chart({ ready: false })).toBe('')
  })

  it('starts expanded when defaultOpen (day detail content)', () => {
    const html = chart({ defaultOpen: true })
    expect(html).toContain('data-probe')
    expect(html).toContain('Hide tracked chart')
  })
})

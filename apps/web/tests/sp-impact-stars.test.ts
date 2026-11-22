/**
 * Integration tests for ImpactStars (S3-96): the fill matrix across the
 * 1–4 scale and unrated, and the SSR render (a11y name carries the rating;
 * filled stars use the accent token).
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ImpactStars, starFill } from '../src/components/tasks/ImpactStars'

describe('starFill — the fill matrix', () => {
  it('fills exactly `impact` stars on the 1–4 scale', () => {
    expect([1, 2, 3, 4].map((p) => starFill(3, p))).toEqual([
      'filled',
      'filled',
      'filled',
      'hollow',
    ])
    expect([1, 2, 3, 4].map((p) => starFill(1, p))).toEqual([
      'filled',
      'hollow',
      'hollow',
      'hollow',
    ])
    expect([1, 2, 3, 4].map((p) => starFill(4, p))).toEqual([
      'filled',
      'filled',
      'filled',
      'filled',
    ])
  })

  it('unrated (null / below 1) renders all hollow', () => {
    expect([1, 2, 3, 4].map((p) => starFill(null, p))).toEqual([
      'hollow',
      'hollow',
      'hollow',
      'hollow',
    ])
    expect([1, 2, 3, 4].map((p) => starFill(0, p))).toEqual([
      'hollow',
      'hollow',
      'hollow',
      'hollow',
    ])
  })

  it('clamps over-range impact to the scale', () => {
    expect(starFill(5, 4)).toBe('filled')
  })
})

describe('ImpactStars — SSR render', () => {
  it('carries the rating in the a11y name and decorates filled stars', () => {
    const html = renderToString(React.createElement(ImpactStars, { impact: 3 }))
    expect(html).toContain('Impact: 3 of 4')
    expect(html).toContain('fill-(--ac-strong)')
  })

  it('unrated shows the honest hint', () => {
    const html = renderToString(
      React.createElement(ImpactStars, { impact: null, label: '2026-03-10' }),
    )
    expect(html).toContain('Impact: not rated')
    expect(html).toContain('2026-03-10')
  })
})

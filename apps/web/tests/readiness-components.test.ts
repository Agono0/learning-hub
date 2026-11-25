import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AssumptionsBlock } from '@/components/readiness/AssumptionsBlock'
import { ReadinessGauge } from '@/components/readiness/ReadinessGauge'
import { ReadinessTable } from '@/components/readiness/ReadinessTable'
import { pct, type GroupRow } from '@/components/readiness/types'

const row = (over: Partial<GroupRow> = {}): GroupRow => ({
  key: 'a',
  label: 'Anatomy',
  cards: 40,
  unseen: 5,
  baselineRecall: 0.61,
  plannedRecall: 0.9,
  atTarget: 0.8,
  ...over,
})

describe('readiness components', () => {
  it('formats percentages without decimals', () => {
    expect(pct(0.6149)).toBe('61%')
    expect(pct(1)).toBe('100%')
    expect(pct(0)).toBe('0%')
  })

  it('gauge shows both values as text and keeps the baseline separate', () => {
    const html = renderToStaticMarkup(
      createElement(ReadinessGauge, {
        baseline: 0.5,
        planned: 0.8,
        target: 0.85,
        unseen: 5,
        cards: 40,
      }),
    )
    expect(html).toContain('If you stop reviewing today')
    expect(html).toContain('With the review scenario')
    expect(html).toContain('50%')
    expect(html).toContain('80%')
    expect(html).toContain('35 cards you have studied')
    expect(html).toContain('5 new cards are not counted as forgotten')
  })

  it('gauge omits the new-card note when every card is studied', () => {
    const html = renderToStaticMarkup(
      createElement(ReadinessGauge, {
        baseline: 0.5,
        planned: 0.8,
        target: 0.85,
        unseen: 0,
        cards: 10,
      }),
    )
    expect(html).not.toContain('not counted as forgotten')
  })

  it('gauge widths are clamped to the rendered percentage', () => {
    const html = renderToStaticMarkup(
      createElement(ReadinessGauge, {
        baseline: 0.333,
        planned: 1,
        target: 0.9,
        unseen: 0,
        cards: 3,
      }),
    )
    expect(html).toContain('width:33%')
    expect(html).toContain('width:100%')
    expect(html).toContain('left:90%')
  })

  it('table renders one row per group and nothing when empty', () => {
    const html = renderToStaticMarkup(
      createElement(ReadinessTable, {
        title: 'By deck',
        rows: [row(), row({ key: 'b', label: 'Biochem' })],
        target: 0.85,
        testid: 't',
      }),
    )
    expect(html.match(/data-testid="t-row"/g)).toHaveLength(2)
    expect(html).toContain('90% planned')
    expect(html).toContain('61% if you stop')
    expect(html).toContain('40 cards, 5 new')
    expect(
      renderToStaticMarkup(
        createElement(ReadinessTable, { title: 'x', rows: [], target: 0.85, testid: 't' }),
      ),
    ).toBe('')
  })

  it('assumptions block lists every assumption and labels confidence as data sufficiency', () => {
    const html = renderToStaticMarkup(
      createElement(AssumptionsBlock, {
        items: ['one', 'two'],
        confidence: { level: 'low', reason: 'Only 12 studied cards.' },
      }),
    )
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
    expect(html).toContain('History: low.')
    expect(html).not.toMatch(/interval|guarantee/i)
  })
})

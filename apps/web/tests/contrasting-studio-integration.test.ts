/**
 * @file apps/web/tests/contrasting-studio-integration.test.ts
 * @description Integration tests for Contrasting Cases & Inventing with Examples Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_CONTRASTING_SETS,
  evaluateContrastingAttempt,
  type InventedMetricSubmission,
} from '@learning-hub/core/contrasting'
import { ContrastingCasesHUD } from '../src/ui/ContrastingCasesHUD'
import { ContrastingCasesStudio } from '../src/components/ContrastingCasesStudio'
import ContrastingCasesPage from '../app/contrasting/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/contrasting/route'

describe('Contrasting Cases & Inventing with Examples Web Integration', () => {
  it('renders ContrastingCasesHUD correctly in server context', () => {
    const caseSet = CANONICAL_CONTRASTING_SETS[0]!
    const submission: InventedMetricSubmission = {
      setId: caseSet.id,
      inventedMetricName: 'Packing Density Ratio',
      formulaDescription:
        'Dividing mass by volume yields density; values below 1.0 float, above 1.0 sink.',
      selectedDimensionIds: ['dim-mass-vol-ratio', 'dim-displacement-equilibrium'],
      variantRankings: [
        'cyl-balsa-disc',
        'cyl-hollow-steel',
        'cyl-oak-block',
        'cyl-neutral-gel',
        'cyl-aluminum-rod',
        'cyl-lead-bullet',
      ],
      impasseEncountered: true,
      reflectionNotes: 'Heavy oak floats while light lead sinks because of displaced water volume.',
    }

    const evaluation = evaluateContrastingAttempt(caseSet, submission)

    const html = renderToString(
      React.createElement(ContrastingCasesHUD, {
        evaluation,
        activeSetTitle: caseSet.title,
      }),
    )

    expect(html).toContain('Contrasting Differentiation Telemetry')
    expect(html).toContain('Differentiation &amp; Transfer (CDTS)')
    expect(html).toContain('Feature Discrimination (FDRS)')
    expect(html).toContain('Metric Invariance (IMI)')
    expect(html).toContain('Future Readiness (PFRI)')
    expect(html).toContain('Canonical Synthesizer')
    expect(html).toContain('Productive Impasse Primed')
  })

  it('renders ContrastingCasesStudio cleanly via SSR without crashing', () => {
    const html = renderToString(React.createElement(ContrastingCasesStudio))
    expect(html).toContain('Contrasting Differentiation Telemetry')
    expect(html).toContain('1. Contrasting Cases &amp; Discrimination')
    expect(html).toContain('2. Invent Metric / Rule')
    expect(html).toContain('3. A Time for Telling')
    expect(html).toContain('4. Far Transfer &amp; FSRS Deck')
    expect(html).toContain('Submerged Cylinder Buoyancy &amp; Density Discrimination')
  })

  it('renders ContrastingCasesPage wrapper cleanly', () => {
    const html = renderToString(React.createElement(ContrastingCasesPage))
    expect(html).toContain('container mx-auto')
    expect(html).toContain('Contrasting Cases Studio')
  })

  it('registers /contrasting in ALL_NAV_ITEMS with correct label', () => {
    const navItem = ALL_NAV_ITEMS.find((i) => i.href === '/contrasting')
    expect(navItem).toBeDefined()
    expect(navItem?.label).toBe('Contrasting Cases')
  })

  it('serves GET /api/contrasting with all 5 canonical contrasting sets', async () => {
    const res = await GET(new Request('http://localhost/api/contrasting'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.sets).toHaveLength(5)
    expect(data.sets[0].title).toContain('Submerged Cylinder Buoyancy')
  })

  it('serves POST /api/contrasting with evaluate_invention', async () => {
    const caseSet = CANONICAL_CONTRASTING_SETS[0]!
    const payload = {
      action: 'evaluate_invention',
      setId: caseSet.id,
      inventedMetricName: 'Packing Density Ratio',
      formulaDescription:
        'Dividing mass by volume yields density; values below 1.0 float, while values above 1.0 sink to bottom.',
      selectedDimensionIds: ['dim-mass-vol-ratio', 'dim-displacement-equilibrium'],
      variantRankings: [
        'cyl-balsa-disc',
        'cyl-hollow-steel',
        'cyl-oak-block',
        'cyl-neutral-gel',
        'cyl-aluminum-rod',
        'cyl-lead-bullet',
      ],
      impasseEncountered: true,
      reflectionNotes: 'Heavy oak floats while light lead sinks because of displaced water volume.',
    }

    const res = await POST(
      new Request('http://localhost/api/contrasting', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.evaluation.cdts).toBeGreaterThanOrEqual(95)
    expect(data.evaluation.fdrs).toBe(100)
    expect(data.evaluation.imi).toBe(100)
    expect(data.evaluation.rankingAccuracy).toBe(100)
    expect(data.evaluation.maturityBand).toBe('canonical_synthesizer')
  })

  it('serves POST /api/contrasting with generate_deck', async () => {
    const payload = {
      action: 'generate_deck',
      setId: 'set-density-buoyancy',
      selectedDimensionIds: ['dim-mass-vol-ratio'],
      variantRankings: [
        'cyl-balsa-disc',
        'cyl-hollow-steel',
        'cyl-oak-block',
        'cyl-neutral-gel',
        'cyl-aluminum-rod',
        'cyl-lead-bullet',
      ],
    }

    const res = await POST(
      new Request('http://localhost/api/contrasting', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const deckData = await res.json()
    expect(deckData.setId).toBe('set-density-buoyancy')
    expect(deckData.cards).toHaveLength(4)
    expect(deckData.cards[0].fsrsParameters).toBeDefined()
  })
})

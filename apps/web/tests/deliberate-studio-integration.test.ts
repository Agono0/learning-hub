/**
 * @file apps/web/tests/deliberate-studio-integration.test.ts
 * @description Integration tests for Deliberate Practice & Progressive Error Recovery Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DeliberatePracticeHUD } from '@/ui/DeliberatePracticeHUD'
import DeliberatePracticePage from '../app/deliberate/page'

describe('Deliberate Practice Studio SSR & Integration', () => {
  it('renders DeliberatePracticeHUD with ZPD frontier, error taxonomy, and deliberate effort', () => {
    const mockZPD = {
      currentTier: 'intermediate' as const,
      rollingAccuracy: 0.8,
      totalAttempts: 10,
      isOptimalZPD: true,
      recommendation: 'maintain_deliberate_sweet_spot' as const,
      guidanceMessage:
        'Optimal deliberate practice zone! Performance matches your competence frontier.',
    }

    const mockTaxonomy = {
      totalErrors: 3,
      misconceptionCount: 1,
      proceduralLapseCount: 1,
      boundaryOversightCount: 1,
      attentionalSlipCount: 0,
      predominantBugClass: 'misconception' as const,
      meanBugSeverity: 3.0,
    }

    const mockEffort = {
      totalFocusedReps: 12,
      targetedDeficitReps: 10,
      deficitTargetingRate: 0.83,
      impasseRepairsCompleted: 3,
      deliberateEffortIndex: 18.5,
      deliberateMasteryGrade: 'Proficient' as const,
    }

    const html = renderToString(
      React.createElement(DeliberatePracticeHUD, {
        zpdFrontier: mockZPD,
        errorTaxonomy: mockTaxonomy,
        deliberateEffort: mockEffort,
      }),
    )

    expect(html).toContain('Zone of Proximal Development')
    expect(html).toContain('80')
    expect(html).toContain('Accuracy')
    expect(html).toContain('Optimal ZPD Sweet Spot')
    expect(html).toContain('VanLehn Error Taxonomy')
    expect(html).toContain('caught errors')
    expect(html).toContain('Ericsson Deliberate Effort (D)')
    expect(html).toContain('18.5')
    expect(html).toContain('Proficient')
    expect(html).toContain('Positive Error Climate')
  })

  it('renders full DeliberatePracticePage SSR without crashes or errors', () => {
    const html = renderToString(React.createElement(DeliberatePracticePage))

    expect(html).toContain('Deliberate Practice &amp; Progressive Error Recovery Studio')
    expect(html).toContain('Ericsson (1993)')
    expect(html).toContain('VanLehn Impasse (1990)')
    expect(html).toContain('Keith-Frese EMT (2008)')
    expect(html).toContain('Targeted Deficit Drills')
    expect(html).toContain('Impasse-Driven Repair')
  })
})

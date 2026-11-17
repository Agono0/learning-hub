/**
 * @file apps/web/tests/flexibility-studio-integration.test.ts
 * @description Integration tests for Cognitive Flexibility & Perspective Shifting Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CognitiveFlexibilityHUD } from '@/ui/CognitiveFlexibilityHUD'
import FlexibilityPage from '../app/flexibility/page'

describe('Cognitive Flexibility Studio SSR & Integration', () => {
  it('renders CognitiveFlexibilityHUD with 6 hats, 4 lenses, and telemetry meters', () => {
    const mockEval = {
      perspectiveDispersionIndex: 0.82,
      hatCoverageCount: 5,
      lensCoverageCount: 3,
      crissCrossDensity: 0.75,
      reductiveBiasMastery: 67,
      cognitiveFlexibilityScore: 78,
      cognitiveRigidityWarning: false,
      feedbackSummary: 'High dimensional flexibility.',
    }

    const html = renderToString(
      React.createElement(CognitiveFlexibilityHUD, {
        evaluation: mockEval,
        activeHat: 'black_hat',
        activeLens: 'ecological_systemic',
      }),
    )

    expect(html).toContain('Entropy (PDI)')
    expect(html).toContain('82%')
    expect(html).toContain('Criss-Cross')
    expect(html).toContain('75%')
    expect(html).toContain('Trap Immunity')
    expect(html).toContain('67%')
    expect(html).toContain('CFT Score')
    expect(html).toContain('78')
    expect(html).toContain('100')
    expect(html).toContain('De Bono Parallel Thinking Modalities')
    expect(html).toContain('Spiro CFT Interpretive Lenses')
  })

  it('renders full FlexibilityPage SSR without hydration or markup crashes', () => {
    const html = renderToString(React.createElement(FlexibilityPage))

    expect(html).toContain('Cognitive Flexibility &amp; Perspective Shifting Studio')
    expect(html).toContain('Landscape Criss-Crossing')
    expect(html).toContain('Spiro CFT (1988)')
    expect(html).toContain('De Bono (1985)')
    expect(html).toContain('Feltovich (1989)')
    expect(html).toContain('Global Payment Gateway Cascading Retry Storm')
  })
})

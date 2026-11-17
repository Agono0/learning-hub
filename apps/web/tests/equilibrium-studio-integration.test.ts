/**
 * @file apps/web/tests/equilibrium-studio-integration.test.ts
 * @description Integration tests for Reflective Equilibrium & Epistemic Calibration Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReflectiveEquilibriumHUD } from '@/ui/ReflectiveEquilibriumHUD'
import EquilibriumPage from '../app/equilibrium/page'

describe('Reflective Equilibrium Studio SSR & Integration', () => {
  it('renders ReflectiveEquilibriumHUD with metrics and epistemic tiers', () => {
    const mockEval = {
      coherenceIndex: 85,
      unresolvedContradictionCount: 0,
      brierMetrics: {
        brierScore: 0.08,
        brierCalibrationIndex: 0.92,
        meanSubjectiveConfidence: 0.82,
        empiricalAccuracyRate: 0.8,
        overconfidenceGap: 0.02,
        calibrationGrade: 'Superforecaster' as const,
        calibrationBuckets: [],
      },
      compositeEpistemicScore: 88,
      isEquilibriumAchieved: true,
      feedbackSummary: 'Wide Reflective Equilibrium Attained.',
    }

    const html = renderToString(
      React.createElement(ReflectiveEquilibriumHUD, {
        evaluation: mockEval,
        activeTier: 'general_principle',
      }),
    )

    expect(html).toContain('Coherence (H)')
    expect(html).toContain('85%')
    expect(html).toContain('Brier Index (BCI)')
    expect(html).toContain('92%')
    expect(html).toContain('Confidence Gap')
    expect(html).toContain('Superforecaster')
    expect(html).toContain('Wide Reflective Equilibrium Attained')
    expect(html).toContain('General Principles (P)')
    expect(html).toContain('Considered Judgments (C)')
    expect(html).toContain('Background Theories (B)')
  })

  it('renders full EquilibriumPage SSR without crashes or errors', () => {
    const html = renderToString(React.createElement(EquilibriumPage))

    expect(html).toContain('Reflective Equilibrium &amp; Epistemic Calibration Studio')
    expect(html).toContain('Rawls WRE (1971)')
    expect(html).toContain('Tetlock Calibration')
    expect(html).toContain('Goodman (1955)')
    expect(html).toContain('Three Epistemic Tiers')
    expect(html).toContain('Triad Conflict Resolution')
  })
})
